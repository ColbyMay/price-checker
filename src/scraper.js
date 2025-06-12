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
		
		// Wait for products to load
		await page.waitForSelector('.product-tile', { timeout: 10000 });
		
		// Extract product information
		const products = await page.evaluate(() => {
			const productElements = document.querySelectorAll('.product-tile');
			const results = [];
			
			productElements.forEach(element => {
				try {
					// Extract product name
					const nameElement = element.querySelector('.product-tile__name, .product-name, h3, .title');
					const name = nameElement ? nameElement.textContent.trim() : '';
					
					// Extract brand
					const brandElement = element.querySelector('.product-tile__brand, .brand, .designer');
					const brand = brandElement ? brandElement.textContent.trim() : '';
					
					// Extract current price
					const priceElement = element.querySelector('.price-current, .current-price, .sale-price');
					const currentPrice = priceElement ? priceElement.textContent.trim() : '';
					
					// Extract original price
					const originalPriceElement = element.querySelector('.price-original, .original-price, .was-price');
					const originalPrice = originalPriceElement ? originalPriceElement.textContent.trim() : '';
					
					// Extract product URL
					const linkElement = element.querySelector('a');
					const productUrl = linkElement ? linkElement.href : '';
					
					// Extract image URL
					const imageElement = element.querySelector('img');
					const imageUrl = imageElement ? imageElement.src : '';
					
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
		});
		
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
