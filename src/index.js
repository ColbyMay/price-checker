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
		
		// Scrape products from the website
		console.log(`Scraping products from: ${CONFIG.website.name}`);
		const allProducts = await scrapeProducts(CONFIG.website.url);
		
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
				await discordNotifier.sendStatusMessage(
					CONFIG.discord.channelName,
					`✅ Price check completed. Found ${allProducts.length} products but none matched your criteria.`
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
