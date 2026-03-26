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
    +--> For each category (Shoes, Bags, Jewelry, Accessories):
    |      |
    |      v
    |    src/scraper.js (Puppeteer API interception)
    |      |
    |      +--> Launch headless browser
    |      +--> Navigate to category page
    |      +--> Intercept Hybris API JSON response
    |      +--> Parse pagination, fetch remaining pages via fetch() in browser context
    |      +--> src/apiParser.js normalizes JSON into product objects
    |
    +--> src/filter.js categorizes products:
    |      +--> High-value alerts: 70%+ discount AND (category match OR designer brand)
    |      +--> Summary items: <70% discount AND (category match OR designer brand)
    |
    +--> Deduplicate high-value alerts against state:
    |      +--> New products -> notify
    |      +--> Price drops -> re-notify with "Further Reduced" styling
    |      +--> Already notified at same/lower price -> skip
    |
    +--> src/discord.js sends notifications:
    |      +--> #price-alerts: new finds + price drops (with @here)
    |      +--> #hourly-summaries: scan summary (silent)
    |
    +--> Save updated state to state/notified.json
    +--> GitHub Actions commits state file back to repo
```

## 2. Key Technical Decisions

*   **API interception over DOM scraping:** Holt Renfrew uses SAP Hybris with a JSON API at `/en/c/{category}/results`. Puppeteer intercepts this response to get structured product data. No CSS selector guessing needed.
*   **Puppeteer retained:** Site blocks direct HTTP requests (CloudFlare WAF). Need real browser context for cookies/headers.
*   **Git-based state persistence:** `state/notified.json` is committed by GitHub Actions after each run. Ensures dedup state survives across ephemeral CI runs.
*   **Product identity by code:** Products keyed by Hybris product code (SKU), the most stable identifier.
*   **Price-drop re-notification:** If a previously-notified product drops further in price, it triggers a new alert with distinct styling.

## 3. Data Flow

1.  Puppeteer navigates to category page URL
2.  Browser makes XHR to `/en/c/WomensSale/results?...&grid=2`
3.  Response intercepted: JSON with `results[]` array and `pagination` object
4.  `apiParser.js` normalizes each product: code, name, brand, prices, discountPercent, imageUrl, productUrl
5.  For multi-page results: `page.evaluate(fetch(...))` calls subsequent pages using browser cookies
6.  `filter.js` categorizes by discount threshold + brand/category matching
7.  `state.js` deduplicates against previously notified products
8.  `discord.js` sends embeds for new/price-drop products only
9.  State saved to disk, committed by CI

## 4. Key Patterns

*   **Environment-Driven Configuration:** Discord token via env var, everything else in `config.json`
*   **API-First Scraping:** Structured JSON from intercepted API calls, DOM fallback only as degraded mode
*   **State-Based Deduplication:** Persistent tracking prevents repeat notifications
*   **Scheduled Atomic Execution:** Each run is self-contained: load state -> scrape -> filter -> dedup -> notify -> save state
