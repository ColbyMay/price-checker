// Test script for local development and debugging
require('dotenv').config();
const { scrapeProducts, parsePrice, calculateDiscount } = require('./scraper');
const { filterProducts, isHandbagCategory, checkDesignerBrand } = require('./filter');
const DiscordNotifier = require('./discord');
const fs = require('fs');
const path = require('path');

/**
 * Test configuration loading
 */
function testConfig() {
	console.log('=== Testing Configuration ===');
	try {
		const configPath = path.join(__dirname, '..', 'config.json');
		const configData = fs.readFileSync(configPath, 'utf8');
		const config = JSON.parse(configData);
		
		console.log('✅ Configuration loaded successfully');
		console.log(`Website: ${config.website.name}`);
		console.log(`URL: ${config.website.url}`);
		console.log(`Min Discount: ${config.monitoring.minDiscountPercent}%`);
		console.log(`Categories: ${config.monitoring.categories.join(', ')}`);
		console.log(`Designer Brands: ${config.monitoring.designerBrands.length} brands`);
		
		return config;
	} catch (error) {
		console.error('❌ Configuration test failed:', error.message);
		return null;
	}
}

/**
 * Test price parsing functions
 */
function testPriceParsing() {
	console.log('\n=== Testing Price Parsing ===');
	
	const testPrices = [
		'$299.99',
		'CAD $150.00',
		'$1,299.50',
		'€450.75',
		'£199.99',
		'Invalid price'
	];
	
	testPrices.forEach(price => {
		const parsed = parsePrice(price);
		console.log(`"${price}" -> ${parsed}`);
	});
	
	// Test discount calculation
	console.log('\nDiscount Calculations:');
	const discountTests = [
		{ original: '$500.00', current: '$250.00' },
		{ original: '$1000.00', current: '$400.00' },
		{ original: '$299.99', current: '$149.99' }
	];
	
	discountTests.forEach(test => {
		const discount = calculateDiscount(test.original, test.current);
		console.log(`${test.original} -> ${test.current} = ${discount}% off`);
	});
}

/**
 * Test product filtering logic
 */
function testFiltering() {
	console.log('\n=== Testing Product Filtering ===');
	
	const mockProducts = [
		{
			name: 'Gucci Marmont Leather Handbag',
			brand: 'Gucci',
			currentPrice: '$1,200.00',
			originalPrice: '$2,400.00'
		},
		{
			name: 'Coach Leather Tote Bag',
			brand: 'Coach',
			currentPrice: '$180.00',
			originalPrice: '$300.00'
		},
		{
			name: 'Regular Cotton T-Shirt',
			brand: 'Generic Brand',
			currentPrice: '$25.00',
			originalPrice: '$50.00'
		},
		{
			name: 'Louis Vuitton Neverfull MM',
			brand: 'Louis Vuitton',
			currentPrice: '$800.00',
			originalPrice: '$1,600.00'
		}
	];
	
	const config = testConfig();
	if (!config) return;
	
	console.log('Mock Products:');
	mockProducts.forEach((product, index) => {
		const isHandbag = isHandbagCategory(product, config.monitoring.categories);
		const isDesigner = checkDesignerBrand(product, config.monitoring.designerBrands);
		const discount = calculateDiscount(product.originalPrice, product.currentPrice);
		
		console.log(`${index + 1}. ${product.name}`);
		console.log(`   Handbag: ${isHandbag ? '✅' : '❌'}`);
		console.log(`   Designer: ${isDesigner ? '✅' : '❌'}`);
		console.log(`   Discount: ${discount}%`);
		console.log('');
	});
	
	const filtered = filterProducts(mockProducts, config);
	console.log(`Filtered Results: ${filtered.length}/${mockProducts.length} products qualify`);
}

/**
 * Test Discord connection (without sending messages)
 */
