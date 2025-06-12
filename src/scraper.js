// Web scraper for extracting product information from Holt Renfrew sale page
const puppeteer = require('puppeteer');

/**
 * Scrapes product information from the specified URL with pagination support
 * @param {string} url - The URL to scrape
 * @param {Object} options - Scraping options
 * @param {number} options.maxPages - Maximum number of pages to scrape (default: 5)
 * @param {number} options.maxProducts - Maximum number of products to scrape (default: 500)
 * @param {Array} options.brandFilters - Array of brand names to filter by in URL
 * @returns {Promise<Array>} Array of product objects
 */
async function scrapeProducts(url, options = {}) {
	const { maxPages = 5, maxProducts = 500, brandFilters = [] } = options;
	
	// If brand filters are specified, scrape each brand individually
	if (brandFilters && brandFilters.length > 0) {
		console.log(`Scraping ${brandFilters.length} brands individually to avoid empty result issues...`);
		return await scrapeMultipleBrands(url, brandFilters, { maxPages, maxProducts });
	}
	
	console.log(`Starting product scraping with pagination (max ${maxPages} pages, ${maxProducts} products)...`);
	
	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});
	
	try {
		const page = await browser.newPage();
		
		// Set user agent to avoid detection
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
		
		let allProducts = [];
		let currentPage = 1;
		
		while (currentPage <= maxPages && allProducts.length < maxProducts) {
			console.log(`\n=== Scraping Page ${currentPage} ===`);
			
			// Construct URL with pagination parameters
			const pageUrl = addPaginationToUrl(url, currentPage);
			console.log(`Navigating to: ${pageUrl}`);
			
			await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
			
			// Wait a bit more for dynamic content to load
			await new Promise(resolve => setTimeout(resolve, 3000));
			
			// Try to scrape products from this page
			const pageProducts = await scrapeProductsFromPage(page);
			
			if (pageProducts.length === 0) {
				console.log(`No products found on page ${currentPage}, stopping pagination`);
				break;
			}
			
			console.log(`Found ${pageProducts.length} products on page ${currentPage}`);
			allProducts = allProducts.concat(pageProducts);
			
			// Check if we've reached our limit
			if (allProducts.length >= maxProducts) {
				console.log(`Reached maximum product limit (${maxProducts}), stopping`);
				allProducts = allProducts.slice(0, maxProducts);
				break;
			}
			
			// Check if there are more pages available
			const hasNextPage = await checkForNextPage(page);
			if (!hasNextPage) {
				console.log(`No more pages available after page ${currentPage}`);
				break;
			}
			
			currentPage++;
			
			// Add delay between pages to be respectful
			await new Promise(resolve => setTimeout(resolve, 2000));
		}
		
		console.log(`\n=== Pagination Complete ===`);
		console.log(`Total products scraped: ${allProducts.length} from ${currentPage} pages`);
		return allProducts;
		
	} catch (error) {
		console.error('Error during scraping:', error);
		throw error;
	} finally {
		await browser.close();
	}
}

/**
 * Scrapes multiple brands individually to avoid empty result issues
 * @param {string} baseUrl - Base URL
 * @param {Array} brandNames - Array of brand names to scrape
 * @param {Object} options - Scraping options
 * @returns {Promise<Array>} Combined array of products from all brands
 */
