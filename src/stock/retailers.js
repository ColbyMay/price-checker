// Retailer adapters: load a listing in the shared Puppeteer page and return a normalized stock result
const {
	STATUS,
	detectBlock,
	parseNintendoNextData,
	parseBestBuyAvailability,
	parseWalmartNextData,
	parseJsonLdAvailability
} = require('./parsers');

// Timeout for loading one product page or API response, in milliseconds
const PAGE_TIMEOUT_MS = 45000;

// Desktop Chrome user agent for plain HTTPS requests (matches the headless browser's)
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// Extra wait after the HTML loads so late scripts and bot checks can render, in milliseconds
const SETTLE_DELAY_MS = 1500;

/**
 * Waits for the given number of milliseconds
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Loads a URL and captures what is needed to tell a product page from a block page
 * @param {Object} page - Puppeteer page
 * @param {string} url - Page to load
 * @returns {Promise<{status: number, title: string, bodyText: string}>} HTTP status, title and visible text
 */
async function loadPage(page, url) {
	const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
	await sleep(SETTLE_DELAY_MS);
	return {
		status: response ? response.status() : 0,
		title: await page.title(),
		bodyText: await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 3000) : ''))
	};
}

/**
 * Reads and parses the Next.js __NEXT_DATA__ JSON from the current page
 * @param {Object} page - Puppeteer page
 * @returns {Promise<Object|null>} Parsed data or null if absent
 */
function readNextData(page) {
	return page.evaluate(() => {
		const el = document.getElementById('__NEXT_DATA__');
		try {
			return el ? JSON.parse(el.textContent) : null;
		} catch (e) {
			return null;
		}
	});
}

/**
 * Reads the raw contents of every JSON-LD script on the current page
 * @param {Object} page - Puppeteer page
 * @returns {Promise<Array<string>>} Script contents
 */
function readJsonLd(page) {
	return page.evaluate(() =>
		[...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent)
	);
}

/**
 * Builds the result for a page that turned out to be a bot check
 * @param {{status: number, title: string}} loaded - Loaded page info
 * @returns {{status: string, detail: string}} Blocked result
 */
function blockedResult(loaded) {
	return { status: STATUS.BLOCKED, detail: `Bot check or access denied (HTTP ${loaded.status}, "${(loaded.title || '').slice(0, 60)}")` };
}

/**
 * Checks a Nintendo Store product page; a "Whoops" / 404 page means the store does not list it yet
 * @param {Object} page - Puppeteer page
 * @param {{url: string, sku: string}} listing - Listing config
 * @returns {Promise<Object>} Stock result
 */
async function checkNintendo(page, listing) {
	const loaded = await loadPage(page, listing.url);
	if (detectBlock(loaded)) return blockedResult(loaded);
	if (loaded.status === 404 || /whoops/i.test(loaded.title)) {
		return { status: STATUS.NOT_LISTED, detail: 'Not listed in this store yet' };
	}

	const nextData = await readNextData(page);
	if (!nextData) return { status: STATUS.ERROR, detail: 'No __NEXT_DATA__ on page' };
	return parseNintendoNextData(nextData, listing.sku);
}

/**
 * Checks Best Buy Canada through its public availability API with a plain HTTPS request
 * Best Buy's product pages return 403 to headless Chromium, but this JSON endpoint answers normal requests
 * @param {Object} page - Puppeteer page (unused; kept so every checker has the same signature)
 * @param {{url: string, sku: string}} listing - Listing config
 * @returns {Promise<Object>} Stock result
 */
async function checkBestBuy(page, listing) {
	const apiUrl = 'https://www.bestbuy.ca/ecomm-api/availability/products' +
		'?accept=application%2Fvnd.bestbuy.standardproduct.v1%2Bjson&accept-language=en-CA' +
		`&skus=${encodeURIComponent(listing.sku)}`;

	let response;
	try {
		const res = await fetch(apiUrl, {
			headers: {
				'Accept': 'application/json',
				'Accept-Language': 'en-CA',
				'User-Agent': USER_AGENT
			},
			signal: AbortSignal.timeout(PAGE_TIMEOUT_MS)
		});
		response = { status: res.status, text: await res.text() };
	} catch (e) {
		response = { status: 0, text: '', error: e.message };
	}

	if (response.status === 403 || response.status === 429) {
		return { status: STATUS.BLOCKED, detail: `Availability API returned HTTP ${response.status}` };
	}
	if (response.status !== 200) {
		return { status: STATUS.ERROR, detail: `Availability API returned HTTP ${response.status}${response.error ? ' (' + response.error + ')' : ''}` };
	}

	let json;
	try {
		// trim() also removes the byte-order mark Best Buy prefixes to this response
		json = JSON.parse(response.text.trim());
	} catch (e) {
		return detectBlock({ status: 200, title: '', bodyText: response.text })
			? { status: STATUS.BLOCKED, detail: 'Availability API returned a bot check' }
			: { status: STATUS.ERROR, detail: 'Availability API returned non-JSON' };
	}

	return parseBestBuyAvailability(json, listing.sku);
}

/**
 * Checks a Walmart.ca product page from its __NEXT_DATA__ JSON
 * @param {Object} page - Puppeteer page
 * @param {{url: string}} listing - Listing config
 * @returns {Promise<Object>} Stock result
 */
async function checkWalmart(page, listing) {
	const loaded = await loadPage(page, listing.url);
	if (detectBlock(loaded)) return blockedResult(loaded);

	const nextData = await readNextData(page);
	// Walmart's bot check pages have no product data
	if (!nextData) return { status: STATUS.BLOCKED, detail: 'No product data on page (likely a bot check)' };
	return parseWalmartNextData(nextData);
}

/**
 * Generic check from a page's schema.org Product offers; used for EB Games, which usually blocks automation
 * @param {Object} page - Puppeteer page
 * @param {{url: string}} listing - Listing config
 * @returns {Promise<Object>} Stock result
 */
async function checkJsonLd(page, listing) {
	const loaded = await loadPage(page, listing.url);
	if (detectBlock(loaded)) return blockedResult(loaded);
	if (loaded.status === 404) return { status: STATUS.NOT_LISTED, detail: 'Page not found' };

	const result = parseJsonLdAvailability(await readJsonLd(page));
	return result || { status: STATUS.ERROR, detail: 'No schema.org stock info on page' };
}

// Retailer id (used in config.json) -> display name and checker
const RETAILERS = {
	'nintendo-ca': { name: 'Nintendo Store Canada', check: checkNintendo },
	'bestbuy-ca': { name: 'Best Buy Canada', check: checkBestBuy },
	'walmart-ca': { name: 'Walmart.ca', check: checkWalmart },
	'ebgames': { name: 'EB Games', check: checkJsonLd }
};

module.exports = {
	RETAILERS
};
