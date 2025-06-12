// Product filtering logic for identifying relevant items
const { calculateDiscount } = require('./scraper');

/**
 * Filters products based on configuration criteria
 * @param {Array} products - Array of product objects
 * @param {Object} config - Configuration object with filtering criteria
 * @returns {Array} Filtered array of products
 */
function filterProducts(products, config) {
	console.log(`Filtering ${products.length} products...`);
	
	const filteredProducts = products.filter(product => {
		// Check if product matches handbag categories
		const matchesCategory = isHandbagCategory(product, config.monitoring.categories);
		
		// Check if product is from a designer brand
		const isDesignerBrand = checkDesignerBrand(product, config.monitoring.designerBrands);
		
		// Calculate discount percentage
		const discountPercent = calculateDiscount(product.originalPrice, product.currentPrice);
		const meetsDiscountThreshold = discountPercent >= config.monitoring.minDiscountPercent;
		
		// Product qualifies if it's either:
		// 1. A handbag from any brand, OR
		// 2. A designer item with significant discount
		const qualifies = matchesCategory || (isDesignerBrand && meetsDiscountThreshold);
		
		if (qualifies) {
			// Add calculated discount to product object
			product.discountPercent = discountPercent;
			product.matchReason = getMatchReason(matchesCategory, isDesignerBrand, meetsDiscountThreshold);
		}
		
		return qualifies;
	});
	
	console.log(`Found ${filteredProducts.length} qualifying products`);
	return filteredProducts;
}

/**
 * Checks if product matches handbag categories
 * @param {Object} product - Product object
 * @param {Array} categories - Array of category keywords
 * @returns {boolean} True if product matches handbag categories
 */
function isHandbagCategory(product, categories) {
	const searchText = `${product.name} ${product.brand}`.toLowerCase();
	
	return categories.some(category => 
		searchText.includes(category.toLowerCase())
	);
}

/**
 * Checks if product is from a designer brand
 * @param {Object} product - Product object
 * @param {Array} designerBrands - Array of designer brand names
 * @returns {boolean} True if product is from a designer brand
 */
function checkDesignerBrand(product, designerBrands) {
	const brandText = product.brand.toLowerCase();
	const nameText = product.name.toLowerCase();
	
	return designerBrands.some(brand => 
		brandText.includes(brand.toLowerCase()) || 
		nameText.includes(brand.toLowerCase())
	);
}

/**
 * Determines the reason why a product matched the criteria
 * @param {boolean} matchesCategory - Whether product matches handbag category
 * @param {boolean} isDesignerBrand - Whether product is from designer brand
 * @param {boolean} meetsDiscountThreshold - Whether product meets discount threshold
 * @returns {string} Match reason description
 */
function getMatchReason(matchesCategory, isDesignerBrand, meetsDiscountThreshold) {
	const reasons = [];
	
	if (matchesCategory) {
		reasons.push('Handbag category');
	}
	
	if (isDesignerBrand) {
		reasons.push('Designer brand');
	}
	
	if (meetsDiscountThreshold) {
		reasons.push('High discount');
	}
	
	return reasons.join(', ');
}

/**
 * Sorts products by priority (discount percentage, then brand recognition)
 * @param {Array} products - Array of filtered products
 * @returns {Array} Sorted array of products
 */
function sortProductsByPriority(products) {
	return products.sort((a, b) => {
		// Sort by discount percentage (highest first)
		if (b.discountPercent !== a.discountPercent) {
			return b.discountPercent - a.discountPercent;
		}
		
		// Then by brand name alphabetically
		return a.brand.localeCompare(b.brand);
	});
}

module.exports = {
	filterProducts,
	isHandbagCategory,
	checkDesignerBrand,
	sortProductsByPriority
};
