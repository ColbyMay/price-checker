# Active Context: Price Checker App

## 1. Current Work Focus

*   **Phase:** Project Initialization and Planning.
*   **Current Activity:** Defining the initial project structure, core requirements, and technical approach. Setting up the Memory Bank.
*   **Immediate Goal:** Finalize the initial plan and gather any prerequisite information before starting implementation.

## 2. Recent Changes & Decisions

*   **Memory Bank Setup:** Core documents created. Now updating to reflect switch to Discord notifications.
*   **Core Technologies Confirmed:** Node.js, `axios`, `cheerio`, `discord.js`, GitHub Actions for scheduling.
*   **Initial Scraping Assumption:** The target website's content is assumed to be static or server-rendered, making `cheerio` a suitable choice. If dynamic content loading is discovered, a re-evaluation (potentially to Puppeteer/Playwright) will be needed.
*   **Notification Method Changed:** Switched from Email (Nodemailer) to Discord Bot (`discord.js`).
    *   User provided Bot Token and Channel URL. Channel ID extracted: `1376958129576869928`.
    *   **Action Required by User:** Secure the Bot Token as a GitHub Secret (`DISCORD_BOT_TOKEN`). The Channel ID will also be a secret (`DISCORD_CHANNEL_ID`).

## 3. Next Steps (Planned)

1.  Create `progress.md` to complete the initial Memory Bank setup.
2.  Present the overall plan to the user for approval/feedback.
3.  **Configuration Status & Next Steps:**
    *   **`TARGET_URL`**: `https://www.holtrenfrew.com/en/Products/Womens/Collections/Sale/c/WomensSale` ✓ RECEIVED
    *   **`DISCOUNT_PERCENTAGE`**: `75` (for 75% off) ✓ RECEIVED
    *   **`SCRAPE_INTERVAL_HOURS`**: `6` ✓ RECEIVED (Cron: `0 */6 * * *`)
    *   **`DISCORD_CHANNEL_ID`**: `1376958129576869928` ✓ RECEIVED (from URL)
    *   **`DISCORD_BOT_TOKEN`**: Provided by user. ⚠️ **Action Required by User: Store this token as a GitHub Secret named `DISCORD_BOT_TOKEN`. Do not commit it directly.**
    *   All other configuration details for scraping are now available.
4.  Once the Discord Bot Token is secured as a GitHub Secret and the user approves the updated plan:
    *   Initialize the Node.js project (`package.json`).
    *   Install dependencies (`axios`, `cheerio`, `discord.js`, `dotenv`).
    *   Develop the `price-checker.js` script, starting with fetching and basic parsing.
    *   Iteratively develop product extraction logic (this will require inspecting the `TARGET_URL`'s HTML).
    *   Implement discount calculation and filtering.
    *   Implement Discord notification functionality using `discord.js`.
    *   Create the GitHub Actions workflow file (`.github/workflows/main.yml`).
    *   Test locally (with a `.env` file).
    *   Test via GitHub Actions (manually triggering the workflow initially).

## 4. Active Considerations & Potential Blockers

*   **Target URL Analysis:** The provided URL (`https://www.holtrenfrew.com/en/Products/Womens/Collections/Sale/c/WomensSale`) needs to be analyzed to determine if `cheerio` is sufficient or if the content is dynamically loaded. This will also inform the CSS selector strategy.
*   **CSS Selectors:** Identifying robust CSS selectors for the Holt Renfrew site will be an iterative process.
*   **Anti-Scraping Measures:** The chosen `TARGET_URL` might have anti-scraping measures that could complicate development.
*   **Discord Bot Token Security:** User must ensure the Bot Token is stored securely as a GitHub Secret and not exposed.
*   **Discord Bot Permissions:** The bot will need correct permissions on the Discord server to send messages to the specified channel.

## 5. Important Patterns & Preferences (Emerging)

*   **Memory Bank Driven Development:** All significant decisions, context, and progress will be logged in the Memory Bank.
*   **Configuration via Environment Variables/Secrets:** Prioritizing this for security and flexibility within GitHub Actions.
*   **Iterative Development:** Especially for the scraper logic, which will likely require adjustments based on the target site.
*   **Start Simple:** Begin with `cheerio` and basic functionality, only escalating to more complex tools (like Puppeteer) if proven necessary.
