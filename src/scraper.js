// Holt Renfrew sale scraper: opens the sale page once in Puppeteer, then pages the site's /results JSON API from inside the browser
const puppeteer = require('puppeteer');
const { parseApiResponse } = require('./apiParser');

// Desktop Chrome user agent sent by the headless browser
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// Pause between API requests, in milliseconds (0+); keeps the request rate polite
const REQUEST_DELAY_MS = 500;

// Pause before retrying a failed API request, in milliseconds (0+)
const RETRY_DELAY_MS = 5000;

// Safety cap on pages fetched per category (the API returns 84 products per page)
const MAX_PAGES_PER_CATEGORY = 20;

// Timeout for the initial page load that sets the site's cookies, in milliseconds
const NAVIGATION_TIMEOUT_MS = 45000;

/**
 * Waits for the given number of milliseconds
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Builds the /results API URL for one page of one sale category
 * The API pages with `page` (0-based) and silently ignores `currentPage`
 * @param {Object} website - Website config (baseUrl, saleCategory, sort)
 * @param {string} facet - storefrontFacetCategories code, e.g. "womensshoes"
 * @param {number} pageNum - 0-based page number
 * @returns {string} Absolute API URL
 */
function buildResultsUrl(website, facet, pageNum) {
	const url = new URL(`/en/c/${website.saleCategory}/results`, website.baseUrl);
	url.searchParams.set('sort', website.sort);
	url.searchParams.set('q', `:${website.sort}:storefrontFacetCategories:${facet}`);
	url.searchParams.set('grid', '2');
	url.searchParams.set('page', String(pageNum));
	return url.toString();
}

/**
 * Fetches one API page from inside the browser (reusing the site's cookies), retrying once on failure
 * @param {Object} page - Puppeteer page already on the Holt Renfrew site
 * @param {string} url - API URL to fetch
 * @returns {Promise<Object>} Raw API JSON with a results array
 * @throws {Error} If both attempts fail or return non-JSON (e.g. a Cloudflare challenge)
 */
async function fetchResultsPage(page, url) {
	for (let attempt = 1; attempt <= 2; attempt++) {
		const response = await page.evaluate(async (fetchUrl) => {
			try {
				const res = await fetch(fetchUrl, {
					headers: {
						'Accept': 'application/json',
						'X-Requested-With': 'XMLHttpRequest'
					}
				});
				const contentType = res.headers.get('content-type') || '';
				if (!res.ok || !contentType.includes('application/json')) {
					return { ok: false, status: res.status };
				}
				return { ok: true, data: await res.json() };
			} catch (e) {
				return { ok: false, status: 0, error: e.message };
			}
		}, url);

		if (response.ok && response.data && Array.isArray(response.data.results)) {
			return response.data;
		}

		console.warn(`Results request failed (attempt ${attempt}, status ${response.status}${response.error ? ', ' + response.error : ''})`);
		if (attempt === 1) {
			await sleep(RETRY_DELAY_MS);
		}
	}

	throw new Error(`Holt Renfrew API request failed twice: ${url}`);
}

/**
 * Collects every product in one sale category by walking all of its API pages
 * @param {Object} page - Puppeteer page already on the Holt Renfrew site
 * @param {Object} website - Website config
 * @param {{name: string, facet: string}} category - Category to scrape
 * @returns {Promise<{products: Array, coverage: Object}>} Unique products and a coverage report
 */
async function scrapeCategory(page, website, category) {
	const productsByCode = new Map();
	const seenCodes = new Set();
	let failedPages = 0;

	/**
	 * Adds one page of raw API data to the collected set
	 * @param {Object} data - Raw API JSON
	 * @returns {Object|null} Normalized pagination info
	 */
	const addPage = (data) => {
		data.results.forEach(item => item && item.code && seenCodes.add(item.code));
		const { products, pagination } = parseApiResponse(data);
		for (const product of products) {
			if (!productsByCode.has(product.code)) {
				productsByCode.set(product.code, { ...product, category: category.name });
			}
		}
		return pagination;
	};

	const pagination = addPage(await fetchResultsPage(page, buildResultsUrl(website, category.facet, 0)));
	const expected = pagination ? pagination.totalResults : seenCodes.size;
	const totalPages = Math.min(pagination ? pagination.totalPages : 1, MAX_PAGES_PER_CATEGORY);

	for (let pageNum = 1; pageNum < totalPages; pageNum++) {
		await sleep(REQUEST_DELAY_MS);
		try {
			addPage(await fetchResultsPage(page, buildResultsUrl(website, category.facet, pageNum)));
		} catch (error) {
			failedPages++;
			console.error(`Failed to fetch ${category.name} page ${pageNum}:`, error.message);
		}
	}

	console.log(`${category.name}: ${seenCodes.size}/${expected} products across ${totalPages} page(s)`);

	return {
		products: [...productsByCode.values()],
		coverage: {
			name: category.name,
			expected,
			collected: seenCodes.size,
			failedPages
		}
	};
}

/**
 * Scrapes every configured sale category in a single browser session
 * @param {Object} website - Website config from config.json (baseUrl, landingPath, saleCategory, sort, categories)
 * @returns {Promise<{products: Array, coverage: Array}>} Products unique by code, plus per-category coverage reports
 * @throws {Error} If no category could be scraped at all
 */
async function scrapeSaleCategories(website) {
	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});

	try {
		const page = await browser.newPage();
		await page.setUserAgent(USER_AGENT);

		// Load a real page first so Cloudflare and session cookies are in place for the API calls
		const landingUrl = new URL(website.landingPath, website.baseUrl).toString();
		console.log(`Opening ${landingUrl}`);
		try {
			await page.goto(landingUrl, { waitUntil: 'networkidle2', timeout: NAVIGATION_TIMEOUT_MS });
		} catch (error) {
			console.warn('Landing page did not settle, continuing anyway:', error.message);
		}

		const productsByCode = new Map();
		const coverage = [];

		for (const category of website.categories) {
			console.log(`\n=== Scraping ${category.name} ===`);
			try {
				const result = await scrapeCategory(page, website, category);
				coverage.push(result.coverage);
				for (const product of result.products) {
					// A product can appear in two categories; keep the first
					if (!productsByCode.has(product.code)) {
						productsByCode.set(product.code, product);
					}
				}
			} catch (error) {
				console.error(`Failed to scrape ${category.name}:`, error.message);
				coverage.push({ name: category.name, expected: null, collected: 0, failedPages: 1, error: error.message });
			}
			await sleep(REQUEST_DELAY_MS);
		}

		if (productsByCode.size === 0 && coverage.some(c => c.error)) {
			throw new Error(`Holt Renfrew API unavailable: ${coverage.map(c => c.error).filter(Boolean)[0]}`);
		}

		return { products: [...productsByCode.values()], coverage };

	} finally {
		await browser.close();
	}
}

module.exports = {
	scrapeSaleCategories,
	buildResultsUrl
};
