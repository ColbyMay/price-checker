// Stock watcher entry point: checks each configured retailer listing and alerts Discord when one comes into stock
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { RETAILERS } = require('./retailers');
const { STATUS } = require('./parsers');
const { loadStockState, saveStockState, getListingKey, isDue, applyResult, BACKOFF_MAX_MINUTES } = require('./stockState');
const DiscordNotifier = require('../discord');

// Desktop Chrome user agent sent by the headless browser
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// Pause between retailer page loads, in milliseconds (0+)
const LISTING_DELAY_MS = 2000;

// When true, print results only: no Discord messages and no state written (`npm run stock -- --dry-run`)
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Waits for the given number of milliseconds
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Loads config.json from the repo root
 * @returns {Object} Parsed config
 */
function loadConfig() {
	return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config.json'), 'utf8'));
}

/**
 * Flattens configured products into one entry per retailer listing
 * @param {Object} stockWatch - config.stockWatch
 * @returns {Array<{productName: string, listing: Object, key: string, retailerName: string}>} Listings to watch
 */
function getListings(stockWatch) {
	return stockWatch.products.flatMap(product =>
		product.listings.map(listing => ({
			productName: product.name,
			listing,
			key: getListingKey(listing),
			retailerName: RETAILERS[listing.retailer] ? RETAILERS[listing.retailer].name : listing.retailer
		}))
	);
}

/**
 * Formats the quiet Discord note for a non-alert event
 * @param {{event: string, item: Object, result: Object, entry: Object}} change - Event details
 * @returns {string} Message text
 */
function formatNote({ event, item, result, entry }) {
	const where = `**${item.retailerName}**`;
	const link = `<${item.listing.url}>`;
	switch (event) {
		case 'sold_out':
			return `Sold out again at ${where}: ${item.productName}`;
		case 'listed':
			return `Now listed at ${where} (not in stock yet): ${item.productName} ${link}`;
		case 'third_party':
			return `${where} shows ${item.productName} from a third-party seller (${result.detail}${result.price ? ', ' + result.price : ''}). Not alerting. ${link}`;
		case 'blocked_warning':
			return `${where} check keeps failing (${entry.lastProblem}). Backing off; retrying at most every ${BACKOFF_MAX_MINUTES} minutes.`;
		case 'unblocked':
			return `${where} check is working again (status: ${entry.status}).`;
		default:
			return `${where}: ${event}`;
	}
}

/**
 * Checks every due listing in one browser session and returns the state changes worth announcing
 * @param {Array} due - Listings to check this run
 * @param {Object} state - Stock state (mutated in place)
 * @param {Object} stockWatch - config.stockWatch
 * @returns {Promise<Array>} Events to announce
 */
async function checkListings(due, state, stockWatch) {
	const events = [];
	const now = new Date();
	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});

	try {
		const page = await browser.newPage();
		await page.setUserAgent(USER_AGENT);

		for (const item of due) {
			const retailer = RETAILERS[item.listing.retailer];
			let result;

			if (!retailer) {
				result = { status: STATUS.ERROR, detail: `Unknown retailer "${item.listing.retailer}" in config` };
			} else {
				try {
					result = await retailer.check(page, item.listing);
				} catch (error) {
					result = { status: STATUS.ERROR, detail: error.message };
				}
			}

			const log = result.status === STATUS.BLOCKED || result.status === STATUS.ERROR ? console.warn : console.log;
			log(`${item.retailerName}: ${result.status} (${result.detail}${result.price ? ', ' + result.price : ''})`);

			const { entry, event } = applyResult(state.listings[item.key], result, now, {
				blockedWarningAfter: stockWatch.blockedWarningAfter || 3
			});
			state.listings[item.key] = entry;
			if (event) {
				events.push({ event, item, result, entry });
			}

			await sleep(LISTING_DELAY_MS);
		}
	} finally {
		await browser.close();
	}

	return events;
}

/**
 * Sends Discord messages for this run's events: @here for in-stock, quiet notes for the rest
 * @param {Array} events - Events from checkListings
 * @param {Object} config - Full config
 */
async function announce(events, config) {
	const token = process.env.DISCORD_BOT_TOKEN;
	if (!token) {
		throw new Error('DISCORD_BOT_TOKEN environment variable is required');
	}

	const channelName = config.stockWatch.alertChannelName;
	const notifier = new DiscordNotifier();
	await notifier.initialize(token);

	try {
		for (const change of events) {
			if (change.event === 'in_stock') {
				await notifier.sendStockAlert(channelName, {
					productName: change.item.productName,
					retailerName: change.item.retailerName,
					url: change.item.listing.url,
					detail: change.result.detail,
					price: change.result.price
				});
			} else {
				await notifier.sendStatusMessage(channelName, formatNote(change));
			}
		}
	} finally {
		await notifier.close();
	}
}

/**
 * Runs one stock check pass
 */
async function runStockWatch() {
	console.log('=== Starting Stock Watch ===');
	console.log(`Timestamp: ${new Date().toISOString()}${DRY_RUN ? ' (dry run)' : ''}`);

	const config = loadConfig();
	if (!config.stockWatch || !Array.isArray(config.stockWatch.products)) {
		throw new Error('config.json has no stockWatch.products');
	}

	const state = loadStockState();
	const listings = getListings(config.stockWatch);
	const now = new Date();
	const due = DRY_RUN ? listings : listings.filter(item => isDue(state.listings[item.key], now));

	listings
		.filter(item => !due.includes(item))
		.forEach(item => console.log(`${item.retailerName}: backing off until ${state.listings[item.key].nextCheckAfter}`));

	if (due.length === 0) {
		console.log('No listings due this run');
		if (!DRY_RUN) saveStockState(state);
		return;
	}

	const events = await checkListings(due, state, config.stockWatch);
	console.log(`Events to announce: ${events.length === 0 ? 'none' : events.map(e => `${e.item.retailerName} ${e.event}`).join(', ')}`);

	if (DRY_RUN) {
		console.log('Dry run: skipping Discord and state');
		return;
	}

	// Announce before saving: if Discord fails, the change is detected again next run instead of being lost
	if (events.length > 0 && config.discord.enabled) {
		await announce(events, config);
	}

	saveStockState(state);
	console.log('=== Stock Watch Completed ===');
}

if (require.main === module) {
	runStockWatch()
		.then(() => process.exit(0))
		.catch(error => {
			console.error('Stock watch failed:', error);
			process.exit(1);
		});
}

module.exports = {
	runStockWatch,
	formatNote,
	getListings
};
