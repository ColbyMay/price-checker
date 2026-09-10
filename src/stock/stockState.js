// Stock watcher state (state/stock.json): last status per listing, block backoff, and which changes to announce
const fs = require('fs');
const path = require('path');
const { STATUS } = require('./parsers');

const STATE_FILE = path.join(__dirname, '..', '..', 'state', 'stock.json');

// Backoff after a blocked or failed check: first wait, in minutes (doubles each time)
const BACKOFF_BASE_MINUTES = 10;

// Longest backoff between checks of a blocked retailer, in minutes
const BACKOFF_MAX_MINUTES = 120;

/**
 * Creates an empty stock state
 * @returns {{version: number, listings: Object}} Empty state
 */
function createEmptyStockState() {
	return { version: 1, listings: {} };
}

/**
 * Loads stock state from disk (restored from the GitHub Actions cache in CI)
 * @returns {Object} Stock state
 */
function loadStockState() {
	try {
		if (!fs.existsSync(STATE_FILE)) {
			console.log('No stock state file, starting fresh');
			return createEmptyStockState();
		}
		const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
		if (!state.listings || typeof state.listings !== 'object') {
			console.warn('Stock state has invalid structure, starting fresh');
			return createEmptyStockState();
		}
		return state;
	} catch (error) {
		console.error('Error loading stock state:', error.message);
		return createEmptyStockState();
	}
}

/**
 * Saves stock state to disk
 * @param {Object} state - Stock state
 */
function saveStockState(state) {
	fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
	fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, '\t'), 'utf8');
	console.log(`Stock state saved: ${Object.keys(state.listings).length} listings`);
}

/**
 * Builds the state key for one retailer listing of one product
 * @param {{retailer: string, sku?: string, url: string}} listing - Listing config
 * @returns {string} Stable key
 */
function getListingKey(listing) {
	return `${listing.retailer}:${listing.sku || listing.url}`;
}

/**
 * Checks whether a listing is due, i.e. not inside a block backoff window
 * @param {Object|undefined} entry - Listing state entry
 * @param {Date} now - Current time
 * @returns {boolean} True if the listing should be checked this run
 */
function isDue(entry, now) {
	return !entry || !entry.nextCheckAfter || now.getTime() >= Date.parse(entry.nextCheckAfter);
}

/**
 * Applies one check result to a listing's state and decides what, if anything, to announce
 * Events: 'in_stock' (@here alert), 'sold_out', 'listed', 'third_party', 'blocked_warning', 'unblocked' (quiet notes)
 * @param {Object|undefined} previous - Previous state entry
 * @param {{status: string, detail: string, price?: string}} result - Check result
 * @param {Date} now - Current time
 * @param {{blockedWarningAfter: number}} options - Consecutive failures before a quiet warning (1+)
 * @returns {{entry: Object, event: string|null}} Updated entry and the event to announce
 */
function applyResult(previous, result, now, { blockedWarningAfter }) {
	const prev = previous || { status: null, blockedCount: 0 };
	const nowIso = now.toISOString();
	const entry = { ...prev, lastChecked: nowIso };

	// Blocked or broken: keep the last known stock status, back off, warn once
	if (result.status === STATUS.BLOCKED || result.status === STATUS.ERROR) {
		entry.blockedCount = (prev.blockedCount || 0) + 1;
		const delayMinutes = Math.min(BACKOFF_BASE_MINUTES * 2 ** (entry.blockedCount - 1), BACKOFF_MAX_MINUTES);
		entry.nextCheckAfter = new Date(now.getTime() + delayMinutes * 60000).toISOString();
		entry.lastProblem = `${result.status}: ${result.detail}`;
		return { entry, event: entry.blockedCount === blockedWarningAfter ? 'blocked_warning' : null };
	}

	const wasWarned = (prev.blockedCount || 0) >= blockedWarningAfter;
	entry.blockedCount = 0;
	entry.nextCheckAfter = null;
	entry.lastProblem = null;
	entry.detail = result.detail;
	entry.price = result.price || prev.price || null;

	const changed = prev.status !== result.status;
	if (changed) {
		entry.status = result.status;
		entry.since = nowIso;
	}

	let event = null;
	if (changed) {
		if (result.status === STATUS.IN_STOCK) {
			event = 'in_stock';
		} else if (prev.status === STATUS.IN_STOCK) {
			event = 'sold_out';
		} else if (result.status === STATUS.THIRD_PARTY) {
			event = 'third_party';
		} else if (prev.status === STATUS.NOT_LISTED && result.status === STATUS.OUT_OF_STOCK) {
			event = 'listed';
		}
	}
	if (!event && wasWarned) {
		event = 'unblocked';
	}

	return { entry, event };
}

module.exports = {
	createEmptyStockState,
	loadStockState,
	saveStockState,
	getListingKey,
	isDue,
	applyResult,
	BACKOFF_MAX_MINUTES
};
