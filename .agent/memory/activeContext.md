# Active Context: Price Checker App

## 1. Current Work Focus

*   **Phase:** Major overhaul completed (2026-03-26)
*   **Current Activity:** All three core problems addressed — scraping, deduplication, and fragile selectors
*   **Immediate Goal:** Deploy and verify in GitHub Actions

## 2. Recent Changes & Decisions

*   **Scraper Rewrite:** Replaced scroll-based DOM scraping with Puppeteer network interception
    *   Captures Holt Renfrew's internal Hybris API responses (JSON)
    *   API endpoint: `/en/c/WomensSale/results?sort=relevance&q=...&grid=2`
    *   Gets structured data: code, name, brand, price, salePercentage, images, pagination
    *   4-5 seconds per category (down from 40+ seconds)
    *   100% product coverage (API returns exact totalResults count)
*   **State Persistence:** Added `src/state.js` and `state/notified.json`
    *   Products tracked by code (SKU) as primary key
    *   Deduplicates across runs — same product at same price is not re-notified
    *   Price drops trigger re-notification with distinct "Further Reduced" embed
    *   State pruned after 14 days of not being seen
    *   Git-committed state file for persistence between GitHub Actions runs
*   **Filter Simplification:** Removed dependency on scraper's `calculateDiscount`
    *   Uses `discountPercent` from API parser (which prefers API's own `salePercentage`)
    *   Brand matching uses API's explicit `brand` field
*   **Discord Updates:**
    *   Price-drop products get orange embeds with "Further Reduced" prefix
    *   Max alerts reduced from 10 to 5 (since duplicates eliminated)
    *   Extracted `findChannel()` helper for cleaner channel lookup
*   **GitHub Actions:** Added concurrency group, `permissions: contents: write`, and state commit step

## 3. Next Steps

1.  Test full end-to-end run with Discord connected
2.  Monitor first few GitHub Actions runs to verify state persistence
3.  Verify state file commit/push works correctly in CI
4.  Consider adding more categories or sites in the future

## 4. Active Considerations

*   **API stability:** The intercepted API pattern (`/results`) could change if Holt Renfrew updates their frontend. A fallback DOM scraper is in place.
*   **Navigation frame detached warning:** Benign Puppeteer message during browser close, not a functional issue.
*   **Bags category currently small:** Only 21 products in sale. Shoes has 28. These numbers will fluctuate with seasonal sales.