async function scrapeMultipleBrands(baseUrl, brandNames, options = {}) {
	const { maxPages = 2, maxProducts = 500 } = options;
	const allProducts = [];
	const maxBrands = 10; // Limit number of brands to avoid taking too long
	const brandsToScrape = brandNames.slice(0, maxBrands);
	
	console.log(`Scraping ${brandsToScrape.length} brands individually...`);
	
	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});
	
	try {
		const page = await browser.newPage();
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
		
		for (let i = 0; i < brandsToScrape.length && allProducts.length < maxProducts; i++) {
			const brand = brandsToScrape[i];
			console.log(`\n=== Scraping Brand ${i + 1}/${brandsToScrape.length}: ${brand} ===`);
			
			try {
				// Create URL for this specific brand
				const brandUrl = addSingleBrandToUrl(baseUrl, brand);
				console.log(`Brand URL: ${brandUrl}`);
				
				// Scrape first page for this brand
				await page.goto(brandUrl, { waitUntil: 'networkidle2', timeout: 30000 });
				await new Promise(resolve => setTimeout(resolve, 2000));
				
				const brandProducts = await scrapeProductsFromPage(page);
				
				if (brandProducts.length > 0) {
					console.log(`Found ${brandProducts.length} products for ${brand}`);
					allProducts.push(...brandProducts);
				} else {
					console.log(`No products found for ${brand}`);
				}
				
				// Add delay between brands to be respectful
				if (i < brandsToScrape.length - 1) {
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
				
			} catch (error) {
				console.error(`Error scraping brand ${brand}:`, error.message);
				// Continue with next brand
			}
		}
		
		console.log(`\n=== Multi-Brand Scraping Complete ===`);
		console.log(`Total products found: ${allProducts.length} from ${brandsToScrape.length} brands`);
		
		return allProducts;
		
	} catch (error) {
		console.error('Error during multi-brand scraping:', error);
		throw error;
	} finally {
		await browser.close();
	}
}

/**
 * Adds a single brand filter to URL
 * @param {string} baseUrl - Base URL
 * @param {string} brandName - Single brand name to filter by
 * @returns {string} URL with single brand filter applied
 */
function addSingleBrandToUrl(baseUrl, brandName) {
	const url = new URL(baseUrl);
	
	// Convert brand name to Holt Renfrew's URL format
	const normalizedBrand = brandName.toLowerCase()
		.replace(/\s+/g, '_')  // Replace spaces with underscores
		.replace(/[^a-z0-9_]/g, ''); // Remove special characters except underscores
	
	// Get existing query parameter and decode it
	const existingQ = decodeURIComponent(url.searchParams.get('q') || '');
	
	// Add single brand filter to the q parameter
	let newQ = existingQ;
	if (newQ && !newQ.endsWith(':')) {
		newQ += ':';
	}
	newQ += `brand:${normalizedBrand}`;
	
	url.searchParams.set('q', newQ);
	return url.toString();
}

/**
 * Adds brand filters to URL using Holt Renfrew's query format
 * @param {string} baseUrl - Base URL
 * @param {Array} brandNames - Array of brand names to filter by
 * @returns {string} URL with brand filters applied
 */
function addBrandFiltersToUrl(baseUrl, brandNames) {
	const url = new URL(baseUrl);
	
	// Limit to top priority brands to avoid URL length issues
	const priorityBrands = brandNames.slice(0, 10); // Only use first 10 brands
	console.log(`Using priority brands: ${priorityBrands.join(', ')}`);
	
	// Convert brand names to Holt Renfrew's URL format
	// Example: "Burberry" -> "brand:burberry"
	// Multiple brands: "brand:burberry:brand:chloe"
	const brandFilters = priorityBrands.map(brand => {
		// Convert to lowercase and handle special characters
		const normalizedBrand = brand.toLowerCase()
			.replace(/\s+/g, '_')  // Replace spaces with underscores
			.replace(/[^a-z0-9_]/g, ''); // Remove special characters except underscores
		
		return `brand:${normalizedBrand}`;
	}).join(':');
	
	if (brandFilters) {
		// Get existing query parameter and decode it
		const existingQ = decodeURIComponent(url.searchParams.get('q') || '');
		
		// Add brand filters to the q parameter
		// Format: q=:date-desc:brand:burberry:brand:chloe
		let newQ = existingQ;
		if (newQ && !newQ.endsWith(':')) {
			newQ += ':';
		}
		newQ += brandFilters;
		
		url.searchParams.set('q', newQ);
		console.log(`Applied brand filter URL: ${url.toString()}`);
	}
	
	return url.toString();
}

/**
 * Adds pagination parameters to URL
 * @param {string} baseUrl - Base URL
 * @param {number} pageNumber - Page number (1-based)
 * @returns {string} URL with pagination parameters
 */
