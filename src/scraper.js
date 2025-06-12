// Web scraper for extracting product information from Holt Renfrew sale page
const puppeteer = require('puppeteer');

/**
 * Scrapes product information from the specified URL
 * @param {string} url - The URL to scrape
 * @returns {Promise<Array>} Array of product objects
 */
async function scrapeProducts(url) {
	console.log('Starting product scraping...');
	
	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});
	
	try {
		const page = await browser.newPage();
		
		// Set user agent to avoid detection
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
		
		console.log(`Navigating to: ${url}`);
		await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
		
		// Wait for products to load - try multiple possible selectors
		let productSelector = null;
		const possibleSelectors = [
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
			const foundSelector = await page.evaluate(() => {
				// Look for elements that might contain product information
				const potentialContainers = document.querySelectorAll('*');
				const productContainers = [];
				
				for (const element of potentialContainers) {
					const className = element.className || '';
					const hasProductClass = className.includes('product') || 
										  className.includes('tile') || 
										  className.includes('card') || 
										  className.includes('item');
					
					// Check if element contains typical product info (price, brand, etc.)
					const hasPrice = element.textContent && /\$\d+/.test(element.textContent);
					const hasImage = element.querySelector('img');
					const hasLink = element.querySelector('a');
					
					if (hasProductClass && hasPrice && hasImage && hasLink) {
						productContainers.push(element);
					}
				}
				
				if (productContainers.length > 0) {
					// Return the most common class name pattern
					const firstContainer = productContainers[0];
					const classes = firstContainer.className.split(' ');
					for (const cls of classes) {
						if (cls && document.querySelectorAll(`.${cls}`).length >= 2) {
							return `.${cls}`;
						}
					}
				}
				
				return null;
			});
			
			if (foundSelector) {
				productSelector = foundSelector;
				console.log(`Found products using dynamic selector: ${foundSelector}`);
			} else {
				throw new Error('Could not find any product containers on the page');
			}
		}
		
		// Extract product information
		const products = await page.evaluate((selector) => {
			const productElements = document.querySelectorAll(selector);
			const results = [];
			
			productElements.forEach(element => {
				try {
					// Extract product name - try multiple possible selectors
					const nameSelectors = [
						'.product-tile__name', '.product-name', '.name', '.title', 
						'h3', 'h2', 'h4', '[data-name]', '.product-title'
					];
					let name = '';
					for (const sel of nameSelectors) {
						const nameElement = element.querySelector(sel);
						if (nameElement && nameElement.textContent.trim()) {
							name = nameElement.textContent.trim();
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
					
					// Extract current price - try multiple possible selectors
					const currentPriceSelectors = [
						'.price-current', '.current-price', '.sale-price', '.price-sale',
						'.price', '[data-price]', '.product-price'
					];
					let currentPrice = '';
					for (const sel of currentPriceSelectors) {
						const priceElement = element.querySelector(sel);
						if (priceElement && priceElement.textContent.trim()) {
							currentPrice = priceElement.textContent.trim();
							break;
						}
					}
					
					// If no specific price element, look for price patterns in text
					if (!currentPrice) {
						const priceMatch = element.textContent.match(/\$\d+(?:,\d{3})*(?:\.\d{2})?/g);
						if (priceMatch && priceMatch.length > 0) {
							// If multiple prices, the last one is usually the current price
							currentPrice = priceMatch[priceMatch.length - 1];
						}
					}
					
					// Extract original price - try multiple possible selectors
					const originalPriceSelectors = [
						'.price-original', '.original-price', '.was-price', '.price-was',
						'.price-regular', '[data-original-price]', '.regular-price'
					];
					let originalPrice = '';
					for (const sel of originalPriceSelectors) {
						const priceElement = element.querySelector(sel);
						if (priceElement && priceElement.textContent.trim()) {
							originalPrice = priceElement.textContent.trim();
							break;
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
		
		console.log(`Scraped ${products.length} products`);
		return products;
		
	} catch (error) {
		console.error('Error during scraping:', error);
		throw error;
	} finally {
		await browser.close();
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
