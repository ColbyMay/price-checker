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

*   **Stock watcher (written 2026-09-10, not yet run in CI):** Nintendo CA, Best Buy CA, Walmart.ca, EB Games (best effort); @here on in-stock transitions only; seller checks for Walmart/Best Buy; per-retailer backoff on blocks

## 2. What's Left

*   Commit the stock watcher; push and merge both branches; create `#stock-alerts`
*   Confirm from CI logs which retailers block GitHub-hosted runners
*   `npm audit`: 14 vulnerabilities (1 critical) in existing dependencies
*   Older duplicate memory folder `memory-bank/` could be removed in favour of `.agent/memory/`

## 3. Known Issues

*   If Holt Renfrew renames facet codes, that category reports 0/0 rather than an error; coverage warnings only catch partial pages. Facet list is available in any `/results` response under `facets[code=storefrontfacetcategories]`.
*   `monitoring.frequency` in config is informational only; the schedule lives in the workflow file.

## 4. Evolution of Decisions

*   **2026-09-10:** Repo made public, which exposed a Discord token committed in `.env.example` (Discord revoked it). Replaced with a placeholder; workflows switched to `npm ci` after a rewritten lockfile broke the state commit step.
*   **2026-09-10:** Added Canadian stock watcher as a separate 10-minute workflow. Considered Vercel (rejected: data-centre IPs, no disk, Chromium size, cron limits) and a Toronto VPS/home machine (better for blocking); user chose to stay on GitHub Actions.
*   **2026-09-10:** Live API investigation found `currentPage` ignored (only page 0 ever scraped), wrong jewellery facet, and colour-variant duplicates. Rewrote scraper/filter/state; summary made new-only; DOM fallback removed; Node 22.
*   **2026-03-26:** Major overhaul: replaced scroll+DOM scraping with API interception, added state persistence for dedup, simplified all modules
*   **Earlier:** Switched from Cheerio to Puppeteer (site requires JS rendering)
*   **Earlier:** Switched from email to Discord notifications