function addPaginationToUrl(baseUrl, pageNumber) {
	const url = new URL(baseUrl);
	
	// Common pagination parameters to try
	const paginationParams = [
		{ key: 'page', value: pageNumber },
		{ key: 'p', value: pageNumber },
		{ key: 'offset', value: (pageNumber - 1) * 84 }, // 84 products per page
		{ key: 'start', value: (pageNumber - 1) * 84 },
		{ key: 'from', value: (pageNumber - 1) * 84 }
	];
	
	// For Holt Renfrew, try the most common e-commerce pagination patterns
	if (pageNumber > 1) {
		// Try page parameter first
		url.searchParams.set('page', pageNumber.toString());
		
		// Also try offset-based pagination
		url.searchParams.set('offset', ((pageNumber - 1) * 84).toString());
	}
	
	return url.toString();
}

/**
 * Checks if there are more pages available
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<boolean>} True if next page exists
 */
async function checkForNextPage(page) {
	try {
		// Look for common pagination indicators
		const paginationSelectors = [
			'a[aria-label*="next"]',
			'a[aria-label*="Next"]',
			'.pagination .next:not(.disabled)',
			'.pagination-next:not(.disabled)',
			'[class*="pagination"] [class*="next"]:not([class*="disabled"])',
			'[class*="Pagination"] [class*="next"]:not([class*="disabled"])',
			'.next-page:not(.disabled)',
			'button[aria-label*="next"]:not([disabled])',
			'button[aria-label*="Next"]:not([disabled])'
		];
		
		for (const selector of paginationSelectors) {
			const nextButton = await page.$(selector);
			if (nextButton) {
				console.log(`Found next page indicator: ${selector}`);
				return true;
			}
		}
		
		// Also check for page numbers to see if we're at the end
		const pageInfo = await page.evaluate(() => {
			// Look for pagination info like "Page 1 of 20" or "1-84 of 1600"
			const textContent = document.body.textContent;
			const pageMatch = textContent.match(/(\d+)\s*-\s*(\d+)\s*of\s*(\d+)/i) || 
							 textContent.match(/page\s*(\d+)\s*of\s*(\d+)/i) ||
							 textContent.match(/(\d+)\s*\/\s*(\d+)/);
			
			if (pageMatch) {
				return {
					found: true,
					current: parseInt(pageMatch[1]),
					total: parseInt(pageMatch[pageMatch.length - 1])
				};
			}
			
			return { found: false };
		});
		
		if (pageInfo.found) {
			console.log(`Page info: ${pageInfo.current} of ${pageInfo.total}`);
			return pageInfo.current < pageInfo.total;
		}
		
		console.log('No pagination indicators found');
		return false;
		
	} catch (error) {
		console.error('Error checking for next page:', error);
		return false;
	}
}

/**
 * Scrapes products from a single page
 * @param {Object} page - Puppeteer page object
 * @returns {Promise<Array>} Array of product objects from this page
 */
