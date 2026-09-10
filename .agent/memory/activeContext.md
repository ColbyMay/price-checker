# Active Context: Price Checker App

## 1. Current Work Focus

*   **Phase:** Holt Renfrew coverage + duplicate fix (2026-09-10), then Canadian stock watcher
*   **Current Activity:** Scraper rewritten after live API investigation; stock watcher for the Zelda 40th Anniversary Switch 2 Pro Controller is next
*   **Immediate Goal:** Verify the fix with `npm test` and `npm test -- --test-scraping`, then commit on a branch

## 2. Recent Changes & Decisions (2026-09-10)

*   **Root cause of missing products:** the `/results` API pages with `page=` and silently ignores `currentPage=`. The old scraper requested `currentPage=N`, so every "next page" was page 0 again: only the first 84 products per category were ever seen, and the rest of the rows were repeats.
*   **Jewellery was always empty:** facet `WomensJewellery` does not exist; the real code is `jewellerywatches` (87 sale items on 2026-09-10). Facet codes are lowercase: `womensshoes`, `womensbags`, `womensaccessories`, `jewellerywatches`.
*   **Page size is 84** (not 21); `pageSize=` is ignored. `sort=` overrides the sort embedded in `q`; the scraper now sends `sort=date-desc` and `q=:date-desc:...` consistently.
*   **Scraper (`src/scraper.js`) rewritten:** one browser, open the sale landing page once (Cloudflare cookies), then fetch every page of every configured category with in-page `fetch()`; 500 ms between requests, one retry after 5 s, coverage report per category (collected vs `totalNumberOfResults`). DOM fallback removed: it keyed products by URL hash, so any fallback run re-alerted everything.
*   **Filter (`src/filter.js`):** whole-word, accent-insensitive keyword and brand matching ("ring" no longer matches "string"; "Chloe" matches `CHLOÉ`). Colour variants (same brand + name, different codes) are merged into one style carrying `codes` and `colors`.
*   **State (`src/state.js`) v2:** new `summarized` bucket next to `products`; v1 files upgrade in place. Grouped products write/check every variant code.
*   **Hourly summary:** now new-only. It lists lower-discount deals not summarized before (or cheaper since), stays silent when nothing is new, trims to fit Discord's 2000-char limit, and reports incomplete categories.
*   **Config:** categories moved from hard-coded `index.js` into `config.website.categories` (name + facet). Added `bags`, `watch`, `watches` keywords.
*   **Workflow:** Node 18 (end of life) to Node 22.
*   **`src/test.js`:** was broken (imported functions that no longer existed); rewritten as offline checks plus `--test-scraping` / `--test-discord` flags.

## 3. User Decisions (2026-09-10)

*   Holt Renfrew scope stays women's shoes, bags, jewellery & watches, accessories (not clothing or men's, even though most 70%+ deals are in clothing).
*   Hourly summary: new-only.
*   Hosting: stay on GitHub Actions (user chose this over a Toronto VPS or a home machine, accepting slower and more-blocked stock checks).
*   Stock watcher: Canadian retailers only (Nintendo Store CA, Best Buy CA, EB Games, Walmart.ca); alerts to Discord; notify only, never auto-buy; back off when blocked, never bypass CAPTCHAs.

## 4. Next Steps

1.  Run `npm test` and `npm test -- --test-scraping`; confirm every category reports collected == expected
2.  Commit the Holt Renfrew fix on a feature branch
3.  Research how each Canadian retailer exposes stock for the Zelda Pro Controller, then build `src/stock/` as a separate workflow
4.  Watch the first CI runs for summary volume (the first run lists up to 8 of all current lower-discount deals once)

## 5. Active Considerations

*   Accessories without a keyword (sunglasses, hats, scarves, belts) still only qualify via a designer brand, same as before.
*   GitHub-hosted runners are US data-centre IPs; Holt Renfrew has not blocked them so far.
