# Progress: Price Checker App

## Current Status: Planning Phase

**Last Updated:** (Will be updated as work progresses)

## 1. What Works / Completed

*   **Project Initialization & Memory Bank Setup:**
    *   `projectbrief.md`: Core requirements and project scope defined.
    *   `productContext.md`: Problem statement, user perspective, and value proposition outlined.
    *   `systemPatterns.md`: High-level architecture, key technical decisions, and data flow mapped out.
    *   `techContext.md`: Technologies, libraries, development setup, and configuration variables identified.
    *   `activeContext.md`: Current focus, next steps, and potential blockers documented.
    *   `progress.md`: This file, established to track progress.
*   **Initial Technical Stack Updated:** Node.js, Axios, Cheerio, `discord.js`, GitHub Actions.

## 2. What's Left to Build / Next Steps

*   **A. Gather Essential Configuration Details:**
    1.  **Target URL:** `https://www.holtrenfrew.com/en/Products/Womens/Collections/Sale/c/WomensSale` ✓ RECEIVED
    2.  **Minimum Discount Percentage:** `75` (for 75% off) ✓ RECEIVED
    3.  **Scraping Interval:** `6` hours (Cron: `0 */6 * * *`) ✓ RECEIVED
    4.  **Discord Channel ID:** `1376958129576869928` (from URL) ✓ RECEIVED
    5.  **Discord Bot Token:** Provided by user. ⚠️ **Action Required by User: Store this token as a GitHub Secret named `DISCORD_BOT_TOKEN`.**

*   **B. Core Application Development (Post-Configuration Gathering & Bot Token Secured):**
    1.  **Project Setup:**
        *   Initialize `package.json` (`npm init -y`).
        *   Install dependencies: `npm install axios cheerio discord.js dotenv` (dotenv for local .env file handling).
        *   Create `.gitignore` (to exclude `node_modules/`, `.env`, etc.).
    2.  **Main Script (`price-checker.js`):**
        *   Implement environment variable loading for configuration.
        *   **Module 1: `fetchPage(url)`:**
            *   Use `axios` to get HTML content from `TARGET_URL`.
            *   Basic error handling for network issues.
        *   **Module 2: `parseProducts(htmlContent)`:**
            *   Use `cheerio` to load HTML.
            *   Identify and implement CSS selectors for product details (container, name, current price, original price).
            *   Extract data for all products.
            *   Handle missing data.
        *   **Module 3: `filterDiscountedProducts(products, discountPercentage)`:**
            *   Calculate and filter products based on `DISCOUNT_PERCENTAGE`.
        *   **Module 4: `sendDiscordNotification(products, botToken, channelId)`:**
            *   Use `discord.js` to log in the bot.
            *   Format a message with the list of discounted products.
            *   Send the message to `DISCORD_CHANNEL_ID`.
            *   Error handling for Discord API interactions.
        *   **Main execution logic:** Orchestrate calls to the above modules.
    3.  **Local Testing:**
        *   Create a `.env` file with test configurations.
        *   Run `node price-checker.js` locally to test full flow.

*   **C. GitHub Actions Workflow (`.github/workflows/main.yml`):**
    1.  Define cron schedule based on `SCRAPE_INTERVAL_HOURS`.
    2.  Set up Node.js environment.
    3.  Checkout code.
    4.  Install dependencies.
    5.  Run the `price-checker.js` script, passing GitHub Secrets as environment variables.
    6.  Test the workflow (manual trigger initially, then observe scheduled runs).

*   **D. Documentation & Refinement:**
    1.  Add comments to the code.
    2.  Update `README.md` with setup instructions, configuration details, and how to use GitHub Secrets.
    3.  Refine Memory Bank files as development progresses and decisions evolve.

## 3. Known Issues / Blockers

*   **Discord Bot Token Security:** User needs to confirm the Bot Token has been stored as a GitHub Secret (`DISCORD_BOT_TOKEN`) before proceeding with implementation that uses it.
*   **Discord Bot Permissions:** Ensure the bot has necessary permissions (e.g., "Send Messages") in the target channel on the Discord server.
*   **Potential for Anti-Scraping Measures:** The chosen `TARGET_URL` might employ techniques that block or hinder basic scraping attempts with `cheerio`. This can only be assessed once the URL is known and initial scraping attempts are made.

## 4. Evolution of Project Decisions

*   *(This section will be populated as the project evolves and decisions are made or changed.)*
    *   **Initial Decision (YYYY-MM-DD):** Start with `cheerio` for scraping, assuming static content. If dynamic content is encountered, re-evaluate for `puppeteer`/`playwright`.
    *   **Initial Decision (YYYY-MM-DD):** Original plan was email notifications.
    *   **Decision Update (YYYY-MM-DD):** Switched notification method from Email (Nodemailer) to Discord Bot (`discord.js`) based on user request.
