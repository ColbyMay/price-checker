// Main entry point for the price checker bot
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { scrapeProducts } = require('./scraper');
const { filterProducts, sortProductsByPriority } = require('./filter');
const DiscordNotifier = require('./discord');

// Global configuration object
let CONFIG = {};

/**
 * Loads configuration from config.json file
 */
function loadConfig() {
	try {
		const configPath = path.join(__dirname, '..', 'config.json');
		const configData = fs.readFileSync(configPath, 'utf8');
		CONFIG = JSON.parse(configData);
		console.log('Configuration loaded successfully');
	} catch (error) {
		console.error('Error loading configuration:', error);
		throw error;
	}
}

/**
 * Main price checking function
 */
async function runPriceCheck() {
	console.log('=== Starting Price Check ===');
	console.log(`Timestamp: ${new Date().toISOString()}`);
	
	let discordNotifier = null;
	
	try {
		// Load configuration
		loadConfig();
		
		// Initialize Discord notifier if enabled
		if (CONFIG.discord.enabled) {
			const discordToken = process.env.DISCORD_BOT_TOKEN;
			if (!discordToken) {
				throw new Error('DISCORD_BOT_TOKEN environment variable is required');
			}
			
			discordNotifier = new DiscordNotifier();
			await discordNotifier.initialize(discordToken);
		}
		
		// Scrape products from multiple categories (bags and shoes)
		console.log(`Scraping products from: ${CONFIG.website.name}`);
		
		const allProducts = [];
		
		// Scrape shoes (300 results, ~2 pages)
		console.log('\n=== Scraping Shoes ===');
		const shoesUrl = 'https://www.holtrenfrew.com/en/Products/Womens/Collections/Sale/c/WomensSale?sort=relevance&q=%3Adate-desc%3AstorefrontFacetCategories%3AWomensShoes';
		const shoesOptions = {
			maxPages: 3, // 300 results should be ~3 pages
			maxProducts: 400 // Limit for shoes
		};
		const shoesProducts = await scrapeProducts(shoesUrl, shoesOptions);
		console.log(`Found ${shoesProducts.length} shoes products`);
		allProducts.push(...shoesProducts);
		
		// Scrape bags (150 results, ~2 pages)
		console.log('\n=== Scraping Bags ===');
		const bagsUrl = 'https://www.holtrenfrew.com/en/Products/Womens/Collections/Sale/c/WomensSale?sort=relevance&q=%3Adate-desc%3AstorefrontFacetCategories%3AWomensBags';
		const bagsOptions = {
			maxPages: 3, // 150 results should be ~2 pages
			maxProducts: 400 // Limit for bags
		};
		const bagsProducts = await scrapeProducts(bagsUrl, bagsOptions);
		console.log(`Found ${bagsProducts.length} bags products`);
		allProducts.push(...bagsProducts);
		
		console.log(`\n=== Combined Results ===`);
		console.log(`Total products from both categories: ${allProducts.length}`);
		
		if (allProducts.length === 0) {
			console.log('No products found during scraping');
			
			if (discordNotifier) {
				await discordNotifier.sendStatusMessage(
					CONFIG.discord.channelName,
					'⚠️ Price check completed but no products were found. The website might be down or the scraper needs updating.'
				);
			}
			
			return;
		}
		
		// Filter products based on criteria
		const qualifyingProducts = filterProducts(allProducts, CONFIG);
		
		if (qualifyingProducts.length === 0) {
			console.log('No products matched the filtering criteria');
			
			if (discordNotifier) {
				// Create a summary of what was found
				const brandsSeen = [...new Set(allProducts.map(p => p.brand).filter(b => b && b.length < 50))]; // Filter out long/messy brand names
				const cleanBrands = brandsSeen
					.map(brand => {
						// Clean up brand names - remove prices and extra text
						return brand.replace(/\$\d+.*$/, '').trim(); // Remove anything after a price
					})
					.filter(brand => brand && brand.length > 1 && brand.length < 30) // Keep reasonable length brands
					.slice(0, 5); // Show top 5 brands
				
				const remainingCount = Math.max(0, brandsSeen.length - 5);
				
				let brandsText = cleanBrands.join(', ');
				if (remainingCount > 0) {
					brandsText += ` and ${remainingCount} others`;
				}
				
				// Show top 10 deals sorted by discount percentage
				const productsWithDiscounts = allProducts.map(p => {
					const discount = require('./scraper').calculateDiscount(p.originalPrice, p.currentPrice);
					return { ...p, discountPercent: discount };
				}).filter(p => p.discountPercent > 0); // Only include items with valid discounts
				
				// Remove duplicates based on name and price
				const uniqueProducts = [];
				const seen = new Set();
				for (const product of productsWithDiscounts) {
					const key = `${product.name}-${product.currentPrice}-${product.originalPrice}`;
					if (!seen.has(key)) {
						seen.add(key);
						uniqueProducts.push(product);
					}
				}
				
				// Sort by highest discount first and take top 5 to keep message short
				const topDealsData = uniqueProducts
					.sort((a, b) => b.discountPercent - a.discountPercent)
					.slice(0, 5);
				
				const topDeals = topDealsData.map((p, index) => {
					// Clean up product name - remove brand prefix and keep it concise
					let cleanName = p.name.replace(new RegExp(`^${p.brand}\\s*`, 'i'), '').trim();
					if (cleanName.length > 30) {
						cleanName = cleanName.substring(0, 27) + '...';
					}
					
					// Create clickable link if URL is available
					const productLink = p.productUrl ? `[${cleanName}](${p.productUrl})` : cleanName;
					
					return `${index + 1}. **${p.brand}** ${productLink}\n${p.discountPercent}% off (${p.originalPrice} → ${p.currentPrice})`;
				}).join('\n');
				
				const summaryMessage = `✅ **Price Check Summary**\n` +
					`📦 Found **${allProducts.length} products** from brands like: ${brandsText}\n\n` +
					`**🔥 Top ${topDealsData.length} Deals (by % off):**\n${topDeals}\n\n` +
					`🎯 None meet your **${CONFIG.monitoring.minDiscountPercent}% discount** threshold\n` +
					`⏰ Next check in 1 hour`;
				
				await discordNotifier.sendStatusMessage(
					CONFIG.discord.channelName,
					summaryMessage
				);
			}
			
			return;
		}
		
		// Sort products by priority
		const sortedProducts = sortProductsByPriority(qualifyingProducts);
		
		// Log results
		console.log('=== Qualifying Products ===');
		sortedProducts.forEach((product, index) => {
			console.log(`${index + 1}. ${product.brand} - ${product.name}`);
			console.log(`   Price: ${product.currentPrice} (${product.discountPercent}% off)`);
			console.log(`   Reason: ${product.matchReason}`);
			console.log(`   URL: ${product.productUrl}`);
			console.log('');
		});
		
		// Send Discord notifications
		if (discordNotifier) {
			await discordNotifier.sendPriceAlerts(
				sortedProducts,
				CONFIG.discord.channelName,
				CONFIG.website.name
			);
		}
		
		console.log('=== Price Check Completed Successfully ===');
		
	} catch (error) {
		console.error('Error during price check:', error);
		
		// Send error notification to Discord if possible
		if (discordNotifier) {
			try {
				await discordNotifier.sendStatusMessage(
					CONFIG.discord.channelName,
					`❌ Price check failed: ${error.message}`
				);
			} catch (discordError) {
				console.error('Failed to send error notification to Discord:', discordError);
			}
		}
		
		// Re-throw error for GitHub Actions to detect failure
		throw error;
		
	} finally {
		// Clean up Discord connection
		if (discordNotifier) {
			try {
				await discordNotifier.close();
			} catch (closeError) {
				console.error('Error closing Discord connection:', closeError);
			}
		}
	}
}

/**
 * Handles process termination gracefully
 */
function setupGracefulShutdown() {
	process.on('SIGINT', () => {
		console.log('Received SIGINT, shutting down gracefully...');
		process.exit(0);
	});
	
	process.on('SIGTERM', () => {
		console.log('Received SIGTERM, shutting down gracefully...');
		process.exit(0);
	});
	
	process.on('unhandledRejection', (reason, promise) => {
		console.error('Unhandled Rejection at:', promise, 'reason:', reason);
		process.exit(1);
	});
	
	process.on('uncaughtException', (error) => {
		console.error('Uncaught Exception:', error);
		process.exit(1);
	});
}

// Set up graceful shutdown handlers
setupGracefulShutdown();

// Run the price check if this file is executed directly
if (require.main === module) {
	runPriceCheck()
		.then(() => {
			console.log('Price check completed successfully');
			process.exit(0);
		})
		.catch((error) => {
			console.error('Price check failed:', error);
			process.exit(1);
		});
}

module.exports = {
	runPriceCheck,
	loadConfig
};
