# System Patterns - Price Checker Bot

## Architecture Overview
The system follows a modular, pipeline-based architecture with clear separation of concerns:

```
GitHub Actions → Scraper → Filter → Discord → Cleanup
```

## Core Components

### 1. Web Scraper (`src/scraper.js`)
- **Pattern**: Puppeteer-based headless browser automation
- **Responsibility**: Extract product data from target website
- **Key Functions**:
  - `scrapeProducts()`: Main scraping orchestrator
  - `parsePrice()`: Normalize price strings to numeric values
  - `calculateDiscount()`: Compute discount percentages
- **Error Handling**: Browser cleanup in finally blocks, timeout protection
- **Anti-Detection**: User agent spoofing, network idle waiting

### 2. Product Filter (`src/filter.js`)
- **Pattern**: Rule-based filtering with configurable criteria
- **Responsibility**: Identify qualifying products based on business rules
- **Key Logic**:
  - Handbag category matching (keyword-based)
  - Designer brand recognition (brand list matching)
  - Discount threshold validation
  - Priority sorting (discount % → brand name)
- **Extensibility**: Easy to add new filtering criteria

### 3. Discord Notifier (`src/discord.js`)
- **Pattern**: Class-based service with connection lifecycle management
- **Responsibility**: Send formatted notifications to Discord channels
- **Key Features**:
  - Rich embed formatting with product images
  - Rate limiting protection (1s delays between messages)
  - Graceful degradation (max 10 alerts per run)
  - Connection state management
- **Error Recovery**: Isolated error handling per notification

### 4. Main Orchestrator (`src/index.js`)
- **Pattern**: Pipeline orchestration with comprehensive error handling
- **Responsibility**: Coordinate all components and manage execution flow
- **Key Patterns**:
  - Configuration loading from JSON
  - Environment variable integration
  - Graceful shutdown handling
  - Discord connection lifecycle management
  - Comprehensive logging

## Configuration System
- **Pattern**: JSON-based configuration with environment variable overrides
- **Structure**:
  ```json
  {
    "website": { "url", "name" },
    "monitoring": { "frequency", "minDiscountPercent", "categories", "designerBrands" },
    "discord": { "enabled", "channelName" }
  }
  ```
- **Flexibility**: Easy to modify without code changes

## GitHub Actions Integration
- **Pattern**: Scheduled serverless execution
- **Workflow**: `.github/workflows/price-checker.yml`
- **Features**:
  - Cron-based scheduling (hourly)
  - Manual trigger capability
  - Secret management for Discord token
  - Artifact upload on failure
  - Node.js environment setup with caching

## Error Handling Strategy
1. **Graceful Degradation**: Continue operation when non-critical components fail
2. **Comprehensive Logging**: Detailed console output for debugging
3. **Discord Error Notifications**: Alert users when system fails
4. **Resource Cleanup**: Always close browser/Discord connections
5. **Exit Code Management**: Proper exit codes for GitHub Actions

## Testing Architecture
- **Pattern**: Modular test suite with network test isolation
- **Components**:
  - Configuration validation
  - Price parsing logic
  - Product filtering rules
  - Discord connection (without sending)
  - Optional web scraping (with warnings)
- **CI Integration**: Skip network tests in automated environments

## Scalability Considerations
- **Rate Limiting**: Built-in delays to avoid overwhelming target sites
- **Resource Management**: Browser instances properly cleaned up
- **Notification Limits**: Max 10 alerts per run to prevent spam
- **Stateless Design**: No persistent storage requirements

## Security Patterns
- **Secret Management**: Discord token via GitHub Secrets
- **Environment Isolation**: Local .env for development, secrets for production
- **Input Validation**: Price parsing with fallback to zero
- **Error Information**: Sanitized error messages in Discord notifications
