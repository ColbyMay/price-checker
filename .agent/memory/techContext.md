# Tech Context: Price Checker App

## 1. Core Technologies

*   **Runtime:** Node.js 22 (LTS) in CI (moved from end-of-life Node 18 on 2026-09-10)
*   **Package Manager:** npm
*   **Hosting/Scheduling:** GitHub Actions (cron: every hour)

## 2. Dependencies

*   **`puppeteer` ^22.8.2** — Headless browser for navigating Holt Renfrew (required due to CloudFlare WAF blocking direct HTTP). Used for API interception, not DOM scraping.
*   **`discord.js` ^14.14.1** — Discord API client for sending rich embed notifications
*   **`dotenv` ^16.3.1** — Loads `.env` file for local development

## 3. Key Files

| File | Purpose |
|------|---------|
| `src/index.js` | Orchestrator: config, scrape, filter, dedup, notify, new-only summary, save state |
| `src/scraper.js` | One Puppeteer session; pages the Hybris `/results` API with in-page fetch; coverage report |
| `src/apiParser.js` | Normalizes Hybris JSON into standard product objects |
| `src/filter.js` | Whole-word matching, colour-variant grouping, alert/summary bucketing |
| `src/discord.js` | Discord notification service with price-drop styling and colour list |
| `src/state.js` | State v2: `products` (alerts) and `summarized` buckets; load, check, mark, prune, save |
| `src/test.js` | Offline checks (Holt Renfrew + stock watcher); `--test-scraping` and `--test-discord` flags for live checks |
| `src/stock/index.js` | Stock watcher entry (`npm run stock`, `--dry-run`) |
| `src/stock/retailers.js` | Per-retailer page loading and block detection (`RETAILERS` map) |
| `src/stock/parsers.js` | Pure parsers for Nintendo, Best Buy, Walmart, JSON-LD; `STATUS` values |
| `src/stock/stockState.js` | `state/stock.json` load/save, backoff, transition -> event rules |
| `config.json` | All configuration (site, category facets, brands, thresholds, channel names) |
| `state/notified.json` | Persisted notification state (git-committed by CI) |

## 4. Configuration

**Environment Variables (Secrets):**
*   `DISCORD_BOT_TOKEN` — Bot authentication token

**config.json fields:**
*   `website.baseUrl`, `website.landingPath` — Sale page opened once for cookies
*   `website.saleCategory` — API category (`WomensSale`)
*   `website.sort` — API sort code (`date-desc`)
*   `website.categories` — `[{ name, facet }]` sections to scrape (`womensshoes`, `womensbags`, `jewellerywatches`, `womensaccessories`)
*   `monitoring.minDiscountPercent` — Minimum discount for high-value alerts (70)
*   `monitoring.categories` — Product category keywords to match
*   `monitoring.designerBrands` — Designer brand names to match
*   `discord.alertChannelName` — Channel for deal alerts ("price-alerts")
*   `discord.summaryChannelName` — Channel for hourly summaries ("hourly-summaries")
*   `state.maxAgeDays` — Days before pruning unseen products from state (14)
*   `state.renotifyOnPriceDrop` — Whether to re-notify when price drops further (true)

## 5. Holt Renfrew API Details

*   **Platform:** SAP Hybris (Spartacus/Accelerator frontend)
*   **API endpoint pattern:** `/en/c/WomensSale/results?sort=date-desc&q=:date-desc:storefrontFacetCategories:{facet}&grid=2&page={n}`
*   **Response structure:**
    *   `results[]` — Product array with: code, name, brand, color, price, regularPriceRange, salePercentage, availabilityOnline, variantsProductCode, secondid, images, url
    *   `pagination` — { pageSize: 84, currentPage, numberOfPages, totalNumberOfResults, sort }
    *   `facets[]` — includes `storefrontfacetcategories` (category codes and counts) and `currentpercentageoff` (`n_6` = >70%)
*   **Pagination:** 0-based, 84 items per page, **`page=` param only**. `currentPage=` is ignored (returns page 0); `pageSize=` is ignored.
*   **Sort:** the `sort=` param wins over the sort inside `q`; send both as `date-desc` for a stable order
*   **Colour variants:** each colour is its own product code with identical brand + name (`secondid` like `20528445_mist_suede`)
*   **Sizes (2026-09-10):** WomensSale 1,135 items (791 clothing); MensSale 603 items
*   **Protection:** CloudFlare WAF blocks non-browser requests; Puppeteer required for valid browser context

## 6. GitHub Actions Workflow

*   Runs hourly (`0 * * * *`) with manual dispatch option
*   Concurrency group prevents overlapping runs
*   `permissions: contents: write` for state file commits
*   Post-run step commits `state/notified.json` changes
*   `stock-watcher.yml`: every 10 minutes, `permissions: contents: read`, caches `~/.cache/puppeteer`, restores/saves `state/stock.json` via `actions/cache/restore` + `actions/cache/save` keyed `stock-state-<run_id>` with `stock-state-` restore prefix

## 7. Stock Watcher Retailer Details (verified live 2026-09-10)

| Retailer id | How stock is read | Notes |
|------|---------|---------|
| `nintendo-ca` | Page `__NEXT_DATA__` -> `props.pageProps.initialApolloState['Product:{"sku":"<sku>"}'].isSalableQty` (+ `prePurchase`) | SKUs are shared between the US and CA stores. Unlisted CA product returns a "Whoops!" page -> `not_listed`. |
| `bestbuy-ca` | Plain Node `fetch` (no browser) of `GET https://www.bestbuy.ca/ecomm-api/availability/products?accept=application%2Fvnd.bestbuy.standardproduct.v1%2Bjson&accept-language=en-CA&skus=<sku>` | Response has a BOM (use `trim()` before `JSON.parse`). `shipping.status` e.g. `SoldOutOnline`, `shipping.purchasable`, `pickup.purchasable`, `sellerId` (`bbyca`). Works without `postalCode`. No JSON-LD price on the page. |
| `walmart-ca` | Page `__NEXT_DATA__` -> `props.pageProps.initialData.data.product.availabilityStatus` (`IN_STOCK` / `OUT_OF_STOCK`), `sellerName`, `preOrder.isPreOrder`, `priceInfo.currentPrice` | Heaviest bot protection (PerimeterX "Press & Hold"). |
| `ebgames` | Generic schema.org JSON-LD `offers.availability` | Odoo eCommerce site. Blocked the in-app browser (Cloudflare "Access denied") and usually GitHub runners ("Just a moment..."); headless Puppeteer from home got through. JSON-LD `OutOfStock` ($124.99 CAD) matched the real page ("Out of stock", confirmed by the user 2026-09-10). A `Preorder` anchor (`a.js_check_product`) is present in the DOM even when out of stock (hidden template markup), so never read stock from it. |

**First dry run (2026-09-10, home connection, headless Puppeteer):** Nintendo CA `not_listed`; **Best Buy CA `blocked` (HTTP 403 "Access Denied" on the product page)**; Walmart.ca `out_of_stock` $124.96; EB Games `out_of_stock` $124.99. Best Buy's page blocks headless Chromium, but a plain HTTPS request to the availability API returned 200 JSON, so the checker now calls the API directly and never loads the page. Do not add stealth plugins or fingerprint spoofing to get around blocks.

Zelda 40th Anniversary Switch 2 Pro Controller: $99.99 USD, release 2026-10-29; the version with a display stand is Nintendo Store exclusive.
