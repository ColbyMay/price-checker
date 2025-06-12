# Price Checker Bot - Project Brief

## Overview
Automated price monitoring system that tracks sales on Holt Renfrew and sends Discord notifications for qualifying items. Built to run on GitHub Actions for free, automated monitoring.

## Core Requirements
- Monitor Holt Renfrew sale page hourly for handbags and designer items
- Filter products based on categories (handbags) and discount thresholds (50%+)
- Send rich Discord notifications with product details, images, and links
- Run completely free using GitHub Actions scheduling
- Be easily configurable for different websites, criteria, and schedules

## Key Features
- 🛍️ Smart product filtering (handbags + designer items with significant discounts)
- 🤖 Discord notifications with rich embeds
- ⚙️ Configurable monitoring (website, categories, brands, discount thresholds)
- 🔄 Automated scheduling via GitHub Actions (hourly)
- 📊 Comprehensive logging and error handling

## Technical Stack
- **Runtime**: Node.js 18
- **Web Scraping**: Puppeteer (headless Chrome)
- **Notifications**: Discord.js v14
- **Scheduling**: GitHub Actions (cron)
- **Configuration**: JSON + environment variables
- **Hosting**: GitHub Actions (free tier)

## Success Criteria
- Successfully scrape product data from Holt Renfrew
- Accurately filter products based on handbag categories and designer brands
- Send formatted Discord notifications for qualifying items
- Run reliably on hourly schedule via GitHub Actions
- Provide clear setup instructions for non-technical users
