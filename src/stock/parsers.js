// Pure parsers that turn each retailer's page data into a normalized stock result (no network, unit-testable)

// Normalized stock statuses a listing can report
const STATUS = {
	IN_STOCK: 'in_stock',
	OUT_OF_STOCK: 'out_of_stock',
	NOT_LISTED: 'not_listed',
	THIRD_PARTY: 'third_party',
	BLOCKED: 'blocked',
	ERROR: 'error'
};

// Text that marks a bot-check or access-denied page (Cloudflare, PerimeterX, Akamai)
const BLOCK_PATTERN = /access denied|attention required|just a moment|verify you are human|are you a robot|press & hold|px-captcha|captcha|request unsuccessful/i;

/**
 * Detects whether a loaded page is a bot check or block page rather than the product
 * @param {{status: number, title: string, bodyText: string}} page - HTTP status, document title and visible text
 * @returns {boolean} True if the retailer blocked the request
 */
function detectBlock({ status, title, bodyText }) {
	if (status === 403 || status === 429) return true;
	return BLOCK_PATTERN.test(`${title || ''} ${(bodyText || '').slice(0, 2000)}`);
}

/**
 * Reads Nintendo Store stock for one SKU from the page's __NEXT_DATA__ JSON
 * Nintendo exposes `Product:{"sku":"<sku>"}.isSalableQty` (true when it can be bought or pre-ordered)
 * @param {Object} nextData - Parsed __NEXT_DATA__
 * @param {string} sku - Nintendo SKU, e.g. "127074"
 * @returns {{status: string, detail: string}} Stock result
 */
function parseNintendoNextData(nextData, sku) {
	const apollo = nextData && nextData.props && nextData.props.pageProps && nextData.props.pageProps.initialApolloState;
	const product = apollo && apollo[`Product:{"sku":"${sku}"}`];

	if (!product) {
		return { status: STATUS.NOT_LISTED, detail: 'Product not in page data' };
	}

	if (product.isSalableQty === true) {
		return { status: STATUS.IN_STOCK, detail: product.prePurchase ? 'Pre-order available' : 'Available to buy' };
	}

	return { status: STATUS.OUT_OF_STOCK, detail: 'Sold out' };
}

/**
 * Reads Best Buy Canada stock from its /ecomm-api/availability/products JSON
 * Only counts it as in stock when Best Buy itself (seller "bbyca") can ship it or offer pickup
 * @param {Object} json - Parsed availability response
 * @param {string} sku - Best Buy SKU, e.g. "20149830"
 * @returns {{status: string, detail: string}} Stock result
 */
function parseBestBuyAvailability(json, sku) {
	const availability = ((json && json.availabilities) || []).find(a => String(a.sku) === String(sku));

	if (!availability) {
		return { status: STATUS.ERROR, detail: 'SKU missing from availability response' };
	}

	const shipping = availability.shipping || {};
	const pickup = availability.pickup || {};
	const detail = `Online: ${shipping.status || 'unknown'}, pickup: ${pickup.status || 'unknown'}`;
	const purchasable = shipping.purchasable === true || pickup.purchasable === true;

	if (!purchasable) {
		return { status: STATUS.OUT_OF_STOCK, detail };
	}

	if (availability.sellerId && availability.sellerId !== 'bbyca') {
		return { status: STATUS.THIRD_PARTY, detail: `Marketplace seller ${availability.sellerId}; ${detail}` };
	}

	return { status: STATUS.IN_STOCK, detail };
}

/**
 * Reads Walmart.ca stock from the product page's __NEXT_DATA__ JSON
 * Only counts it as in stock when Walmart is the seller (marketplace resellers are reported separately)
 * @param {Object} nextData - Parsed __NEXT_DATA__
 * @returns {{status: string, detail: string, price?: string}} Stock result
 */
function parseWalmartNextData(nextData) {
	const product = nextData && nextData.props && nextData.props.pageProps &&
		nextData.props.pageProps.initialData && nextData.props.pageProps.initialData.data &&
		nextData.props.pageProps.initialData.data.product;

	if (!product) {
		return { status: STATUS.ERROR, detail: 'No product data on page' };
	}

	const seller = product.sellerDisplayName || product.sellerName || '';
	const currentPrice = product.priceInfo && product.priceInfo.currentPrice;
	const price = currentPrice && (currentPrice.priceString || (currentPrice.price != null ? `$${currentPrice.price}` : '')) || undefined;
	const display = (product.availabilityStatusV2 && product.availabilityStatusV2.display) || product.availabilityStatus || 'unknown';

	if (product.availabilityStatus !== 'IN_STOCK') {
		return { status: STATUS.OUT_OF_STOCK, detail: display, price };
	}

	if (!/^walmart/i.test(seller)) {
		return { status: STATUS.THIRD_PARTY, detail: `Sold by ${seller || 'a marketplace seller'}`, price };
	}

	const isPreOrder = product.preOrder && product.preOrder.isPreOrder;
	return { status: STATUS.IN_STOCK, detail: isPreOrder ? 'Pre-order available' : 'In stock online', price };
}

/**
 * Flattens schema.org JSON-LD blocks into a list of nodes
 * @param {Array<string>} jsonLdTexts - Raw contents of <script type="application/ld+json"> tags
 * @returns {Array<Object>} JSON-LD nodes
 */
function flattenJsonLd(jsonLdTexts) {
	const nodes = [];
	for (const text of jsonLdTexts || []) {
		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch (e) {
			continue;
		}
		const items = Array.isArray(parsed) ? parsed : [parsed];
		for (const item of items) {
			if (item && Array.isArray(item['@graph'])) {
				nodes.push(...item['@graph']);
			} else if (item) {
				nodes.push(item);
			}
		}
	}
	return nodes;
}

/**
 * Reads stock from a page's standard schema.org Product offers (generic fallback, used for EB Games)
 * @param {Array<string>} jsonLdTexts - Raw JSON-LD script contents
 * @returns {{status: string, detail: string, price?: string}|null} Stock result, or null if the page has no offer availability
 */
function parseJsonLdAvailability(jsonLdTexts) {
	const product = flattenJsonLd(jsonLdTexts).find(node => {
		const type = node['@type'];
		return Array.isArray(type) ? type.includes('Product') : type === 'Product';
	});
	if (!product || !product.offers) return null;

	let offers = Array.isArray(product.offers) ? product.offers : [product.offers];
	offers = offers.flatMap(offer => (offer && Array.isArray(offer.offers)) ? offer.offers : [offer]).filter(Boolean);

	const withAvailability = offers.filter(offer => typeof offer.availability === 'string');
	if (withAvailability.length === 0) return null;

	const inStockOffer = withAvailability.find(offer => /InStock|PreOrder|PreSale|LimitedAvailability|OnlineOnly/i.test(offer.availability));
	const offer = inStockOffer || withAvailability[0];
	const availability = offer.availability.replace(/^https?:\/\/schema\.org\//i, '');
	const price = offer.price != null ? `${offer.priceCurrency === 'CAD' || !offer.priceCurrency ? '$' : offer.priceCurrency + ' '}${offer.price}` : undefined;

	return {
		status: inStockOffer ? STATUS.IN_STOCK : STATUS.OUT_OF_STOCK,
		detail: availability,
		price
	};
}

module.exports = {
	STATUS,
	detectBlock,
	parseNintendoNextData,
	parseBestBuyAvailability,
	parseWalmartNextData,
	parseJsonLdAvailability
};
