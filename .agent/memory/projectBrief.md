# Project Brief: Price Checker App

## 1. Core Requirements

The primary goal is to develop a Node.js application that periodically scrapes a specified URL for products meeting certain discount criteria and notifies a designated Discord channel.

Key functionalities include:
-   Scraping a target URL for product information (name, price, discount).
-   Identifying products that are discounted by a user-defined percentage (e.g., X% off).
-   Sending a Discord notification containing a list of these discounted products.
-   Configurable parameters:
    *   Target URL to scrape.
    *   Scraping interval (e.g., every X hours).
    *   Minimum discount percentage to trigger notification.
    *   Discord Bot Token (for authentication).
    *   Discord Channel ID (for sending messages).
-   The application should be designed to run as a scheduled job (cron job) via GitHub Actions, avoiding the need for it to run continuously on a local machine.

## 2. Project Goals

-   **Automation:** Automate the process of finding discounted products.
-   **Notification:** Provide timely alerts about desired deals.
-   **Configurability:** Allow users to easily set their scraping and notification preferences.
-   **Efficiency:** Design the application to be lightweight and suitable for execution in a serverless environment like GitHub Actions.
-   **Maintainability:** Write clean, well-documented code that is easy to understand and modify.

## 3. Scope

**In Scope:**
-   A Node.js script for web scraping.
-   Logic to calculate discount percentages.
-   Discord bot notification functionality.
-   A GitHub Actions workflow file for scheduling the script.
-   Basic error handling and logging.
-   Secure handling of sensitive information (e.g., Discord Bot Token, stored as a GitHub Secret).

**Out of Scope (for initial version):**
-   A user interface (UI) for managing configurations.
-   Storing historical price data.
-   Advanced anti-scraping measures (beyond basic politeness like appropriate request rates).
-   Support for multiple target URLs or complex scraping scenarios requiring different logic per site without significant refactoring.
-   Direct database integration.

## 4. Success Criteria

-   The application successfully scrapes the target URL.
-   The application correctly identifies products meeting the discount criteria.
-   Discord notifications are successfully sent to the specified channel with the correct product list.
-   The GitHub Actions cron job executes the script at the scheduled intervals.
-   Configuration variables are easily updatable.
