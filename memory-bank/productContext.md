# Product Context: Price Checker App

## 1. Problem Definition

Users often want to find the best deals on products online but lack the time or tools to constantly monitor websites for price drops or specific discount levels. Manually checking multiple product pages on a regular basis is inefficient and prone to missing limited-time offers.

This application aims to solve this by:
-   Automating the monitoring of a specific URL for product prices.
-   Filtering products based on a user-defined discount percentage.
-   Alerting the user via Discord when desired deals are found.

## 2. How It Should Work (User Perspective)

1.  **Configuration:** The user (developer, in this case, via environment variables or a config file) sets:
    *   The **target URL** of the e-commerce page to monitor.
    *   The **desired discount percentage** (e.g., "notify me for products at least 30% off").
    *   The **Discord Bot Token** (for the bot to authenticate).
    *   The **Discord Channel ID** (where notifications should be sent).
    *   The **monitoring frequency** (e.g., "check every 6 hours"). This will be managed by the GitHub Actions cron schedule.

2.  **Automated Monitoring:**
    *   At the scheduled interval, the GitHub Action triggers the Node.js script.
    *   The script visits the target URL.
    *   It extracts product information (e.g., name, current price, original price if available, or discount information directly).

3.  **Deal Identification:**
    *   For each product, the script calculates the discount percentage.
    *   It compares this to the user-defined minimum discount percentage.

4.  **Notification:**
    *   If any products meet or exceed the specified discount percentage, the script compiles a list of these products.
    *   A message is sent via a Discord bot to the configured Discord channel ID containing this list.
    *   If no products meet the criteria, no message is sent (or optionally, a "no deals found" message could be sent, but for simplicity, let's start with no message if no deals).

## 3. User Experience (UX) Goals

-   **Reliability:** The scraping and notification process should be dependable.
-   **Clarity:** Discord notifications should clearly present the found deals (product name, price, discount).
-   **Simplicity:** Configuration should be straightforward (primarily through environment variables for GitHub Actions secrets).
-   **Non-Intrusiveness:** The application runs in the background (GitHub Actions) and only notifies when relevant deals are found.

## 4. Value Proposition

-   **Saves Time:** Eliminates the need for manual price checking.
-   **Saves Money:** Helps users find and capitalize on discounts they might otherwise miss.
-   **Convenience:** Delivers deal alerts directly to the user's Discord channel.
