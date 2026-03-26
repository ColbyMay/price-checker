# Progress: Price Checker App

## Current Status: Overhaul Complete (2026-03-26)

## 1. What Works

*   **API-based scraping:** Intercepts Holt Renfrew Hybris API responses for structured JSON data
    *   4-5 seconds per category (down from 40+ seconds with scroll-based approach)
    *   100% product coverage (matches API's totalResults count exactly)
    *   Clean data: explicit brand, price, salePercentage, product code, images
*   **Notification deduplication:** State persistence via `state/notified.json`
    *   Products tracked by SKU code
    *   Same product at same price is not re-notified
    *   Price drops trigger re-notification with "Further Reduced" styling
    *   Expired entries pruned after 14 days
*   **Simplified filtering:** Uses API's structured data instead of regex guessing
*   **Discord notifications:** Rich embeds with price-drop distinction
*   **GitHub Actions:** Concurrency-safe workflow with state commit step

## 2. What's Left

*   End-to-end test with Discord connected (verify channel lookup, embed formatting)
*   Monitor first few CI runs to confirm state file commit/push works
*   The "Navigation frame was detached" warning from Puppeteer is benign but could be suppressed

## 3. Known Issues

*   Bags category currently only has 21 products (sale inventory is seasonal)
*   If Holt Renfrew changes their API path or response format, `apiParser.js` needs updating
*   DOM fallback scraper is basic — just extracts prices via regex, no brand/category

## 4. Evolution of Decisions

*   **2026-03-26:** Major overhaul — replaced scroll+DOM scraping with API interception, added state persistence for dedup, simplified all modules
*   **Earlier:** Switched from Cheerio to Puppeteer (site requires JS rendering)
*   **Earlier:** Switched from email to Discord notifications
