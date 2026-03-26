// Web scraper using Puppeteer network interception to capture Holt Renfrew API responses
const puppeteer = require('puppeteer');
const { parseApiResponse } = require('./apiParser');

// API path pattern used by Holt Renfrew's Hybris frontend
const API_PATH_PATTERN = '/results';

/**
 * Scrapes product information by intercepting the site's internal API calls
 * @param {string} url - The category page URL to scrape
 * @param {Object} options - Scraping options
 * @param {number} options.maxProducts - Maximum number of products to collect (default: 500)
 * @returns {Promise<Array>} Array of normalized product objects
 */
async function scrapeProducts(url, options = {}) {
	const { maxProducts = 500 } = options;

	console.log(`Scraping products via API interception (max ${maxProducts})...`);
	console.log(`URL: ${url}`);

	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});

	try {
		const page = await browser.newPage();
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

		// Step 1: Navigate and intercept the first API response
		const firstPageData = await interceptProductApi(page, url);

		if (!firstPageData) {
			console.warn('API interception failed, attempting DOM fallback...');
			const fallbackProducts = await fallbackDomScrape(page);
			return fallbackProducts.slice(0, maxProducts);
		}

		const { products, pagination } = parseApiResponse(firstPageData);
		console.log(`Page 0: ${products.length} products (${pagination ? pagination.totalResults : '?'} total on site)`);

		const allProducts = [...products];

		// Step 2: Fetch remaining pages if pagination exists
		if (pagination && pagination.totalPages > 1) {
			const pagesToFetch = Math.min(
				pagination.totalPages - 1,
				Math.ceil(maxProducts / pagination.pageSize)
			);
			console.log(`Fetching ${pagesToFetch} more pages (${pagination.totalPages} total)...`);

			// Build the API base URL from the intercepted response
			const apiBaseUrl = buildApiUrl(url);

			for (let pageNum = 1; pageNum <= pagesToFetch && allProducts.length < maxProducts; pageNum++) {
				try {
					const pageData = await fetchApiPage(page, apiBaseUrl, pageNum);
					if (pageData) {
						const { products: pageProducts } = parseApiResponse(pageData);
						allProducts.push(...pageProducts);
						console.log(`Page ${pageNum}: +${pageProducts.length} products (total: ${allProducts.length})`);
					}
				} catch (error) {
					console.error(`Error fetching page ${pageNum}:`, error.message);
				}
			}
		}

		const trimmed = allProducts.slice(0, maxProducts);
		console.log(`Scraping complete: ${trimmed.length} products collected`);
		return trimmed;

	} catch (error) {
		console.error('Scraping error:', error);
		throw error;
	} finally {
		await browser.close();
	}
}

/**
 * Navigates to a page and intercepts the product listing API response
 * @param {Object} page - Puppeteer page object
 * @param {string} url - URL to navigate to
 * @returns {Promise<Object|null>} Raw API JSON response or null if not captured
 */
async function interceptProductApi(page, url) {
	return new Promise(async (resolve) => {
		let resolved = false;

		const responseHandler = async (response) => {
			if (resolved) return;

			const responseUrl = response.url();
			const contentType = response.headers()['content-type'] || '';

			// Match the Hybris product search API endpoint
			if (responseUrl.includes(API_PATH_PATTERN) && contentType.includes('application/json')) {
				try {
					const body = await response.text();
					const data = JSON.parse(body);

					// Verify this is actually a product listing response
					if (data.results && Array.isArray(data.results) && data.pagination) {
						resolved = true;
						page.off('response', responseHandler);
						resolve(data);
					}
				} catch (e) {
					// Not the response we want, continue listening
				}
			}
		};

		page.on('response', responseHandler);

		try {
			await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
		} catch (error) {
			console.error('Navigation error:', error.message);
		}

		// Give a few extra seconds for the API call to fire
		setTimeout(() => {
			if (!resolved) {
				page.off('response', responseHandler);
				resolve(null);
			}
		}, 10000);
	});
}

/**
 * Builds the internal API URL from a category page URL
 * The site maps /Products/Womens/Collections/Sale/c/WomensSale?... to /en/c/WomensSale/results?...
 * @param {string} pageUrl - The category page URL
 * @returns {string} The API URL for fetching results
 */
