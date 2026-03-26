// State persistence for tracking notified products across runs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATE_FILE = path.join(__dirname, '..', 'state', 'notified.json');
const DEFAULT_MAX_AGE_DAYS = 14;

/**
 * Creates an empty state object
 * @returns {Object} Empty state
 */
function createEmptyState() {
	return {
		version: 1,
		lastUpdated: '',
		products: {}
	};
}

/**
 * Loads notification state from disk
 * @returns {Object} State object with products map
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

		const productCount = Object.keys(state.products).length;
		console.log(`Loaded state: ${productCount} previously notified products`);
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
 * Checks whether a product has already been notified at its current price or higher
 * Returns false (should notify) if the product is new or has dropped in price
 * @param {Object} product - Product object with currentPrice
 * @param {Object} state - Current state object
 * @returns {{ alreadyNotified: boolean, isPriceDrop: boolean }}
 */
function checkNotificationStatus(product, state) {
	const key = getProductKey(product);
	const existing = state.products[key];

	if (!existing) {
		return { alreadyNotified: false, isPriceDrop: false };
	}

	const currentPrice = typeof product.currentPrice === 'number'
		? product.currentPrice
		: parseFloat(product.currentPrice) || 0;

	// If the price has dropped since last notification, treat as new deal
	if (currentPrice > 0 && currentPrice < existing.notifiedPrice) {
		return { alreadyNotified: false, isPriceDrop: true };
	}

	// Already notified at this price or lower
	return { alreadyNotified: true, isPriceDrop: false };
}

/**
 * Marks products as notified in the state
 * @param {Array} products - Array of product objects that were notified
 * @param {Object} state - Current state object (mutated in place)
 */
function markNotified(products, state) {
	const now = new Date().toISOString();

	for (const product of products) {
		const key = getProductKey(product);
		const currentPrice = typeof product.currentPrice === 'number'
			? product.currentPrice
			: parseFloat(product.currentPrice) || 0;

		state.products[key] = {
			name: product.name,
			brand: product.brand || 'Unknown Brand',
			notifiedPrice: currentPrice,
			notifiedAt: now,
			lastSeen: now
		};
	}

	state.lastUpdated = now;
}

/**
 * Updates lastSeen timestamp for products that are still on sale (even if not re-notified)
 * @param {Array} products - All scraped products (before filtering)
 * @param {Object} state - Current state object (mutated in place)
 */
function updateLastSeen(products, state) {
	const now = new Date().toISOString();

	for (const product of products) {
		const key = getProductKey(product);
		if (state.products[key]) {
			state.products[key].lastSeen = now;
		}
	}
}

/**
 * Removes products from state that have not been seen for maxAgeDays
 * @param {Object} state - Current state object (mutated in place)
 * @param {number} maxAgeDays - Maximum age in days before pruning (default: 14)
 * @returns {number} Number of entries pruned
 */
function pruneExpiredEntries(state, maxAgeDays = DEFAULT_MAX_AGE_DAYS) {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - maxAgeDays);
	const cutoffIso = cutoff.toISOString();

	let pruned = 0;

	for (const [key, entry] of Object.entries(state.products)) {
		const lastSeen = entry.lastSeen || entry.notifiedAt || '';
		if (lastSeen && lastSeen < cutoffIso) {
			delete state.products[key];
			pruned++;
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

		const productCount = Object.keys(state.products).length;
		console.log(`State saved: ${productCount} products tracked`);

	} catch (error) {
		console.error('Error saving state file:', error.message);
	}
}

module.exports = {
	loadState,
	checkNotificationStatus,
	markNotified,
	updateLastSeen,
	pruneExpiredEntries,
	saveState,
	getProductKey
};
