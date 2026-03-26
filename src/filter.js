// Product filtering logic for identifying relevant items

/**
 * Checks if a product matches configured category keywords
 * @param {Object} product - Product object with name, brand, category fields
 * @param {Array} categories - Array of category keywords to match
 * @returns {boolean} True if product matches any category keyword
 */
function isMatchingCategory(product, categories) {
	// Search across name, brand, category, and URL for keyword matches
	const searchText = [
		product.name,
		product.brand,
		product.category,
		product.productUrl
	].filter(Boolean).join(' ').toLowerCase();

	return categories.some(keyword =>
		searchText.includes(keyword.toLowerCase())
	);
}

/**
 * Checks if a product is from a configured designer brand
 * Uses exact matching on the brand field from the API (no guessing)
 * @param {Object} product - Product object with brand field
 * @param {Array} designerBrands - Array of designer brand names
 * @returns {boolean} True if product is from a designer brand
 */
function checkDesignerBrand(product, designerBrands) {
	const brandText = (product.brand || '').toLowerCase();
	const nameText = (product.name || '').toLowerCase();

	return designerBrands.some(brand => {
		const brandLower = brand.toLowerCase();
		return brandText.includes(brandLower) || nameText.includes(brandLower);
	});
}

/**
 * Determines the reason why a product matched the criteria
 * @param {boolean} matchesCategory - Whether product matches a category
 * @param {boolean} isDesigner - Whether product is from designer brand
 * @param {boolean} meetsDiscount - Whether product meets discount threshold
 * @returns {string} Match reason description
 */
function getMatchReason(matchesCategory, isDesigner, meetsDiscount) {
	const reasons = [];
	if (matchesCategory) reasons.push('Category match');
	if (isDesigner) reasons.push('Designer brand');
	if (meetsDiscount) reasons.push('High discount');
	return reasons.join(', ');
}

/**
 * Sorts products by discount percentage (highest first), then brand name
 * @param {Array} products - Array of products to sort
 * @returns {Array} Sorted array
 */
function sortProductsByPriority(products) {
	return products.sort((a, b) => {
		if (b.discountPercent !== a.discountPercent) {
			return b.discountPercent - a.discountPercent;
		}
		return (a.brand || '').localeCompare(b.brand || '');
	});
}

/**
 * Separates products into high-value alerts and summary items
 * Products now arrive with discountPercent already calculated by the API parser
 * @param {Array} products - Array of all scraped products
 * @param {Object} config - Configuration object with filtering criteria
 * @returns {{ highValueAlerts: Array, summaryItems: Array }}
 */
function categorizeProducts(products, config) {
	console.log(`Categorizing ${products.length} products...`);

	// Deduplicate by product code or name+brand+price
	const uniqueProducts = [];
	const seen = new Set();

	for (const product of products) {
		const key = product.code || `${product.brand}-${product.name}-${product.currentPrice}`;
		if (!seen.has(key)) {
			seen.add(key);
			uniqueProducts.push(product);
		}
	}

	const dupeCount = products.length - uniqueProducts.length;
	if (dupeCount > 0) {
		console.log(`Removed ${dupeCount} duplicates, processing ${uniqueProducts.length} unique items`);
	}

	const highValueAlerts = [];
	const summaryItems = [];

	for (const product of uniqueProducts) {
		const matchesCategory = isMatchingCategory(product, config.monitoring.categories);
		const isDesigner = checkDesignerBrand(product, config.monitoring.designerBrands);

		// Must match at least one of: category keyword or designer brand
		if (!matchesCategory && !isDesigner) continue;

		const discountPercent = product.discountPercent || 0;
		const meetsHighThreshold = discountPercent >= config.monitoring.minDiscountPercent;

		product.matchReason = getMatchReason(matchesCategory, isDesigner, meetsHighThreshold);

		if (meetsHighThreshold) {
			highValueAlerts.push(product);
		} else if (discountPercent > 0) {
			summaryItems.push(product);
		}
	}

	console.log(`Found ${highValueAlerts.length} high-value alerts and ${summaryItems.length} summary items`);

	return {
		highValueAlerts: sortProductsByPriority(highValueAlerts),
		summaryItems: sortProductsByPriority(summaryItems)
	};
}

module.exports = {
	categorizeProducts,
	isMatchingCategory,
	checkDesignerBrand,
	sortProductsByPriority
};
