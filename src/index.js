// Main entry point for the price checker bot
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { scrapeProducts } = require('./scraper');
const { filterProducts, categorizeProducts, sortProductsByPriority } = require('./filter');
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
				await discordNotifier.sendSummaryMessage(
					CONFIG.discord.summaryChannelName,
					'⚠️ **Hourly Summary** - No products found. The website might be down or the scraper needs updating.'
				);
			}
			
			return;
		}
		
		// Categorize products into high-value alerts and summary items
		const { highValueAlerts, summaryItems } = categorizeProducts(allProducts, CONFIG);
		
		// Log results
		console.log('=== Product Categorization Results ===');
		console.log(`High-value alerts (${CONFIG.monitoring.minDiscountPercent}%+): ${highValueAlerts.length}`);
		console.log(`Summary items (lower discounts): ${summaryItems.length}`);
		
		if (highValueAlerts.length > 0) {
			console.log('\n=== High-Value Alerts ===');
			highValueAlerts.forEach((product, index) => {
				console.log(`${index + 1}. ${product.brand} - ${product.name}`);
				console.log(`   Price: ${product.currentPrice} (${product.discountPercent}% off)`);
				console.log(`   Reason: ${product.matchReason}`);
				console.log(`   URL: ${product.productUrl}`);
				console.log('');
			});
		}
		
		// Send Discord notifications
		if (discordNotifier) {
			// Handle high-value alerts (70%+ discounts) - send to price-alerts with @here
			if (highValueAlerts.length > 0) {
				console.log(`Sending ${highValueAlerts.length} high-value alerts to #${CONFIG.discord.alertChannelName}`);
				
				// Send alert message with @here mention
				const alertMessage = `🚨 **High-Value Deals Found!**\n` +
					`Found **${highValueAlerts.length} item${highValueAlerts.length > 1 ? 's' : ''}** with ${CONFIG.monitoring.minDiscountPercent}%+ discounts!`;
				
				await discordNotifier.sendAlertMessage(
					CONFIG.discord.alertChannelName,
					alertMessage
				);
				
				// Send detailed product alerts to the alerts channel (with @here mentions)
				await discordNotifier.sendPriceAlerts(
					highValueAlerts,
					CONFIG.discord.alertChannelName,
					CONFIG.website.name,
					false // Not silent - include @here mentions
				);
			}
			
			// Always send hourly summary to hourly-summaries channel (silent)
			const totalRelevantItems = highValueAlerts.length + summaryItems.length;
			
			if (totalRelevantItems === 0) {
				// No relevant items found
				const brandsSeen = [...new Set(allProducts.map(p => p.brand).filter(b => b && b.length < 50))];
				const cleanBrands = brandsSeen
					.map(brand => brand.replace(/\$\d+.*$/, '').trim())
					.filter(brand => brand && brand.length > 1 && brand.length < 30)
					.slice(0, 5);
				
				const remainingCount = Math.max(0, brandsSeen.length - 5);
				let brandsText = cleanBrands.join(', ');
				if (remainingCount > 0) {
					brandsText += ` and ${remainingCount} others`;
				}
				
				const summaryMessage = `📊 **Hourly Summary**\n` +
					`📦 Found **${allProducts.length} products** from brands like: ${brandsText}\n` +
					`🎯 None meet your criteria (${CONFIG.monitoring.minDiscountPercent}%+ discount + designer/handbag)\n` +
					`⏰ Next check in 1 hour`;
				
				await discordNotifier.sendSummaryMessage(
					CONFIG.discord.summaryChannelName,
					summaryMessage
				);
			} else {
				// Create summary with both high-value and lower-discount items
				let summaryMessage = `📊 **Hourly Summary**\n` +
					`📦 Found **${allProducts.length} total products**\n`;
				
				if (highValueAlerts.length > 0) {
					summaryMessage += `🚨 **${highValueAlerts.length} high-value alert${highValueAlerts.length > 1 ? 's' : ''}** (${CONFIG.monitoring.minDiscountPercent}%+) → sent to #${CONFIG.discord.alertChannelName}\n`;
				}
				
				if (summaryItems.length > 0) {
					summaryMessage += `📋 **${summaryItems.length} other deal${summaryItems.length > 1 ? 's' : ''}** (lower discounts):\n`;
					
					// Show top 5 summary items
					const topSummaryItems = summaryItems.slice(0, 5);
					topSummaryItems.forEach((product, index) => {
						let cleanName = product.name.replace(new RegExp(`^${product.brand}\\s*`, 'i'), '').trim();
						if (cleanName.length > 25) {
							cleanName = cleanName.substring(0, 22) + '...';
						}
						const productLink = product.productUrl ? `[${cleanName}](${product.productUrl})` : cleanName;
						summaryMessage += `${index + 1}. **${product.brand}** ${productLink} - ${product.discountPercent}% off\n`;
					});
					
					if (summaryItems.length > 5) {
						summaryMessage += `... and ${summaryItems.length - 5} more\n`;
					}
				}
				
				summaryMessage += `⏰ Next check in 1 hour`;
				
				await discordNotifier.sendSummaryMessage(
					CONFIG.discord.summaryChannelName,
					summaryMessage
				);
			}
		}
		
		console.log('=== Price Check Completed Successfully ===');
		
	} catch (error) {
		console.error('Error during price check:', error);
		
		// Send error notification to Discord if possible
		if (discordNotifier) {
			try {
				await discordNotifier.sendStatusMessage(
					CONFIG.discord.summaryChannelName,
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