async function scrapeProductsFromPage(page) {
	try {
		// Wait for products to load - try multiple possible selectors
		let productSelector = null;
		const possibleSelectors = [
			'[class*="ProductTile_root"]',
			'[class*="ProductTile"]',
			'.product-tile',
			'.product-card', 
			'.product-item',
			'.product',
			'[data-product]',
			'.tile',
			'.card',
			'.item'
		];
		
		for (const selector of possibleSelectors) {
			try {
				await page.waitForSelector(selector, { timeout: 2000 });
				const count = await page.evaluate((sel) => document.querySelectorAll(sel).length, selector);
				if (count > 0) {
					productSelector = selector;
					console.log(`Found ${count} products using selector: ${selector}`);
					break;
				}
			} catch (error) {
				// Continue to next selector
			}
		}
		
		if (!productSelector) {
			// If no standard selectors work, try to find any elements that might be product containers
			console.log('No standard selectors found, searching for product containers...');
			
			// First, let's see what we can find on the page
			const debugInfo = await page.evaluate(() => {
				const allElements = document.querySelectorAll('*');
				let elementsWithPrices = 0;
				let elementsWithImages = 0;
				let elementsWithLinks = 0;
				let elementsWithProductClass = 0;
				
				for (const element of allElements) {
					const textContent = element.textContent || '';
					if (/\$\d+/.test(textContent)) elementsWithPrices++;
					if (element.querySelector('img') || element.tagName === 'IMG') elementsWithImages++;
					if (element.querySelector('a') || element.tagName === 'A') elementsWithLinks++;
					
					const className = element.className || '';
					const classNameStr = typeof className === 'string' ? className : String(className || '');
					if (classNameStr.includes('product') || classNameStr.includes('tile') || classNameStr.includes('card') || classNameStr.includes('item')) {
						elementsWithProductClass++;
					}
				}
				
				return {
					totalElements: allElements.length,
					elementsWithPrices,
					elementsWithImages,
					elementsWithLinks,
					elementsWithProductClass
				};
			});
			
			console.log('Page element analysis:', debugInfo);
			
			const foundSelector = await page.evaluate(() => {
				// Much more aggressive approach - just find elements with prices first
				const elementsWithPrices = [];
				const allElements = document.querySelectorAll('*');
				
				// Step 1: Find ALL elements with prices
				for (const element of allElements) {
					const textContent = element.textContent || '';
					const hasPrice = /\$\d+/.test(textContent);
					
					if (hasPrice) {
						elementsWithPrices.push(element);
					}
				}
				
				// Return debug info
				const debugInfo = {
					totalElements: allElements.length,
					elementsWithPrices: elementsWithPrices.length,
					firstFewPriceElements: elementsWithPrices.slice(0, 5).map(el => ({
						tagName: el.tagName,
						className: typeof el.className === 'string' ? el.className : String(el.className || ''),
						textContent: el.textContent ? el.textContent.substring(0, 100) : '',
						hasImage: !!(el.querySelector('img') || el.tagName === 'IMG'),
						hasLink: !!(el.querySelector('a') || el.tagName === 'A' || el.closest('a'))
					}))
				};
				
				// If we have price elements, try to find a good selector
				if (elementsWithPrices.length > 0) {
					// Try to find elements that also have images or links
					const betterElements = [];
					for (const element of elementsWithPrices) {
						const hasImage = element.querySelector('img') || element.tagName === 'IMG';
						const hasLink = element.querySelector('a') || element.tagName === 'A' || element.closest('a');
						
						if (hasImage || hasLink) {
							betterElements.push(element);
						}
					}
					
					debugInfo.elementsWithPricesAndMedia = betterElements.length;
					
					if (betterElements.length > 0) {
						// Use the first element to find a selector
						const firstElement = betterElements[0];
						const className = firstElement.className || '';
						const classNameStr = typeof className === 'string' ? className : String(className || '');
						
						if (classNameStr) {
							const classes = classNameStr.split(' ');
							for (const cls of classes) {
								// Look specifically for ProductTile classes or other valid CSS class names
								if (cls && (/^ProductTile_/.test(cls) || /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(cls))) {
									try {
										const matchingElements = document.querySelectorAll(`.${CSS.escape(cls)}`);
										if (matchingElements.length >= 2 && matchingElements.length <= 100) {
											debugInfo.selectedSelector = `.${cls}`;
											debugInfo.selectedSelectorCount = matchingElements.length;
											return { selector: `.${CSS.escape(cls)}`, debugInfo };
										}
									} catch (error) {
										continue;
									}
								}
							}
						}
						
						// If no class works, try tag name
						const tagName = firstElement.tagName.toLowerCase();
						const tagElements = document.querySelectorAll(tagName);
						if (tagElements.length >= 2 && tagElements.length <= 200) {
							debugInfo.selectedSelector = tagName;
							debugInfo.selectedSelectorCount = tagElements.length;
							return { selector: tagName, debugInfo };
						}
					}
				}
				
				return { selector: null, debugInfo };
			});
			
			console.log('Dynamic selector result:', foundSelector);
			
			if (foundSelector && foundSelector.selector) {
				productSelector = foundSelector.selector;
				console.log(`Found products using dynamic selector: ${foundSelector.selector}`);
				console.log('Selector debug info:', foundSelector.debugInfo);
			} else {
				if (foundSelector && foundSelector.debugInfo) {
					console.log('Failed to find selector, debug info:', foundSelector.debugInfo);
				}
				// Let's get some debugging info about the page
				const pageInfo = await page.evaluate(() => {
					const priceElements = document.querySelectorAll('*');
					let priceCount = 0;
					let imageCount = 0;
					let linkCount = 0;
					
					for (const el of priceElements) {
						if (el.textContent && /\$\d+/.test(el.textContent)) priceCount++;
						if (el.tagName === 'IMG') imageCount++;
						if (el.tagName === 'A') linkCount++;
					}
					
					return {
						title: document.title,
						url: window.location.href,
						priceElements: priceCount,
						images: imageCount,
						links: linkCount,
						bodyText: document.body ? document.body.textContent.substring(0, 500) : 'No body'
					};
				});
				
				console.log('Page debugging info:', pageInfo);
				throw new Error('Could not find any product containers on the page');
			}
		}
		
		// Extract product information with debugging
		const products = await page.evaluate((selector) => {
			const productElements = document.querySelectorAll(selector);
			const results = [];
			
			console.log(`Processing ${productElements.length} product elements`);
			
			productElements.forEach((element, index) => {
				try {
					if (index < 2) {
						console.log(`Element ${index} HTML:`, element.outerHTML.substring(0, 300));
					}
					
					// Extract product name - try multiple possible selectors
					const nameSelectors = [
						'[class*="ProductInfo"]', '[class*="product-name"]', '.product-tile__name', '.product-name', '.name', '.title', 
						'h3', 'h2', 'h4', '[data-name]', '.product-title'
					];
					let name = '';
					for (const sel of nameSelectors) {
						const nameElement = element.querySelector(sel);
						if (nameElement && nameElement.textContent.trim()) {
							name = nameElement.textContent.trim();
							if (index < 2) console.log(`Found name with selector ${sel}: ${name}`);
							break;
						}
					}
					
					// Extract brand - try multiple possible selectors
					const brandSelectors = [
						'.product-tile__brand', '.brand', '.designer', '.manufacturer',
						'[data-brand]', '.product-brand', '.brand-name'
					];
					let brand = '';
					for (const sel of brandSelectors) {
						const brandElement = element.querySelector(sel);
						if (brandElement && brandElement.textContent.trim()) {
							brand = brandElement.textContent.trim();
							break;
						}
					}
					
					// If no specific brand element, try to extract from text content
					if (!brand) {
						const textContent = element.textContent;
						const lines = textContent.split('\n').map(line => line.trim()).filter(line => line);
						// Brand is often the first line or before the product name
						if (lines.length > 0) {
							brand = lines[0];
						}
					}
					
					// Extract prices - try Holt Renfrew specific selectors first
					let currentPrice = '';
					let originalPrice = '';
					
					// Look for Holt Renfrew price structure: <div class="PriceRange_price__Oo2kz">
					const priceContainer = element.querySelector('[class*="PriceRange_price"]');
					if (priceContainer) {
						if (index < 2) console.log(`Found price container:`, priceContainer.outerHTML);
						
						// Original price: <span class="PriceRange_price--original__PFbqY">$398</span>
						const originalPriceElement = priceContainer.querySelector('[class*="price--original"]');
						if (originalPriceElement) {
							originalPrice = originalPriceElement.textContent.trim();
							if (index < 2) console.log(`Found original price: ${originalPrice}`);
						}
						
						// Current price: <span>$159</span> (the span without a specific class)
						const spans = priceContainer.querySelectorAll('span');
						for (const span of spans) {
							if (!span.className || !span.className.includes('original')) {
								const text = span.textContent.trim();
								if (/\$\d+/.test(text)) {
									currentPrice = text;
									if (index < 2) console.log(`Found current price: ${currentPrice}`);
									break;
								}
							}
						}
					}
					
					// Fallback to generic price selectors
					if (!currentPrice) {
						const currentPriceSelectors = [
							'.price-current', '.current-price', '.sale-price', '.price-sale',
							'.price', '[data-price]', '.product-price'
						];
						for (const sel of currentPriceSelectors) {
							const priceElement = element.querySelector(sel);
							if (priceElement && priceElement.textContent.trim()) {
								currentPrice = priceElement.textContent.trim();
								break;
							}
						}
					}
					
					// If still no current price, look for price patterns in text
					if (!currentPrice) {
						const priceMatch = element.textContent.match(/\$\d+(?:,\d{3})*(?:\.\d{2})?/g);
						if (priceMatch && priceMatch.length > 0) {
							// If multiple prices, the last one is usually the current price
							currentPrice = priceMatch[priceMatch.length - 1];
							if (index < 2) console.log(`Found price via regex: ${currentPrice}`);
						}
					}
					
					// Fallback for original price if not found above
					if (!originalPrice) {
						const originalPriceSelectors = [
							'.price-original', '.original-price', '.was-price', '.price-was',
							'.price-regular', '[data-original-price]', '.regular-price'
						];
						for (const sel of originalPriceSelectors) {
							const priceElement = element.querySelector(sel);
							if (priceElement && priceElement.textContent.trim()) {
								originalPrice = priceElement.textContent.trim();
								break;
							}
						}
					}
					
					// If no specific original price element, look for multiple prices
					if (!originalPrice && currentPrice) {
						const priceMatch = element.textContent.match(/\$\d+(?:,\d{3})*(?:\.\d{2})?/g);
						if (priceMatch && priceMatch.length > 1) {
							// First price is usually the original price
							originalPrice = priceMatch[0];
							// Make sure current price is different
							if (originalPrice === currentPrice && priceMatch.length > 1) {
								originalPrice = priceMatch[1];
							}
						}
					}
					
					// Extract product URL
					const linkElement = element.querySelector('a');
					let productUrl = linkElement ? linkElement.href : '';
					
					// Make sure URL is absolute
					if (productUrl && !productUrl.startsWith('http')) {
						productUrl = new URL(productUrl, window.location.origin).href;
					}
					
					// Extract image URL
					const imageElement = element.querySelector('img');
					let imageUrl = imageElement ? (imageElement.src || imageElement.dataset.src) : '';
					
					// Make sure image URL is absolute
					if (imageUrl && !imageUrl.startsWith('http')) {
						imageUrl = new URL(imageUrl, window.location.origin).href;
					}
					
					if (index < 2) {
						console.log(`Product ${index} extracted data:`, {
							name: name || 'NO NAME',
							brand: brand || 'NO BRAND',
							currentPrice: currentPrice || 'NO CURRENT PRICE',
							originalPrice: originalPrice || 'NO ORIGINAL PRICE',
							productUrl: productUrl || 'NO URL',
							imageUrl: imageUrl || 'NO IMAGE'
						});
					}
					
					if (name && currentPrice) {
						results.push({
							name,
							brand,
							currentPrice,
							originalPrice,
							productUrl,
							imageUrl,
							scrapedAt: new Date().toISOString()
						});
					}
				} catch (error) {
					console.error('Error extracting product data:', error);
				}
			});
			
			return results;
		}, productSelector);
		
		console.log(`Scraped ${products.length} products from this page`);
		return products;
		
	} catch (error) {
		console.error('Error scraping products from page:', error);
		return []; // Return empty array on error instead of throwing
	}
}

/**
 * Parses price string and returns numeric value
 * @param {string} priceString - Price string (e.g., "$299.99", "CAD $150")
 * @returns {number} Numeric price value
 */
function parsePrice(priceString) {
	if (!priceString) return 0;
	
	// Remove currency symbols and extract numbers
	const numericValue = priceString.replace(/[^\d.,]/g, '').replace(',', '');
	return parseFloat(numericValue) || 0;
}

/**
 * Calculates discount percentage between original and current price
 * @param {string} originalPrice - Original price string
 * @param {string} currentPrice - Current price string
 * @returns {number} Discount percentage
 */
function calculateDiscount(originalPrice, currentPrice) {
	const original = parsePrice(originalPrice);
	const current = parsePrice(currentPrice);
	
	if (original <= 0 || current <= 0) return 0;
	
	return Math.round(((original - current) / original) * 100);
}

module.exports = {
	scrapeProducts,
	parsePrice,
	calculateDiscount
};
