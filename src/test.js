// Offline checks for config, URL building, filtering, variant grouping, state dedupe and summaries; network tests behind flags
require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildResultsUrl, scrapeSaleCategories } = require('./scraper');
const { isMatchingCategory, checkDesignerBrand, groupVariants, categorizeProducts } = require('./filter');
const { createEmptyState, checkNotificationStatus, markNotified } = require('./state');
const { buildSummaryMessage, getCoverageWarnings, loadConfig } = require('./index');
const DiscordNotifier = require('./discord');

// Count of failed checks in this run (0 means everything passed)
let failures = 0;

/**
 * Runs one named check and records a failure instead of stopping the suite
 * @param {string} name - Check description
 * @param {Function} fn - Check body; throws on failure
 */
function check(name, fn) {
	try {
		fn();
		console.log(`PASS ${name}`);
	} catch (error) {
		failures++;
		console.error(`FAIL ${name}: ${error.message}`);
	}
}

/**
 * Loads config.json from the repo root
 * @returns {Object} Parsed config
 */
function readConfig() {
	return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
}

/**
 * Builds a mock product with sensible defaults
 * @param {Object} overrides - Fields to override
 * @returns {Object} Product
 */
function mockProduct(overrides) {
	return {
		code: '100',
		name: 'Test Item',
		brand: 'TEST',
		color: '',
		currentPrice: 100,
		originalPrice: 400,
		discountPercent: 75,
		productUrl: 'https://www.holtrenfrew.com/Products/Womens/Womens-Shoes/Test/p/100',
		category: 'Shoes',
		...overrides
	};
}

/**
 * Offline checks that need no network access
 */
function runOfflineTests() {
	console.log('=== Offline Checks ===');
	const config = readConfig();

	check('config has website categories with facet codes', () => {
		assert.ok(Array.isArray(config.website.categories) && config.website.categories.length > 0);
		config.website.categories.forEach(c => assert.ok(c.name && c.facet));
	});

	check('results URL pages with page= (API ignores currentPage)', () => {
		const url = new URL(buildResultsUrl(config.website, 'womensshoes', 3));
		assert.strictEqual(url.searchParams.get('page'), '3');
		assert.strictEqual(url.searchParams.get('currentPage'), null);
		assert.strictEqual(url.searchParams.get('q'), ':date-desc:storefrontFacetCategories:womensshoes');
		assert.strictEqual(url.pathname, '/en/c/WomensSale/results');
	});

	check('category keywords match whole words only', () => {
		const keywords = ['ring', 'bag'];
		assert.ok(isMatchingCategory(mockProduct({ name: 'Gold Ring', category: '', productUrl: '' }), keywords));
		assert.ok(isMatchingCategory(mockProduct({ name: 'Diamond Rings', category: '', productUrl: '' }), keywords));
		assert.ok(!isMatchingCategory(mockProduct({ name: 'Spring String Top', category: '', productUrl: '' }), keywords));
		assert.ok(isMatchingCategory(mockProduct({ name: 'Charm', category: '', productUrl: '/Womens-Bags/Bag-Accessories/p/1' }), keywords));
	});

	check('designer brands ignore accents and need whole words', () => {
		assert.ok(checkDesignerBrand(mockProduct({ brand: 'CHLOÉ' }), ['Chloe']));
		assert.ok(checkDesignerBrand(mockProduct({ brand: 'ALEXANDER MCQUEEN' }), ['McQueen']));
		assert.ok(!checkDesignerBrand(mockProduct({ brand: 'DIORAMA STUDIO', name: 'Tote' }), ['Dior']));
	});

	check('colour variants merge into one style with all codes and colours', () => {
		const grouped = groupVariants([
			mockProduct({ code: 'A', name: 'Olive Suede Western Boots', brand: 'REFORMATION', color: 'Mist Suede', discountPercent: 44 }),
			mockProduct({ code: 'B', name: 'Olive Suede Western Boots', brand: 'REFORMATION', color: 'Toasted Coconut Suede', discountPercent: 50 }),
			mockProduct({ code: 'C', name: 'Other Boots', brand: 'REFORMATION' })
		]);
		assert.strictEqual(grouped.length, 2);
		const boots = grouped.find(p => p.name === 'Olive Suede Western Boots');
		assert.deepStrictEqual(boots.codes.sort(), ['A', 'B']);
		assert.strictEqual(boots.discountPercent, 50);
		assert.strictEqual(boots.colors.length, 2);
	});

	check('categorizeProducts splits alerts from summary items', () => {
		const { highValueAlerts, summaryItems } = categorizeProducts([
			mockProduct({ code: '1', name: 'Heels', discountPercent: 80 }),
			mockProduct({ code: '2', name: 'Heels Two', discountPercent: 40 }),
			mockProduct({ code: '3', name: 'Scarf', category: 'Accessories', productUrl: '', discountPercent: 90 })
		], config);
		assert.strictEqual(highValueAlerts.length, 1);
		assert.strictEqual(summaryItems.length, 1);
	});

	check('state dedupes across variant codes and re-sends on a price drop', () => {
		const state = createEmptyState();
		const product = mockProduct({ codes: ['A', 'B'], currentPrice: 200 });
		markNotified([product], state);
		assert.ok(state.products.A && state.products.B);
		assert.ok(checkNotificationStatus(mockProduct({ code: 'B', currentPrice: 200 }), state).alreadyNotified);
		assert.ok(checkNotificationStatus(mockProduct({ code: 'B', currentPrice: 150 }), state).isPriceDrop);
	});

	check('summary history is tracked separately from alerts', () => {
		const state = createEmptyState();
		const product = mockProduct({ code: 'S1', discountPercent: 40 });
		assert.ok(!checkNotificationStatus(product, state, 'summarized').alreadyNotified);
		markNotified([product], state, 'summarized');
		assert.ok(checkNotificationStatus(product, state, 'summarized').alreadyNotified);
		assert.ok(!checkNotificationStatus(product, state).alreadyNotified);
	});

	check('summary message stays under the Discord length limit', () => {
		loadConfig();
		const deals = Array.from({ length: 50 }, (_, i) => mockProduct({
			code: String(i),
			name: `Very Long Product Name Number ${i}`,
			discountPercent: 40,
			productUrl: `https://www.holtrenfrew.com/Products/Womens/Womens-Shoes/Sneakers/Low-Top-Sneakers/A-Very-Long-Product-Url-Slug-${i}/p/2048619${i}`
		}));
		const message = buildSummaryMessage({ scannedCount: 312, categoryCount: 4, alertCount: 2, deals, warnings: ['Shoes: got 100/122 products'] });
		assert.ok(message.length <= 1900, `length ${message.length}`);
		assert.ok(message.includes('more'));
	});

	check('coverage warnings flag short or failed categories only', () => {
		const warnings = getCoverageWarnings([
			{ name: 'Shoes', expected: 122, collected: 122, failedPages: 0 },
			{ name: 'Bags', expected: 43, collected: 40, failedPages: 0 },
			{ name: 'Jewellery & Watches', expected: null, collected: 0, failedPages: 1, error: 'boom' }
		]);
		assert.strictEqual(warnings.length, 2);
	});
}

