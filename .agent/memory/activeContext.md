# Active Context: Price Checker App

## 1. Current Work Focus

*   **Phase:** Both pipelines live on `master` and verified in CI (2026-09-10)
*   **Current Activity:** Monitoring scheduled runs
*   **Immediate Goal:** None pending; wait for the Zelda Pro Controller to come into stock

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

## 4. Stock Watcher (built 2026-09-10)

*   `src/stock/` + `.github/workflows/stock-watcher.yml`, every 10 minutes (repo is public, so Actions minutes are free), `npm run stock` (`-- --dry-run` for local checks)
*   Watches the Zelda 40th Anniversary Switch 2 Pro Controller at Nintendo CA (SKU 127074, not listed in Canada on 2026-09-10), Best Buy CA (20149830, SoldOutOnline), Walmart.ca (3CVEAW67GHIT, OUT_OF_STOCK pre-order), EB Games (220623, Cloudflare "Access denied" even from a home connection, kept as best effort)
*   Posts to a new `#stock-alerts` channel (user must create it and give the bot access)
*   State in the GitHub Actions cache, not git (`state/stock.json` is gitignored)
*   Holt Renfrew fix + stock watcher merged to `master` via PR #1 (merge commit `f3b8164`, 2026-09-10).
*   **First CI runs (2026-09-10):** Stock Watcher succeeded: Nintendo CA not_listed, Best Buy CA out_of_stock (direct API works from GitHub runners), Walmart.ca blocked, EB Games blocked (Cloudflare "Just a moment..."). Expect Walmart/EB Games to stay mostly blocked from Actions.
*   **Security incident (2026-09-10):** a real Discord bot token had been committed in `.env.example` since commit `0d84afa` (2025-06-12). Making the repo public exposed it; Discord invalidated it (`TokenInvalid` in CI). User resets the token and updates the `DISCORD_BOT_TOKEN` Actions secret. `.env.example` now holds a placeholder. Full-history scan found no other real secrets (the SECRET_KEY/DISCORD_TOKEN hits are committed node_modules/dotenv README samples in `f965952`/`b5860b6`). No history rewrite needed once the token is reset. Never put real values in `.env.example`.
*   **Resolved and verified (2026-09-10):** PR #2 merged (`694a396`); user reset the token and updated the `DISCORD_BOT_TOKEN` secret. Manual runs then passed: Holt Renfrew logged in as `Price checker#8926`, scraped 314/314, merged 37 colour variants (277 styles), sent 2 new 70%+ alerts (1 already alerted), posted the one-time catch-up summary (231 deals), and the state commit pushed (`1b26476`). Stock watcher restored its cache, skipped Walmart.ca and EB Games (backing off after blocks), read Nintendo CA not_listed and Best Buy CA SoldOutOnline.
*   **EB Games checked (2026-09-10):** JSON-LD `availability: OutOfStock` ($124.99 CAD) matches what the user sees in a real browser ("Out of stock", no Preorder button). The headless DOM contains a `Preorder` anchor (`a.btn.btn-primary.js_check_product.a-submit`), but it is template markup that the Odoo storefront hides when the item is unavailable; do not read stock from it. Keep the JSON-LD checker; EB Games stays on the watch list until it is available. EB Games is usually blocked from GitHub runners ("Just a moment..."), so it only reports when a run gets through. Their page lists the release date as 2025-10-29 (their typo).
*   **CI state-commit failure (2026-09-10):** `npm install` on the runner rewrote `package-lock.json` (local npm 11 vs runner npm), leaving an unstaged change that made `git pull --rebase` fail, so Holt Renfrew state would never be saved (duplicate alerts). Fixed: both workflows use `npm ci`; state commit uses `git pull --rebase --autostash`.
*   First dry run: Nintendo CA not_listed, Best Buy CA blocked (403 on headless page load), Walmart.ca out_of_stock, EB Games out_of_stock (works). Fix (user chose option A): Best Buy checker calls the availability API with plain `fetch`, no page load.

## 5. Next Steps

1.  Watch the next hourly Holt Renfrew runs: summaries should now be new-only (silent when nothing new)
2.  Watch for the quiet "check keeps failing" warnings for Walmart.ca and EB Games in `#stock-alerts`
3.  Separate small task: `npm audit` reports 14 vulnerabilities in existing dependencies; GitHub warns actions using Node 20 (cache/checkout/setup-node v4) are deprecated
4.  Optional cleanup: delete merged remote branches `feature/stock-watcher` and `fix/secret-and-ci`; remove legacy `memory-bank/`

## 6. Active Considerations

*   Accessories without a keyword (sunglasses, hats, scarves, belts) still only qualify via a designer brand, same as before.
*   GitHub-hosted runners are US data-centre IPs; Holt Renfrew has not blocked them so far.
