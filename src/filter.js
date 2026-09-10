// Product filtering: whole-word category/brand matching, colour-variant grouping, and alert/summary bucketing

/**
 * Lowercases text and strips accents so "CHLOÉ" and "Chloe" compare equal
 * @param {string} text - Input text
 * @returns {string} Normalized text
 */
function normalizeText(text) {
	return (text || '')
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase();
}

/**
 * Splits normalized text into a set of alphanumeric words
 * @param {string} text - Input text
 * @returns {Set<string>} Unique words
 */
function toWordSet(text) {
	return new Set(normalizeText(text).split(/[^a-z0-9]+/).filter(Boolean));
}

/**
 * Checks whether a phrase appears in text as whole words (so "ring" does not match "string")
 * @param {string} text - Text to search
 * @param {string} phrase - Phrase to find
 * @returns {boolean} True if the phrase appears on word boundaries
 */
function containsPhrase(text, phrase) {
	const needle = normalizeText(phrase).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	if (!needle) return false;
	return new RegExp(`(^|[^a-z0-9])${needle}([^a-z0-9]|$)`).test(normalizeText(text));
}

/**
 * Checks if a product matches configured category keywords as whole words (simple plurals allowed)
 * Searches the product name, scraped category, and the words in its URL path
 * @param {Object} product - Product object with name, category, productUrl fields
 * @param {Array<string>} categories - Category keywords to match
 * @returns {boolean} True if product matches any category keyword
 */
function isMatchingCategory(product, categories) {
	const words = toWordSet([product.name, product.category, product.productUrl].filter(Boolean).join(' '));

	return categories.some(keyword => {
		const word = normalizeText(keyword);
		return words.has(word) || words.has(`${word}s`) || words.has(`${word}es`);
	});
}

/**
 * Checks if a product is from a configured designer brand (whole-word, accent-insensitive)
 * @param {Object} product - Product object with brand and name fields
 * @param {Array<string>} designerBrands - Designer brand names
 * @returns {boolean} True if product is from a designer brand
 */
function checkDesignerBrand(product, designerBrands) {
	return designerBrands.some(brand =>
		containsPhrase(product.brand, brand) || containsPhrase(product.name, brand)
	);
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
 * Builds the key that identifies one style across its colour variants
 * Holt Renfrew lists each colour as its own product code with the same brand and name
 * @param {Object} product - Product object
 * @returns {string} Grouping key
 */
function getGroupKey(product) {
	return `${normalizeText(product.brand).trim()}|${normalizeText(product.name).trim()}`;
}

/**
 * Collapses colour variants of the same style into one product
 * The representative is the best deal (highest discount, then lowest price); it carries all codes and colours
 * @param {Array} products - Products unique by code
 * @returns {Array} One product per style, each with `codes` and `colors` arrays
 */
function groupVariants(products) {
	const groups = new Map();

	for (const product of products) {
		const key = getGroupKey(product);
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(product);
	}

	return [...groups.values()].map(variants => {
		const best = [...variants].sort((a, b) =>
			(b.discountPercent - a.discountPercent) || (a.currentPrice - b.currentPrice)
		)[0];

		return {
			...best,
			codes: variants.map(v => v.code).filter(Boolean),
			colors: [...new Set(variants.map(v => v.color).filter(Boolean))]
		};
	});
}

/**
 * Separates products into high-value alerts and summary items
 * Products arrive with discountPercent already calculated by the API parser
 * @param {Array} products - Array of all scraped products
 * @param {Object} config - Configuration object with filtering criteria
 * @returns {{ highValueAlerts: Array, summaryItems: Array }}
 */
function categorizeProducts(products, config) {
	console.log(`Categorizing ${products.length} products...`);

	// Deduplicate by product code, then merge colour variants of the same style
	const uniqueProducts = [];
	const seen = new Set();

	for (const product of products) {
		const key = product.code || `${product.brand}-${product.name}-${product.currentPrice}`;
		if (!seen.has(key)) {
			seen.add(key);
			uniqueProducts.push(product);
		}
	}

	const styles = groupVariants(uniqueProducts);
	const mergedCount = uniqueProducts.length - styles.length;
	if (mergedCount > 0) {
		console.log(`Merged ${mergedCount} colour variants, processing ${styles.length} unique styles`);
	}

	const highValueAlerts = [];
	const summaryItems = [];

	for (const product of styles) {
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
	groupVariants,
	getGroupKey,
	normalizeText,
	sortProductsByPriority
};
