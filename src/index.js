// Main entry point for the Holt Renfrew sale checker: scrape, filter, dedupe against state, notify Discord
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { scrapeSaleCategories } = require('./scraper');
const { categorizeProducts } = require('./filter');
const { loadState, checkNotificationStatus, markNotified, updateLastSeen, pruneExpiredEntries, saveState } = require('./state');
const DiscordNotifier = require('./discord');

// Global configuration object
let CONFIG = {};

// Most lower-discount deals listed in one hourly summary (1+)
const SUMMARY_MAX_ITEMS = 8;

// Discord rejects messages over 2000 characters; stay under it with some headroom
const DISCORD_MESSAGE_LIMIT = 1900;

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
 * Separates products into new items and price-drop re-sends based on state
 * @param {Array} products - Filtered products that meet criteria
 * @param {Object} state - Current notification state
 * @param {string} bucket - State bucket to check: 'products' (alerts) or 'summarized' (hourly summaries)
 * @returns {{ newProducts: Array, priceDropProducts: Array, skippedCount: number }}
 */
function deduplicateAgainstState(products, state, bucket = 'products') {
	const newProducts = [];
	const priceDropProducts = [];
	let skippedCount = 0;

	for (const product of products) {
		const { alreadyNotified, isPriceDrop } = checkNotificationStatus(product, state, bucket);

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
 * Turns scraper coverage reports into human-readable warnings for categories that came back incomplete
 * @param {Array} coverage - Per-category coverage from the scraper
 * @returns {Array<string>} Warning lines (empty when every category was fully collected)
 */
function getCoverageWarnings(coverage) {
	return coverage
		.filter(c => c.error || c.failedPages > 0 || (c.expected != null && c.collected < c.expected))
		.map(c => c.error
			? `${c.name}: failed (${c.error})`
			: `${c.name}: got ${c.collected}/${c.expected} products${c.failedPages ? `, ${c.failedPages} page(s) failed` : ''}`
		);
}

/**
 * Formats one lower-discount deal as a summary line
 * @param {Object} product - Product object
 * @param {number} index - 0-based position in the list
 * @returns {string} Markdown line
 */
function formatSummaryLine(product, index) {
	const escapedBrand = (product.brand || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const brandPattern = new RegExp('^' + escapedBrand + '\\s*', 'i');
	let cleanName = product.name.replace(brandPattern, '').trim();
	if (cleanName.length > 25) {
		cleanName = cleanName.substring(0, 22) + '...';
	}
	const productLink = product.productUrl ? `[${cleanName}](${product.productUrl})` : cleanName;
	const price = product.formattedCurrentPrice || `$${product.currentPrice}`;
	const drop = product.isPriceDrop ? ' (lower price)' : '';
	return `${index + 1}. **${product.brand}** ${productLink} - ${product.discountPercent}% off, ${price}${drop}`;
}

/**
 * Builds the hourly summary message, trimming the deal list so it fits in one Discord message
 * @param {Object} parts - Message parts
 * @param {number} parts.scannedCount - Unique products scraped
 * @param {number} parts.categoryCount - Categories scraped
 * @param {number} parts.alertCount - Alerts sent this run
 * @param {Array} parts.deals - New lower-discount deals to list
 * @param {Array<string>} parts.warnings - Coverage warnings
 * @returns {string} Summary message
 */
function buildSummaryMessage({ scannedCount, categoryCount, alertCount, deals, warnings }) {
	const header = `**Hourly Summary**\nScanned **${scannedCount} products** across ${categoryCount} categories\n` +
		(alertCount > 0 ? `**${alertCount} new alert${alertCount > 1 ? 's' : ''}** sent to #${CONFIG.discord.alertChannelName}\n` : '');
	const footer = (warnings.length > 0 ? `Incomplete scrape:\n${warnings.map(w => `- ${w}`).join('\n')}\n` : '') +
		'Next check in 1 hour';

	let shown = Math.min(deals.length, SUMMARY_MAX_ITEMS);

	while (true) {
		let body = '';
		if (deals.length > 0) {
			body += `**${deals.length} new deal${deals.length > 1 ? 's' : ''}** (lower discounts):\n`;
			body += deals.slice(0, shown).map(formatSummaryLine).join('\n') + '\n';
			if (deals.length > shown) {
				body += `... and ${deals.length - shown} more\n`;
			}
		}

		const message = header + body + footer;
		if (message.length <= DISCORD_MESSAGE_LIMIT || shown === 0) {
			return message;
		}
		shown--;
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

		// Scrape every configured sale category in one browser session
		const categoryCount = CONFIG.website.categories.length;
		console.log(`\nScraping ${categoryCount} product categories...`);
		const { products: allProducts, coverage } = await scrapeSaleCategories(CONFIG.website);
		const coverageWarnings = getCoverageWarnings(coverage);

		console.log(`\n=== Combined Results ===`);
		console.log(`Unique products scraped: ${allProducts.length}`);
		coverageWarnings.forEach(warning => console.warn(`Incomplete scrape: ${warning}`));

		if (allProducts.length === 0) {
			console.warn('No products found during scraping');

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

		// Only list lower-discount deals the summary has not shown before (or that got cheaper)
		const summaryDedup = deduplicateAgainstState(summaryItems, state, 'summarized');
		const summaryToPost = [
			...summaryDedup.newProducts,
			...(renotifyOnPriceDrop ? summaryDedup.priceDropProducts : [])
		].sort((a, b) => b.discountPercent - a.discountPercent);

		console.log(`\n=== Deduplication Results ===`);
		console.log(`New products to notify: ${newProducts.length}`);
		console.log(`Price drops to re-notify: ${renotifyOnPriceDrop ? priceDropProducts.length : 0}`);
		console.log(`Already notified (skipped): ${skippedCount}`);
		console.log(`New summary deals: ${summaryToPost.length} (${summaryDedup.skippedCount} already summarized)`);

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

			// Hourly summary: only post when there is something new to say
			if (productsToNotify.length > 0 || summaryToPost.length > 0 || coverageWarnings.length > 0) {
				const summaryMessage = buildSummaryMessage({
					scannedCount: allProducts.length,
					categoryCount,
					alertCount: productsToNotify.length,
					deals: summaryToPost,
					warnings: coverageWarnings
				});

				await discordNotifier.sendSummaryMessage(
					CONFIG.discord.summaryChannelName,
					summaryMessage
				);

				markNotified(summaryToPost, state, 'summarized');
			} else {
				console.log('Nothing new since the last summary, skipping hourly summary');
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
	loadConfig,
	buildSummaryMessage,
	getCoverageWarnings
};
