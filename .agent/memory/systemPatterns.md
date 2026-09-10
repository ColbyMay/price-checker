# System Patterns: Price Checker App

## 1. Architecture Overview

```
GitHub Actions (Cron: Every Hour)
    |
    v
npm start -> src/index.js (orchestrator)
    |
    +--> Load config.json
    +--> Load state/notified.json (dedup state)
    +--> Prune expired state entries (>14 days)
    +--> Initialize Discord bot
    |
    +--> src/scraper.js scrapeSaleCategories(config.website):
    |      +--> Launch one headless browser, open the sale landing page once (cookies)
    |      +--> For each config.website.categories entry (name + facet code):
    |      |      +--> fetch() /en/c/WomensSale/results?sort=date-desc&q=:date-desc:storefrontFacetCategories:{facet}&grid=2&page=N
    |      |      +--> Walk page=0..numberOfPages-1 (84 per page), 500 ms apart, retry once
    |      |      +--> src/apiParser.js normalizes JSON into product objects
    |      +--> Dedupe by code across categories; return products + coverage report
    |
    +--> src/filter.js categorizes products:
    |      +--> Merge colour variants (same brand + name) into one style with codes[] and colors[]
    |      +--> High-value alerts: 70%+ discount AND (category keyword OR designer brand), whole-word matching
    |      +--> Summary items: <70% discount AND (category keyword OR designer brand)
    |
    +--> Deduplicate high-value alerts against state:
    |      +--> New products -> notify
    |      +--> Price drops -> re-notify with "Further Reduced" styling
    |      +--> Already notified at same/lower price -> skip
    |
    +--> Deduplicate summary items against state.summarized (new-only summary)
    |
    +--> src/discord.js sends notifications:
    |      +--> #price-alerts: new finds + price drops (with @here)
    |      +--> #hourly-summaries: only when there are alerts, new summary deals, or coverage warnings (silent)
    |
    +--> Save updated state to state/notified.json
    +--> GitHub Actions commits state file back to repo
```

## 2. Key Technical Decisions

*   **Direct API paging over DOM scraping:** Holt Renfrew uses SAP Hybris with a JSON API at `/en/c/{category}/results`. The scraper calls it with in-page `fetch()` after one landing-page load. Paging uses `page=`; `currentPage=` is ignored by the API (this bug limited every category to 84 products until 2026-09-10). No DOM fallback: a failed category is reported, not guessed.
*   **Colour variants are one style:** each colour is a separate product code with the same brand + name; the filter merges them so one deal produces one alert.
*   **Puppeteer retained:** Site blocks direct HTTP requests (CloudFlare WAF). Need real browser context for cookies/headers.
*   **Git-based state persistence:** `state/notified.json` is committed by GitHub Actions after each run. Ensures dedup state survives across ephemeral CI runs.
*   **Product identity by code:** Products keyed by Hybris product code (SKU), the most stable identifier.
*   **Price-drop re-notification:** If a previously-notified product drops further in price, it triggers a new alert with distinct styling.

## 3. Data Flow

1.  Puppeteer opens the sale landing page once
2.  For each category facet, `page.evaluate(fetch(...))` requests `/en/c/WomensSale/results?...&page=N` using browser cookies
3.  JSON has `results[]` (84 per page) and `pagination` (`numberOfPages`, `totalNumberOfResults`)
4.  `apiParser.js` normalizes each product: code, name, brand, color, prices, discountPercent, imageUrl, productUrl
5.  Coverage compares unique codes collected with `totalNumberOfResults`
6.  `filter.js` merges colour variants, then categorizes by discount threshold + brand/category matching
7.  `state.js` deduplicates alerts (`products`) and summary items (`summarized`)
8.  `discord.js` sends embeds for new/price-drop products; summary only when something is new
9.  State saved to disk, committed by CI

## 4. Key Patterns

*   **Environment-Driven Configuration:** Discord token via env var, everything else in `config.json`
*   **API-First Scraping:** Structured JSON from intercepted API calls, DOM fallback only as degraded mode
*   **State-Based Deduplication:** Persistent tracking prevents repeat notifications
*   **Scheduled Atomic Execution:** Each run is self-contained: load state -> scrape -> filter -> dedup -> notify -> save state

## 5. Stock Watcher (separate pipeline)

```
GitHub Actions stock-watcher.yml (cron */10, restore state/stock.json from Actions cache)
    |
npm run stock -> src/stock/index.js
    +--> config.stockWatch.products[].listings[] -> one entry per retailer listing
    +--> Skip listings still in block backoff (stockState.isDue)
    +--> One Puppeteer browser; for each due listing: RETAILERS[retailer].check(page, listing)
    |      src/stock/retailers.js loads the page, detects block pages, reads data
    |      src/stock/parsers.js (pure) turns data into { status, detail, price }
    +--> stockState.applyResult: status transition -> event
    |      in_stock (@here embed) | sold_out | listed | third_party | blocked_warning | unblocked (quiet notes)
    +--> Discord login only if there are events; announce BEFORE saving state
    +--> Save state/stock.json -> Actions cache
```

*   **Statuses:** in_stock, out_of_stock, not_listed, third_party, blocked, error. Blocked/error keep the last known status and back off 10 -> 20 -> 40 -> 80 -> 120 min; quiet warning on the 3rd consecutive failure.
*   **Seller guard:** Best Buy (`sellerId` must be `bbyca`) and Walmart (`sellerName` must start with Walmart); marketplace listings are `third_party`, never @here.
*   **Why Actions cache, not git:** a 10-minute cadence would create constant commits and push races with the Holt Renfrew state commit.
*   **Alert only:** no cart or checkout automation, no CAPTCHA/bot-check bypass.
