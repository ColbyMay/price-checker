// Main entry point for the price checker bot
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { scrapeProducts } = require('./scraper');
const { categorizeProducts } = require('./filter');
const { loadState, checkNotificationStatus, markNotified, updateLastSeen, pruneExpiredEntries, saveState } = require('./state');
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
 * Separates products into new alerts and price-drop re-alerts based on notification state
 * @param {Array} products - Filtered products that meet criteria
 * @param {Object} state - Current notification state
 * @returns {{ newProducts: Array, priceDropProducts: Array, skippedCount: number }}
 */
function deduplicateAgainstState(products, state) {
	const newProducts = [];
	const priceDropProducts = [];
	let skippedCount = 0;

	for (const product of products) {
		const { alreadyNotified, isPriceDrop } = checkNotificationStatus(product, state);

		if (isPriceDrop) {
			product.isPriceDrop = true;
			priceDropProducts.push(product);
		} else if (!alreadyNotified) {
			newProducts.push(product);
		} else {
			skippedCount++;
		}
	}

	return { newProducts, priceDropProducts, skippedCount };
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

		// Load notification state for deduplication
		const state = loadState();
		const maxAgeDays = (CONFIG.state && CONFIG.state.maxAgeDays) || 14;
		pruneExpiredEntries(state, maxAgeDays);

		// Initialize Discord notifier if enabled
		if (CONFIG.discord.enabled) {
			const discordToken = process.env.DISCORD_BOT_TOKEN;
			if (!discordToken) {
				throw new Error('DISCORD_BOT_TOKEN environment variable is required');
			}

			discordNotifier = new DiscordNotifier();
			await discordNotifier.initialize(discordToken);
		}

		// Define categories to scrape
		const CATEGORY_URLS = [
			{
				name: 'Shoes',
				url: 'https://www.holtrenfrew.com/en/Products/Womens/Collections/Sale/c/WomensSale?sort=relevance&q=%3Adate-desc%3AstorefrontFacetCategories%3AWomensShoes',
				maxProducts: 400
			},
			{
				name: 'Bags',
				url: 'https://www.holtrenfrew.com/en/Products/Womens/Collections/Sale/c/WomensSale?sort=relevance&q=%3Adate-desc%3AstorefrontFacetCategories%3AWomensBags',
				maxProducts: 400
			},
			{
				name: 'Jewelry & Watches',
				url: 'https://www.holtrenfrew.com/en/Products/Womens/Collections/Sale/c/WomensSale?sort=relevance&q=%3Adate-desc%3AstorefrontFacetCategories%3AWomensJewellery',
				maxProducts: 300
			},
			{
				name: 'Accessories',
				url: 'https://www.holtrenfrew.com/en/Products/Womens/Collections/Sale/c/WomensSale?sort=relevance&q=%3Adate-desc%3AstorefrontFacetCategories%3AWomensAccessories',
				maxProducts: 200
			}
		];

		// Scrape all categories
		console.log(`\nScraping ${CATEGORY_URLS.length} product categories...`);
		const allProducts = [];

		for (const category of CATEGORY_URLS) {
			console.log(`\n=== Scraping ${category.name} ===`);
			const categoryProducts = await scrapeProducts(category.url, {
				maxProducts: category.maxProducts
			});
			console.log(`Found ${categoryProducts.length} ${category.name.toLowerCase()} products`);
			allProducts.push(...categoryProducts);
		}

		console.log(`\n=== Combined Results ===`);
		console.log(`Total products scraped: ${allProducts.length}`);

		if (allProducts.length === 0) {
			console.log('No products found during scraping');

			if (discordNotifier) {
				await discordNotifier.sendSummaryMessage(
					CONFIG.discord.summaryChannelName,
					'Warning: No products found. The website might be down or the scraper needs updating.'
				);
			}

			saveState(state);
			return;
		}

		// Update lastSeen for all scraped products (even ones we won't notify about)
		updateLastSeen(allProducts, state);

		// Categorize products into high-value alerts and summary items
		const { highValueAlerts, summaryItems } = categorizeProducts(allProducts, CONFIG);

		console.log('=== Product Categorization Results ===');
		console.log(`High-value alerts (${CONFIG.monitoring.minDiscountPercent}%+): ${highValueAlerts.length}`);
		console.log(`Summary items (lower discounts): ${summaryItems.length}`);

		// Deduplicate high-value alerts against notification state
		const renotifyOnPriceDrop = !CONFIG.state || CONFIG.state.renotifyOnPriceDrop !== false;
		const {
			newProducts,
			priceDropProducts,
			skippedCount
		} = deduplicateAgainstState(highValueAlerts, state);

		console.log(`\n=== Deduplication Results ===`);
		console.log(`New products to notify: ${newProducts.length}`);
		console.log(`Price drops to re-notify: ${renotifyOnPriceDrop ? priceDropProducts.length : 0}`);
		console.log(`Already notified (skipped): ${skippedCount}`);

		// Combine products to notify
		const productsToNotify = [
			...newProducts,
			...(renotifyOnPriceDrop ? priceDropProducts : [])
		];

		if (productsToNotify.length > 0) {
			console.log('\n=== Products to Notify ===');
			productsToNotify.forEach((product, index) => {
				const tag = product.isPriceDrop ? ' [PRICE DROP]' : ' [NEW]';
				console.log(`${index + 1}. ${product.brand} - ${product.name}${tag}`);
				console.log(`   Price: ${product.formattedCurrentPrice || '$' + product.currentPrice} (${product.discountPercent}% off)`);
				console.log(`   Reason: ${product.matchReason}`);
				console.log(`   URL: ${product.productUrl}`);
				console.log('');
			});
		}

		// Send Discord notifications
		if (discordNotifier) {
			// Send high-value alerts (new + price drops)
			if (productsToNotify.length > 0) {
				console.log(`Sending ${productsToNotify.length} alerts to #${CONFIG.discord.alertChannelName}`);

				const alertMessage = `**${productsToNotify.length === 1 ? 'New Deal Found!' : productsToNotify.length + ' New Deals Found!'}**\n` +
					`${newProducts.length > 0 ? newProducts.length + ' new item' + (newProducts.length > 1 ? 's' : '') : ''}` +
					`${newProducts.length > 0 && priceDropProducts.length > 0 ? ', ' : ''}` +
					`${priceDropProducts.length > 0 ? priceDropProducts.length + ' further reduced' : ''}` +
					` with ${CONFIG.monitoring.minDiscountPercent}%+ discounts!`;

				await discordNotifier.sendAlertMessage(
					CONFIG.discord.alertChannelName,
					alertMessage
				);

				await discordNotifier.sendPriceAlerts(
					productsToNotify,
					CONFIG.discord.alertChannelName,
					CONFIG.website.name,
					false
				);

				// Mark all notified products in state
				markNotified(productsToNotify, state);
			}

			// Send hourly summary
			const totalRelevantItems = highValueAlerts.length + summaryItems.length;

			if (totalRelevantItems === 0) {
				const summaryMessage = `**Hourly Summary**\n` +
					`Scanned **${allProducts.length} products** across ${CATEGORY_URLS.length} categories\n` +
					`None meet criteria (${CONFIG.monitoring.minDiscountPercent}%+ discount + designer/category match)\n` +
					`Next check in 1 hour`;

				await discordNotifier.sendSummaryMessage(
					CONFIG.discord.summaryChannelName,
					summaryMessage
				);
			} else {
				let summaryMessage = `**Hourly Summary**\n` +
					`Scanned **${allProducts.length} products** across ${CATEGORY_URLS.length} categories\n`;

				if (productsToNotify.length > 0) {
					summaryMessage += `**${productsToNotify.length} new alert${productsToNotify.length > 1 ? 's' : ''}** sent to #${CONFIG.discord.alertChannelName}\n`;
				}

				if (skippedCount > 0) {
					summaryMessage += `${skippedCount} already-notified item${skippedCount > 1 ? 's' : ''} skipped\n`;
				}

				if (summaryItems.length > 0) {
					// Deduplicate summary items
					const uniqueSummaryItems = [];
					const seen = new Set();
					for (const product of summaryItems) {
						const key = `${product.brand}-${product.name}-${product.discountPercent}`;
						if (!seen.has(key)) {
							seen.add(key);
							uniqueSummaryItems.push(product);
						}
					}

					summaryMessage += `**${uniqueSummaryItems.length} other deal${uniqueSummaryItems.length > 1 ? 's' : ''}** (lower discounts):\n`;

					const topSummaryItems = uniqueSummaryItems.slice(0, 5);
					topSummaryItems.forEach((product, index) => {
						let cleanName = product.name.replace(new RegExp(`^${product.brand}\\s*`, 'i'), '').trim();
						if (cleanName.length > 25) {
							cleanName = cleanName.substring(0, 22) + '...';
						}
						const productLink = product.productUrl ? `[${cleanName}](${product.productUrl})` : cleanName;
						summaryMessage += `${index + 1}. **${product.brand}** ${productLink} - ${product.discountPercent}% off\n`;
					});

					if (uniqueSummaryItems.length > 5) {
						summaryMessage += `... and ${uniqueSummaryItems.length - 5} more\n`;
					}
				}

				summaryMessage += `Next check in 1 hour`;

				await discordNotifier.sendSummaryMessage(
					CONFIG.discord.summaryChannelName,
					summaryMessage
				);
			}
		}

		// Save state (even if no notifications were sent, to update lastSeen)
		saveState(state);

		console.log('=== Price Check Completed Successfully ===');

	} catch (error) {
		console.error('Error during price check:', error);

		if (discordNotifier) {
			try {
				await discordNotifier.sendStatusMessage(
					CONFIG.discord.summaryChannelName,
					`Price check failed: ${error.message}`
				);
			} catch (discordError) {
				console.error('Failed to send error notification to Discord:', discordError);
			}
		}

		throw error;

	} finally {
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

setupGracefulShutdown();

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