/**
 * Tests the Discord connection (without sending messages)
 */
async function testDiscord() {
	console.log('\n=== Testing Discord Connection ===');

	const token = process.env.DISCORD_BOT_TOKEN;
	if (!token) {
		console.warn('DISCORD_BOT_TOKEN not found in environment variables; skipping Discord test');
		return;
	}

	const config = readConfig();
	const notifier = new DiscordNotifier();
	try {
		await notifier.initialize(token);
		console.log('Discord bot connected successfully');
		for (const channelName of [config.discord.alertChannelName, config.discord.summaryChannelName]) {
			console.log(`#${channelName}: ${notifier.findChannel(channelName) ? 'found' : 'NOT FOUND'}`);
		}
	} catch (error) {
		failures++;
		console.error('Discord test failed:', error.message);
	} finally {
		await notifier.close();
	}
}

/**
 * Runs a real scrape of the configured categories and prints coverage (makes live requests)
 */
async function testScraping() {
	console.log('\n=== Testing Live Scraping ===');
	const config = readConfig();
	const { products, coverage } = await scrapeSaleCategories(config.website);
	coverage.forEach(c => console.log(`${c.name}: ${c.collected}/${c.expected}${c.failedPages ? ` (${c.failedPages} failed pages)` : ''}${c.error ? ` ERROR ${c.error}` : ''}`));
	console.log(`Unique products: ${products.length}`);
	const warnings = getCoverageWarnings(coverage);
	if (warnings.length > 0) {
		failures++;
		console.error(`Incomplete scrape: ${warnings.join('; ')}`);
	}
}

/**
 * Main test runner
 */
async function runTests() {
	console.log('Price Checker Bot - Test Suite\n');
	runOfflineTests();

	if (process.argv.includes('--test-discord')) {
		await testDiscord();
	}
	if (process.argv.includes('--test-scraping')) {
		await testScraping();
	}

	console.log(failures === 0 ? '\nAll checks passed' : `\n${failures} check(s) failed`);
	process.exit(failures === 0 ? 0 : 1);
}

if (require.main === module) {
	runTests().catch(error => {
		console.error('Test suite failed:', error);
		process.exit(1);
	});
}
