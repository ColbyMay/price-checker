# Tech Context: Price Checker App

## 1. Core Technologies

*   **Runtime:** Node.js 18 (LTS)
*   **Package Manager:** npm
*   **Hosting/Scheduling:** GitHub Actions (cron: every hour)

## 2. Dependencies

*   **`puppeteer` ^22.8.2** — Headless browser for navigating Holt Renfrew (required due to CloudFlare WAF blocking direct HTTP). Used for API interception, not DOM scraping.
*   **`discord.js` ^14.14.1** — Discord API client for sending rich embed notifications
*   **`dotenv` ^16.3.1** — Loads `.env` file for local development

## 3. Key Files

| File | Purpose |
|------|---------|
| `src/index.js` | Orchestrator: config, scrape, filter, dedup, notify, save state |
| `src/scraper.js` | Puppeteer network interception to capture Hybris API responses |
| `src/apiParser.js` | Normalizes Hybris JSON into standard product objects |
| `src/filter.js` | Categorizes products by discount threshold + brand/category |
| `src/discord.js` | Discord notification service with price-drop styling |
| `src/state.js` | State persistence: load, check, mark, prune, save |
| `config.json` | All configuration (URLs, brands, thresholds, channel names) |
| `state/notified.json` | Persisted notification state (git-committed by CI) |

## 4. Configuration

**Environment Variables (Secrets):**
*   `DISCORD_BOT_TOKEN` — Bot authentication token

**config.json fields:**
*   `website.url` — Base Holt Renfrew sale URL
*   `monitoring.minDiscountPercent` — Minimum discount for high-value alerts (70)
*   `monitoring.categories` — Product category keywords to match
*   `monitoring.designerBrands` — Designer brand names to match
*   `discord.alertChannelName` — Channel for deal alerts ("price-alerts")
*   `discord.summaryChannelName` — Channel for hourly summaries ("hourly-summaries")
*   `state.maxAgeDays` — Days before pruning unseen products from state (14)
*   `state.renotifyOnPriceDrop` — Whether to re-notify when price drops further (true)

## 5. Holt Renfrew API Details

*   **Platform:** SAP Hybris (Spartacus/Accelerator frontend)
*   **API endpoint pattern:** `/en/c/WomensSale/results?sort=relevance&q={filters}&grid=2&currentPage={n}`
*   **Response structure:**
    *   `results[]` — Product array with: code, name, brand, price, regularPriceRange, salePercentage, images, url
    *   `pagination` — { pageSize: 21, currentPage: 0, numberOfPages: N, totalNumberOfResults: N }
*   **Pagination:** 0-based page numbers, 21 items per page, accessed via `currentPage` query param
*   **Protection:** CloudFlare WAF blocks non-browser requests; Puppeteer required for valid browser context

## 6. GitHub Actions Workflow

*   Runs hourly (`0 * * * *`) with manual dispatch option
*   Concurrency group prevents overlapping runs
*   `permissions: contents: write` for state file commits
*   Post-run step commits `state/notified.json` changes
