// Normalizes Holt Renfrew Hybris API responses into standard product objects

const BASE_URL = 'https://www.holtrenfrew.com';

/**
 * Parses a Hybris product listing API response into normalized product objects
 * @param {Object} apiData - Raw JSON from the Hybris search API
 * @returns {{ products: Array, pagination: Object }} Normalized products and pagination info
 */
function parseApiResponse(apiData) {
	if (!apiData || !apiData.results) {
		return { products: [], pagination: null };
	}

	const products = apiData.results
		.map(item => parseProduct(item))
		.filter(p => p !== null);

	const pagination = apiData.pagination ? {
		pageSize: apiData.pagination.pageSize || 21,
		currentPage: apiData.pagination.currentPage || 0,
		totalPages: apiData.pagination.numberOfPages || 1,
		totalResults: apiData.pagination.totalNumberOfResults || products.length
	} : null;

	return { products, pagination };
}

/**
 * Parses a single Hybris product entry into a normalized product object
 * @param {Object} item - Raw product object from API
 * @returns {Object|null} Normalized product or null if unparseable
 */
function parseProduct(item) {
	if (!item || !item.name) return null;

	const currentPrice = extractCurrentPrice(item);
	const originalPrice = extractOriginalPrice(item);

	// Need at least a current price to be useful
	if (currentPrice === 0 && originalPrice === 0) return null;

	const discountPercent = extractDiscountPercent(item, currentPrice, originalPrice);
	const imageUrl = extractImageUrl(item);
	const productUrl = item.url ? `${BASE_URL}${item.url}` : '';

	return {
		code: item.code || '',
		name: item.name,
		brand: extractBrand(item),
		color: typeof item.color === 'string' ? item.color : '',
		currentPrice: currentPrice,
		originalPrice: originalPrice || currentPrice,
		formattedCurrentPrice: item.price ? item.price.formattedValue || `$${currentPrice}` : `$${currentPrice}`,
		formattedOriginalPrice: formatPrice(originalPrice || currentPrice),
		discountPercent: discountPercent,
		productUrl: productUrl,
		imageUrl: imageUrl,
		category: extractCategory(item),
		scrapedAt: new Date().toISOString()
	};
}

/**
 * Extracts the current (sale) price from a product
 * @param {Object} item - Raw product object
 * @returns {number} Current price as a number
 */
function extractCurrentPrice(item) {
	if (item.price && item.price.value != null) {
		return parseFloat(item.price.value) || 0;
	}
	if (item.priceRange && item.priceRange.minPrice && item.priceRange.minPrice.value != null) {
		return parseFloat(item.priceRange.minPrice.value) || 0;
	}
	return 0;
}

/**
 * Extracts the original (regular) price from a product
 * @param {Object} item - Raw product object
 * @returns {number} Original price as a number
 */
function extractOriginalPrice(item) {
	// regularPriceRange holds the pre-sale price
	if (item.regularPriceRange) {
		if (item.regularPriceRange.minPrice && item.regularPriceRange.minPrice.value != null) {
			return parseFloat(item.regularPriceRange.minPrice.value) || 0;
		}
		if (item.regularPriceRange.value != null) {
			return parseFloat(item.regularPriceRange.value) || 0;
		}
	}
	return 0;
}

/**
 * Extracts discount percentage, preferring the API's own calculation
 * @param {Object} item - Raw product object
 * @param {number} currentPrice - Parsed current price
 * @param {number} originalPrice - Parsed original price
 * @returns {number} Discount percentage (0-100)
 */
function extractDiscountPercent(item, currentPrice, originalPrice) {
	// Prefer the API's own salePercentage field
	if (item.salePercentage != null && item.salePercentage > 0) {
		return Math.round(item.salePercentage);
	}
	// Fall back to manual calculation
	if (originalPrice > 0 && currentPrice > 0 && originalPrice > currentPrice) {
		return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
	}
	return 0;
}

/**
 * Extracts brand name from the product
 * @param {Object} item - Raw product object
 * @returns {string} Brand name
 */
function extractBrand(item) {
	if (item.brand && typeof item.brand === 'string') {
		return item.brand;
	}
	if (item.brand && item.brand.name) {
		return item.brand.name;
	}
	// Try to extract from the URL path (e.g., /MARTHA-CALVO-Wish-Me-Luck/p/...)
	if (item.url) {
		const match = item.url.match(/\/([A-Z][A-Z\-]+?)-[A-Z]/);
		if (match) {
			return match[1].replace(/-/g, ' ');
		}
	}
	return 'Unknown Brand';
}

/**
 * Extracts the best available image URL
 * @param {Object} item - Raw product object
 * @returns {string} Image URL or empty string
 */
function extractImageUrl(item) {
	if (!item.images || !Array.isArray(item.images) || item.images.length === 0) {
		return '';
	}
	// Prefer PRIMARY image in a reasonable format
	const primary = item.images.find(img => img.imageType === 'PRIMARY');
	if (primary && primary.url) {
		const url = primary.url.startsWith('//') ? `https:${primary.url}` : primary.url;
		return url;
	}
	// Fallback to first image
	const first = item.images[0];
	if (first && first.url) {
		return first.url.startsWith('//') ? `https:${first.url}` : first.url;
	}
	return '';
}

/**
 * Extracts category from the product URL
 * @param {Object} item - Raw product object
 * @returns {string} Category name or empty string
 */
function extractCategory(item) {
	if (!item.url) return '';
	// URL pattern: /Products/Womens/Womens-Bags/Bag-Accessories/...
	const parts = item.url.split('/').filter(Boolean);
	if (parts.length >= 3) {
		return parts[2].replace(/-/g, ' '); // e.g., "Womens Bags"
	}
	return '';
}

/**
 * Formats a numeric price as a currency string
 * @param {number} price - Numeric price value
 * @returns {string} Formatted price string
 */
function formatPrice(price) {
	if (!price || price <= 0) return '';
	return `$${price.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

module.exports = {
	parseApiResponse,
	parseProduct,
	extractCurrentPrice,
	extractOriginalPrice,
	extractDiscountPercent,
	extractBrand,
	formatPrice
};
