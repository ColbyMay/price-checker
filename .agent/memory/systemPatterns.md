# System Patterns: Price Checker App

## 1. System Architecture Overview

The application will consist of two main parts:
1.  **Node.js Script (`price-checker.js` or similar):** This script will contain the core logic for:
    *   Fetching the content of the target URL.
    *   Parsing the HTML to extract product details (name, prices).
    *   Calculating discount percentages.
    *   Filtering products based on the desired discount.
    *   Composing and sending a Discord notification.
2.  **GitHub Actions Workflow (`.github/workflows/main.yml` or similar):** This YAML file will define:
    *   The schedule (cron expression) for running the script.
    *   The environment setup (Node.js version).
    *   Steps to checkout the code, install dependencies, and execute the Node.js script.
    *   Management of environment variables/secrets for configuration (URL, discount threshold, Discord Bot Token, Discord Channel ID).

```mermaid
graph TD
    A[GitHub Scheduler (Cron)] --> B{GitHub Actions Runner};
    B --> C[Checkout Code];
    C --> D[Setup Node.js];
    D --> E[Install Dependencies e.g., Axios, Cheerio, discord.js];
    E --> F[Run price-checker.js Script];
    F -- Fetches HTML --> G[(Target URL)];
    F -- Parses Data --> H{Product Data Extraction};
    H -- Filters Products --> I{Discount Calculation & Filtering};
    I -- Sends Message --> J[Discord API via discord.js];
    J -- Delivers Message --> K[(User's Discord Channel)];

    subgraph Node.js Script
        direction LR
        G
        H
        I
        J
    end
```

## 2. Key Technical Decisions

*   **Language:** Node.js (JavaScript) - As per user request. Suitable for I/O-bound tasks like web scraping and API interactions.
*   **Scheduling:** GitHub Actions - As per user request. Provides a free and convenient way to run scheduled tasks without dedicated server infrastructure.
*   **Web Scraping:**
    *   **HTTP Client:** `axios` or Node.js built-in `https` module for fetching the webpage. `axios` is generally more user-friendly.
    *   **HTML Parsing:** `cheerio` for server-side HTML parsing and manipulation, offering a jQuery-like API. This is generally robust for static or server-rendered pages.
    *   **Alternative for Dynamic Content:** If the target site heavily relies on JavaScript to render content, `puppeteer` or `playwright` might be necessary. However, these are heavier dependencies and more complex to run in a typical GitHub Actions environment (though possible). For a "super basic" app, `cheerio` is the preferred starting point. We will assume static content initially.
*   **Discord Notifications:**
    *   **Library:** `discord.js` is a powerful Node.js module that allows direct interaction with the Discord API.
    *   **Authentication:** Requires a Discord Bot Token.
    *   **Target:** Sends messages to a specific Discord Channel ID.
*   **Configuration Management:**
    *   Environment variables managed via GitHub Actions Secrets (for sensitive data like Discord Bot Token, Discord Channel ID, Target URL, Discount Percentage).
    *   `process.env.VARIABLE_NAME` in Node.js to access these.

## 3. Data Flow

1.  GitHub Actions cron job triggers the workflow.
2.  The workflow sets up the Node.js environment and runs the `price-checker.js` script.
3.  The script reads configuration (Target URL, Discount %, Discord Bot Token, Discord Channel ID) from environment variables.
4.  The script makes an HTTP GET request to the Target URL.
5.  The HTML response is parsed using `cheerio`.
6.  Relevant product data (name, current price, original price) is extracted based on predefined CSS selectors.
    *   *Initial Challenge:* These selectors will be specific to the Target URL and will need to be determined by inspecting the website's HTML structure. This is the most fragile part of any scraper.
7.  For each product, the discount percentage is calculated: `((originalPrice - currentPrice) / originalPrice) * 100`.
8.  Products meeting the minimum discount threshold are added to a list.
9.  If the list is not empty, `discord.js` is used to send a message containing the list of discounted products to the configured Discord Channel ID using the Bot Token.
10. The script logs its actions (e.g., "Scraping started," "X deals found," "Discord message sent").

## 4. Error Handling and Resilience

*   **Network Errors:** Implement try-catch blocks for HTTP requests. Retry mechanisms could be added but might be overkill for a basic version.
*   **Parsing Errors:** If website structure changes, selectors might fail. The script should handle cases where expected data is not found (e.g., log a warning, skip the product).
*   **Discord Message Sending Errors:** Log any errors from the Discord API (e.g., invalid token, incorrect channel ID, permissions issues).
*   **GitHub Actions Logs:** Standard output and errors from the script will be captured in GitHub Actions logs, which will be the primary way to debug issues.

## 5. Key Patterns

*   **Environment-Driven Configuration:** Rely on environment variables for all configurable aspects, making it easy to adapt in GitHub Actions.
*   **Selector-Based Scraping:** Use CSS selectors to identify and extract data. This is common but requires maintenance if the target site changes.
*   **Scheduled Task:** The core logic is designed to be run as an atomic, scheduled operation.
*   **Fail-Fast/Log:** If critical errors occur (e.g., cannot fetch URL, cannot send Discord message), log the error and exit.
