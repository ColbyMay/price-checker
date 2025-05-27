# Tech Context: Price Checker App

## 1. Core Technologies

*   **Runtime Environment:** Node.js (LTS version recommended, e.g., 18.x, 20.x). The specific version will be defined in the GitHub Actions workflow.
*   **Package Manager:** npm (comes with Node.js).
*   **Version Control:** Git.
*   **Hosting/Scheduling:** GitHub Actions.

## 2. Key Node.js Libraries (Initial Plan)

*   **`axios`:** For making HTTP requests to fetch the target URL's HTML content.
    *   *Alternatives:* Node.js built-in `http`/`https` modules, `node-fetch`. `axios` is generally preferred for its ease of use and promise-based API.
*   **`cheerio`:** For parsing HTML and extracting data using CSS selectors. It provides a fast, flexible, and lean implementation of core jQuery designed specifically for the server.
    *   *Alternatives for dynamic sites:* `puppeteer`, `playwright`. These are full browser automation tools, more powerful but also heavier and more complex. We will start with `cheerio` assuming static content.
*   **`discord.js`:** For interacting with the Discord API to send notifications.
    *   This library will be used to log in as the bot and send messages to the specified channel.

## 3. Development Setup

*   **Local Development:**
    *   Node.js and npm installed locally.
    *   A code editor (e.g., VS Code).
    *   Git for version control.
    *   Developers will need to manage environment variables locally (e.g., using a `.env` file, which **must be gitignored**) for testing the script before committing.
*   **GitHub Repository:**
    *   The code will be hosted on GitHub.
    *   GitHub Actions will be used for CI/CD (specifically, for the scheduled execution).
    *   **Secrets Management:** Sensitive configuration (Target URL, Discount Percentage, Discord Bot Token, Discord Channel ID) will be stored as GitHub Secrets and accessed as environment variables in the workflow.

## 4. Configuration Variables (Environment Variables)

The script will expect the following environment variables to be set:

*   `TARGET_URL`: The full URL of the webpage to scrape.
*   `DISCOUNT_PERCENTAGE`: The minimum percentage off (e.g., `30` for 30%) for a product to be included in the notification.
*   `DISCORD_BOT_TOKEN`: The token for the Discord bot to authenticate.
*   `DISCORD_CHANNEL_ID`: The ID of the Discord channel where notifications will be sent.
*   `SCRAPE_INTERVAL_HOURS`: (This will be translated into a cron expression in the GitHub workflow, e.g., `0 */X * * *` for every X hours). While the script itself won't use this directly, it's a conceptual variable for the schedule.

## 5. GitHub Actions Workflow (`.github/workflows/main.yml`)

*   **Trigger:** Scheduled event (cron).
    *   Example: `cron: '0 */6 * * *'` (runs every 6 hours). The interval `X` will be based on `SCRAPE_INTERVAL_HOURS`.
*   **Jobs:**
    *   A single job (e.g., `price_check`).
    *   **Runner:** `ubuntu-latest` (or a specific version).
    *   **Steps:**
        1.  `actions/checkout@v3` (or latest): To checkout the repository code.
        2.  `actions/setup-node@v3` (or latest): To set up the specified Node.js version.
            *   `with: node-version: '18'` (or preferred LTS).
        3.  `npm install`: To install project dependencies (`axios`, `cheerio`, `discord.js`).
        4.  `Run price checker script`:
            *   `node price-checker.js` (or the chosen script name).
            *   `env:` section to map GitHub Secrets to environment variables for the script.

## 6. Potential Technical Constraints & Challenges

*   **Website Structure Changes:** The most significant challenge for any web scraper. If the target website's HTML structure or CSS class names change, the scraper's selectors will break, and it will fail to extract data correctly. This requires manual updates to the selectors.
*   **Anti-Scraping Measures:**
    *   **CAPTCHAs:** `cheerio` cannot handle CAPTCHAs. If encountered, a more advanced tool like Puppeteer with CAPTCHA solving services (often paid) would be needed, or the target site might become un-scrapable for this basic setup.
    *   **IP Blocking/Rate Limiting:** Frequent requests from GitHub Actions' IP range might lead to blocking. Respecting `robots.txt` and keeping request frequency low is important.
    *   **Dynamic Content Loading:** If product data is loaded via JavaScript after the initial page load, `cheerio` won't see it. Puppeteer/Playwright would be required.
*   **Discord Bot Permissions/Rate Limits:** The Discord bot will need appropriate permissions on the server to send messages to the target channel. Discord API also has rate limits that the bot must respect, though for a simple notification bot running periodically, this is unlikely to be an issue.
*   **Selector Specificity:** Crafting robust CSS selectors that are specific enough to get the right data but not so brittle that minor site changes break them is key.
