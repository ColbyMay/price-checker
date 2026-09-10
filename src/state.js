// State persistence for tracking alerted and summarized products across runs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATE_FILE = path.join(__dirname, '..', 'state', 'notified.json');
const DEFAULT_MAX_AGE_DAYS = 14;

// State buckets: 'products' holds 70%+ alerts already sent, 'summarized' holds items already listed in an hourly summary
const BUCKETS = ['products', 'summarized'];

/**
 * Creates an empty state object
 * @returns {Object} Empty state
 */
function createEmptyState() {
	return {
		version: 2,
		lastUpdated: '',
		products: {},
		summarized: {}
	};
}

/**
 * Loads notification state from disk, upgrading version 1 files in place
 * @returns {Object} State object with products and summarized maps
 */
function loadState() {
	try {
		if (!fs.existsSync(STATE_FILE)) {
			console.log('No existing state file, starting fresh');
			return createEmptyState();
		}

		const data = fs.readFileSync(STATE_FILE, 'utf8');
		const state = JSON.parse(data);

		// Validate structure
		if (!state.products || typeof state.products !== 'object') {
			console.warn('State file has invalid structure, starting fresh');
			return createEmptyState();
		}

		// Version 1 files have no summary history
		if (!state.summarized || typeof state.summarized !== 'object') {
			state.summarized = {};
		}
		state.version = 2;

		console.log(`Loaded state: ${Object.keys(state.products).length} alerted, ${Object.keys(state.summarized).length} summarized products`);
		return state;

	} catch (error) {
		console.error('Error loading state file:', error.message);
		return createEmptyState();
	}
}

/**
 * Generates a stable key for a product based on its URL or code
 * @param {Object} product - Product object
 * @returns {string} Unique key for the product
 */
function getProductKey(product) {
	// Prefer product code (SKU) as it is the most stable identifier
	if (product.code) {
		return product.code;
	}
	// Fall back to hashing the product URL
	if (product.productUrl) {
		return crypto.createHash('md5').update(product.productUrl).digest('hex').substring(0, 12);
	}
	// Last resort: hash name + brand
	const composite = `${product.brand}-${product.name}`;
	return crypto.createHash('md5').update(composite).digest('hex').substring(0, 12);
}

/**
 * Returns every state key for a product: all colour-variant codes when grouped, else its single key
 * @param {Object} product - Product object, optionally with a `codes` array
 * @returns {Array<string>} State keys
 */
function getProductKeys(product) {
	if (Array.isArray(product.codes) && product.codes.length > 0) {
		return product.codes;
	}
	return [getProductKey(product)];
}

/**
 * Reads a product's current price as a number
 * @param {Object} product - Product object
 * @returns {number} Current price (0 if unknown)
 */
function getCurrentPrice(product) {
	return typeof product.currentPrice === 'number'
		? product.currentPrice
		: parseFloat(product.currentPrice) || 0;
}

/**
 * Checks whether a product was already sent at its current price or lower
 * Returns alreadyNotified false if the product is new or has dropped in price
 * @param {Object} product - Product object with currentPrice
 * @param {Object} state - Current state object
 * @param {string} bucket - 'products' (alerts, default) or 'summarized' (hourly summaries)
 * @returns {{ alreadyNotified: boolean, isPriceDrop: boolean }}
 */
function checkNotificationStatus(product, state, bucket = 'products') {
	const entries = getProductKeys(product)
		.map(key => state[bucket][key])
		.filter(Boolean);

	if (entries.length === 0) {
		return { alreadyNotified: false, isPriceDrop: false };
	}

	const currentPrice = getCurrentPrice(product);
	const lowestSentPrice = Math.min(...entries.map(entry => entry.notifiedPrice));

	// If the price has dropped since it was last sent, treat as new
	if (currentPrice > 0 && currentPrice < lowestSentPrice) {
		return { alreadyNotified: false, isPriceDrop: true };
	}

	// Already sent at this price or lower
	return { alreadyNotified: true, isPriceDrop: false };
}

/**
 * Records products as sent, one entry per product code
 * @param {Array} products - Products that were sent
 * @param {Object} state - Current state object (mutated in place)
 * @param {string} bucket - 'products' (alerts, default) or 'summarized' (hourly summaries)
 */
function markNotified(products, state, bucket = 'products') {
	const now = new Date().toISOString();

	for (const product of products) {
		for (const key of getProductKeys(product)) {
			state[bucket][key] = {
				name: product.name,
				brand: product.brand || 'Unknown Brand',
				notifiedPrice: getCurrentPrice(product),
				notifiedAt: now,
				lastSeen: now
			};
		}
	}

	state.lastUpdated = now;
}

/**
 * Updates lastSeen for tracked products that are still on sale (even if not re-sent)
 * @param {Array} products - All scraped products (before filtering)
 * @param {Object} state - Current state object (mutated in place)
 */
function updateLastSeen(products, state) {
	const now = new Date().toISOString();

	for (const product of products) {
		const key = getProductKey(product);
		for (const bucket of BUCKETS) {
			if (state[bucket][key]) {
				state[bucket][key].lastSeen = now;
			}
		}
	}
}

/**
 * Removes entries that have not been seen for maxAgeDays, in every bucket
 * @param {Object} state - Current state object (mutated in place)
 * @param {number} maxAgeDays - Maximum age in days before pruning (default: 14)
 * @returns {number} Number of entries pruned
 */
function pruneExpiredEntries(state, maxAgeDays = DEFAULT_MAX_AGE_DAYS) {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - maxAgeDays);
	const cutoffIso = cutoff.toISOString();

	let pruned = 0;

	for (const bucket of BUCKETS) {
		for (const [key, entry] of Object.entries(state[bucket])) {
			const lastSeen = entry.lastSeen || entry.notifiedAt || '';
			if (lastSeen && lastSeen < cutoffIso) {
				delete state[bucket][key];
				pruned++;
			}
		}
	}

	if (pruned > 0) {
		console.log(`Pruned ${pruned} expired entries (older than ${maxAgeDays} days)`);
	}

	return pruned;
}

/**
 * Saves state to disk
 * @param {Object} state - State object to save
 */
function saveState(state) {
	try {
		// Ensure state directory exists
		const stateDir = path.dirname(STATE_FILE);
		if (!fs.existsSync(stateDir)) {
			fs.mkdirSync(stateDir, { recursive: true });
		}

		const data = JSON.stringify(state, null, '\t');
		fs.writeFileSync(STATE_FILE, data, 'utf8');

		console.log(`State saved: ${Object.keys(state.products).length} alerted, ${Object.keys(state.summarized).length} summarized products`);

	} catch (error) {
		console.error('Error saving state file:', error.message);
	}
}

module.exports = {
	loadState,
	createEmptyState,
	checkNotificationStatus,
	markNotified,
	updateLastSeen,
	pruneExpiredEntries,
	saveState,
	getProductKey,
	getProductKeys
};
