# Progress: Price Checker App

## Current Status: Holt Renfrew fix and stock watcher live on `master`, verified in CI (2026-09-10)

## 1. What Works

*   **Complete category scraping:** `page=` paging walks every page; live check on 2026-09-10 got Shoes 122/122, Bags 43/43, Accessories 76/76, Jewellery & Watches 87 (previously 0)
*   **Single browser session:** one landing-page load, then in-page `fetch()` for all categories (about 6 requests per run)
*   **Coverage reporting:** per-category collected vs expected; shortfalls posted to the summary channel
*   **Notification deduplication:** state keyed by product code; colour variants merged and tracked under every code; price drops re-notify
*   **New-only hourly summary:** `summarized` state bucket; silent when nothing is new
*   **Whole-word, accent-insensitive filtering**
*   **GitHub Actions:** hourly, Node 22, concurrency-safe, state committed back to the repo

*   **Stock watcher (live since 2026-09-10):** Nintendo CA, Best Buy CA, Walmart.ca, EB Games (best effort); @here on in-stock transitions only; seller checks for Walmart/Best Buy; per-retailer backoff on blocks. From GitHub runners: Nintendo CA and Best Buy CA work; Walmart.ca and EB Games are blocked most of the time.
*   **CI verified 2026-09-10:** Holt Renfrew run logged in, full coverage (314), alerts + summary sent, state committed; stock watcher cache restore/save works

## 2. What's Left

*   `npm audit`: 14 vulnerabilities (1 critical) in existing dependencies
*   Older duplicate memory folder `memory-bank/` could be removed in favour of `.agent/memory/`

## 3. Known Issues

*   **EB Games DOM has a hidden Preorder anchor:** `a.js_check_product` exists in the page even when the item is out of stock (hidden by the storefront). JSON-LD `availability` matches what shoppers see (confirmed by the user 2026-09-10), so the checker reads JSON-LD, not the button.

*   If Holt Renfrew renames facet codes, that category reports 0/0 rather than an error; coverage warnings only catch partial pages. Facet list is available in any `/results` response under `facets[code=storefrontfacetcategories]`.
*   `monitoring.frequency` in config is informational only; the schedule lives in the workflow file.

## 4. Evolution of Decisions

*   **2026-09-10:** Repo made public, which exposed a Discord token committed in `.env.example` (Discord revoked it). Replaced with a placeholder; workflows switched to `npm ci` after a rewritten lockfile broke the state commit step.
*   **2026-09-10:** Added Canadian stock watcher as a separate 10-minute workflow. Considered Vercel (rejected: data-centre IPs, no disk, Chromium size, cron limits) and a Toronto VPS/home machine (better for blocking); user chose to stay on GitHub Actions.
*   **2026-09-10:** Live API investigation found `currentPage` ignored (only page 0 ever scraped), wrong jewellery facet, and colour-variant duplicates. Rewrote scraper/filter/state; summary made new-only; DOM fallback removed; Node 22.
*   **2026-03-26:** Major overhaul: replaced scroll+DOM scraping with API interception, added state persistence for dedup, simplified all modules
*   **Earlier:** Switched from Cheerio to Puppeteer (site requires JS rendering)
*   **Earlier:** Switched from email to Discord notifications