async function testDiscord() {
	console.log('\n=== Testing Discord Connection ===');
	
	const token = process.env.DISCORD_BOT_TOKEN;
	if (!token) {
		console.log('❌ DISCORD_BOT_TOKEN not found in environment variables');
		console.log('Create a .env file with your Discord bot token to test');
		return;
	}
	
	try {
		const notifier = new DiscordNotifier();
		console.log('Initializing Discord bot...');
		
		await notifier.initialize(token);
		console.log('✅ Discord bot connected successfully');
		
		// Test channel finding (without sending messages)
		const channelName = 'price-alerts';
		const channel = notifier.client.channels.cache.find(ch => 
			ch.name === channelName && ch.type === 0
		);
		
		if (channel) {
			console.log(`✅ Found channel: #${channelName}`);
		} else {
			console.log(`❌ Channel #${channelName} not found`);
			console.log('Available channels:');
			notifier.client.channels.cache
				.filter(ch => ch.type === 0)
				.forEach(ch => console.log(`  - #${ch.name}`));
		}
		
		await notifier.close();
		console.log('Discord connection closed');
		
	} catch (error) {
		console.error('❌ Discord test failed:', error.message);
	}
}

/**
 * Test web scraping (limited to avoid overloading the website)
 */
async function testScraping() {
	console.log('\n=== Testing Web Scraping ===');
	console.log('⚠️  This test will make a real request to the website');
	console.log('Use sparingly to avoid being blocked');
	
	const config = testConfig();
	if (!config) return;
	
	try {
		console.log('Starting scraping test...');
		
		const allProducts = [];
		
		// Test scraping shoes (limited for testing)
		console.log('Testing shoes scraping...');
		const shoesUrl = 'https://www.holtrenfrew.com/en/Products/Womens/Collections/Sale/c/WomensSale?sort=relevance&q=%3Adate-desc%3AstorefrontFacetCategories%3AWomensShoes';
		const shoesOptions = { maxPages: 2, maxProducts: 100 };
		const shoesProducts = await scrapeProducts(shoesUrl, shoesOptions);
		console.log(`Found ${shoesProducts.length} shoes products`);
		allProducts.push(...shoesProducts);
		
		// Test scraping bags (limited for testing)
		console.log('Testing bags scraping...');
		const bagsUrl = 'https://www.holtrenfrew.com/en/Products/Womens/Collections/Sale/c/WomensSale?sort=relevance&q=%3Adate-desc%3AstorefrontFacetCategories%3AWomensBags';
		const bagsOptions = { maxPages: 2, maxProducts: 100 };
		const bagsProducts = await scrapeProducts(bagsUrl, bagsOptions);
		console.log(`Found ${bagsProducts.length} bags products`);
		allProducts.push(...bagsProducts);
		
		const products = allProducts;
		
		console.log(`✅ Scraped ${products.length} products`);
		
		if (products.length > 0) {
			console.log('\nFirst 3 products:');
			products.slice(0, 3).forEach((product, index) => {
				console.log(`${index + 1}. ${product.name}`);
				console.log(`   Brand: ${product.brand}`);
				console.log(`   Price: ${product.currentPrice}`);
				console.log(`   Original: ${product.originalPrice}`);
				console.log('');
			});
		}
		
	} catch (error) {
		console.error('❌ Scraping test failed:', error.message);
	}
}

/**
 * Main test runner
 */
async function runTests() {
	console.log('🧪 Price Checker Bot - Test Suite\n');
	
	// Run tests in sequence
	testConfig();
	testPriceParsing();
	testFiltering();
	
	// Ask user before running network tests
	console.log('\n=== Network Tests ===');
	console.log('The following tests will make network requests:');
	console.log('- Discord connection test');
	console.log('- Web scraping test (use sparingly)');
	
	// For automated testing, skip network tests
	if (process.env.CI || process.argv.includes('--skip-network')) {
		console.log('Skipping network tests (CI environment or --skip-network flag)');
		return;
	}
	
	// Run network tests
	await testDiscord();
	
	// Only run scraping test if explicitly requested
	if (process.argv.includes('--test-scraping')) {
		await testScraping();
	} else {
		console.log('\nSkipping scraping test (add --test-scraping flag to run)');
	}
	
	console.log('\n✅ Test suite completed');
}

// Run tests if this file is executed directly
if (require.main === module) {
	runTests().catch(error => {
		console.error('Test suite failed:', error);
		process.exit(1);
	});
}

module.exports = {
	testConfig,
	testPriceParsing,
	testFiltering,
	testDiscord,
	testScraping
};