function buildApiUrl(pageUrl) {
	const url = new URL(pageUrl);
	// Extract the category code from the path (e.g., WomensSale)
	const categoryMatch = url.pathname.match(/\/c\/([^/?]+)/);
	const category = categoryMatch ? categoryMatch[1] : 'WomensSale';

	// Build the API URL with existing query params
	const apiUrl = new URL(`${url.origin}/en/c/${category}/results`);

	// Copy over search params
	for (const [key, value] of url.searchParams) {
		apiUrl.searchParams.set(key, value);
	}

	// Ensure grid param is set (required by the API)
	if (!apiUrl.searchParams.has('grid')) {
		apiUrl.searchParams.set('grid', '2');
	}

	return apiUrl.toString();
}

/**
 * Fetches a specific page from the API using the browser context (inherits cookies/headers)
 * @param {Object} page - Puppeteer page object
 * @param {string} apiBaseUrl - The API base URL
 * @param {number} pageNum - Page number to fetch (0-based)
 * @returns {Promise<Object|null>} Raw API JSON response or null
 */
async function fetchApiPage(page, apiBaseUrl, pageNum) {
	const url = new URL(apiBaseUrl);
	url.searchParams.set('currentPage', pageNum.toString());

	const response = await page.evaluate(async (fetchUrl) => {
		try {
			const res = await fetch(fetchUrl, {
				headers: {
					'Accept': 'application/json',
					'X-Requested-With': 'XMLHttpRequest'
				}
			});
			if (!res.ok) return null;
			return await res.json();
		} catch (e) {
			return null;
		}
	}, url.toString());

	return response;
}

/**
 * Fallback DOM-based scraper when API interception fails
 * Extracts product data directly from the rendered page
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<Array>} Array of product objects from DOM
 */
async function fallbackDomScrape(page) {
	console.warn('Using DOM fallback scraper - results may be incomplete');

	const products = await page.evaluate(() => {
		const results = [];
		// Find all elements that contain a price
		const allElements = document.querySelectorAll('[class*="ProductTile"], .product-tile, .product-card');

		allElements.forEach(element => {
			try {
				const nameEl = element.querySelector('[class*="ProductInfo"], h3, h2, .product-name, .name');
				const name = nameEl ? nameEl.textContent.trim() : '';

				const priceMatches = element.textContent.match(/\$\d+(?:,\d{3})*(?:\.\d{2})?/g);
				const currentPrice = priceMatches ? priceMatches[priceMatches.length - 1] : '';
				const originalPrice = priceMatches && priceMatches.length > 1 ? priceMatches[0] : currentPrice;

				const linkEl = element.querySelector('a');
				const productUrl = linkEl ? linkEl.href : '';

				const imgEl = element.querySelector('img');
				const imageUrl = imgEl ? (imgEl.src || imgEl.dataset.src || '') : '';

				if (name && currentPrice) {
					results.push({
						code: '',
						name,
						brand: 'Unknown Brand',
						currentPrice: parseFloat(currentPrice.replace(/[^\d.]/g, '')) || 0,
						originalPrice: parseFloat(originalPrice.replace(/[^\d.]/g, '')) || 0,
						formattedCurrentPrice: currentPrice,
						formattedOriginalPrice: originalPrice,
						discountPercent: 0,
						productUrl,
						imageUrl,
						category: '',
						scrapedAt: new Date().toISOString()
					});
				}
			} catch (e) {
				// Skip this element
			}
		});

		return results;
	});

	// Calculate discount percentages for fallback products
	products.forEach(p => {
		if (p.originalPrice > 0 && p.currentPrice > 0 && p.originalPrice > p.currentPrice) {
			p.discountPercent = Math.round(((p.originalPrice - p.currentPrice) / p.originalPrice) * 100);
		}
	});

	console.log(`DOM fallback found ${products.length} products`);
	return products;
}

/**
 * Parses price string and returns numeric value
 * @param {string} priceString - Price string (e.g., "$299.99", "CAD $150")
 * @returns {number} Numeric price value
 */
function parsePrice(priceString) {
	if (!priceString) return 0;
	if (typeof priceString === 'number') return priceString;
	const numericValue = priceString.replace(/[^\d.,]/g, '').replace(',', '');
	return parseFloat(numericValue) || 0;
}

/**
 * Calculates discount percentage between original and current price
 * @param {string|number} originalPrice - Original price
 * @param {string|number} currentPrice - Current price
 * @returns {number} Discount percentage
 */
function calculateDiscount(originalPrice, currentPrice) {
	const original = typeof originalPrice === 'number' ? originalPrice : parsePrice(originalPrice);
	const current = typeof currentPrice === 'number' ? currentPrice : parsePrice(currentPrice);
	if (original <= 0 || current <= 0) return 0;
	return Math.round(((original - current) / original) * 100);
}

module.exports = {
	scrapeProducts,
	parsePrice,
	calculateDiscount
};
