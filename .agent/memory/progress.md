# Progress: Price Checker App

## Current Status: Holt Renfrew coverage fix written, awaiting test run and commit (2026-09-10)

## 1. What Works

*   **Complete category scraping:** `page=` paging walks every page; live check on 2026-09-10 got Shoes 122/122, Bags 43/43, Accessories 76/76, Jewellery & Watches 87 (previously 0)
*   **Single browser session:** one landing-page load, then in-page `fetch()` for all categories (about 6 requests per run)
*   **Coverage reporting:** per-category collected vs expected; shortfalls posted to the summary channel
*   **Notification deduplication:** state keyed by product code; colour variants merged and tracked under every code; price drops re-notify
*   **New-only hourly summary:** `summarized` state bucket; silent when nothing is new
*   **Whole-word, accent-insensitive filtering**
*   **GitHub Actions:** hourly, Node 22, concurrency-safe, state committed back to the repo

## 2. What's Left

*   Run `npm test` and a live `--test-scraping` pass, then commit
*   Canadian stock watcher for the Zelda 40th Anniversary Switch 2 Pro Controller (Nintendo CA, Best Buy CA, EB Games, Walmart.ca)
*   Older duplicate memory folder `memory-bank/` could be removed in favour of `.agent/memory/`

## 3. Known Issues

*   If Holt Renfrew renames facet codes, that category reports 0/0 rather than an error; coverage warnings only catch partial pages. Facet list is available in any `/results` response under `facets[code=storefrontfacetcategories]`.
*   `monitoring.frequency` in config is informational only; the schedule lives in the workflow file.

## 4. Evolution of Decisions

*   **2026-09-10:** Live API investigation found `currentPage` ignored (only page 0 ever scraped), wrong jewellery facet, and colour-variant duplicates. Rewrote scraper/filter/state; summary made new-only; DOM fallback removed; Node 22.
*   **2026-03-26:** Major overhaul: replaced scroll+DOM scraping with API interception, added state persistence for dedup, simplified all modules
*   **Earlier:** Switched from Cheerio to Puppeteer (site requires JS rendering)
*   **Earlier:** Switched from email to Discord notifications
