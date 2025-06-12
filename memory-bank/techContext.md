# Technical Context - Price Checker Bot

## Technology Stack

### Runtime Environment
- **Node.js**: Version 18+ (LTS recommended)
- **Platform**: Cross-platform (Windows, macOS, Linux)
- **Hosting**: GitHub Actions (serverless execution)

### Core Dependencies
- **puppeteer**: `^22.8.2` - Headless Chrome automation for web scraping
- **discord.js**: `^14.14.1` - Discord API client for notifications
- **dotenv**: `^16.3.1` - Environment variable management

### Development Setup
```bash
# Clone repository
git clone <repository-url>
cd price-checker

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with Discord token

# Run tests
npm test

# Manual execution
npm start
```

### Package Management
- **Package Manager**: npm (with package-lock.json for version locking)
- **Lock File**: package-lock.json committed to repository for reproducible builds
- **Dependency Strategy**: Semver ranges in package.json, exact versions in lock file
- **CI/CD**: Uses `npm ci` for faster, deterministic installs in GitHub Actions

### Technical Constraints

#### GitHub Actions Limitations
- **Execution Time**: 6 hours maximum per job (more than sufficient for this use case)
- **Memory**: 7 GB available (Puppeteer requires ~100-200MB)
- **Storage**: 14 GB available (minimal storage needs)
- **Network**: Outbound connections allowed (required for web scraping and Discord)

#### Puppeteer Requirements
- **Chromium**: Automatically downloaded and managed by Puppeteer
- **Memory Usage**: ~100-200MB per browser instance
- **Network**: Requires outbound HTTPS connections
- **Headless Mode**: Runs in headless mode for CI/CD compatibility

#### Discord API Constraints
- **Rate Limiting**: 50 requests per second (we use 1-second delays)
- **Message Size**: 2000 characters max (embeds have separate limits)
- **Embed Limits**: 25 fields, 6000 characters total
- **Bot Permissions**: Requires "Send Messages" and "Embed Links" permissions

### Configuration Management

#### Environment Variables
```bash
DISCORD_TOKEN=your_discord_bot_token_here
```

#### Configuration File (config.json)
```json
{
  "website": {
    "url": "https://www.holtrenfrew.com/en/sale",
    "name": "Holt Renfrew"
  },
  "monitoring": {
    "frequency": "hourly",
    "minDiscountPercent": 50,
    "categories": ["handbags", "bags", "purses"],
    "designerBrands": ["Gucci", "Prada", "Louis Vuitton", ...]
  },
  "discord": {
    "enabled": true,
    "channelName": "price-alerts"
  }
}
```

### Tool Usage Patterns

#### Web Scraping Strategy
- **Browser Automation**: Puppeteer with headless Chrome
- **Anti-Detection**: User agent spoofing, realistic timing
- **Error Handling**: Timeout protection, graceful failures
- **Resource Management**: Proper browser cleanup in finally blocks

#### Data Processing
- **Price Parsing**: Regex-based extraction with fallback to zero
- **Discount Calculation**: Percentage-based with validation
- **Product Filtering**: Rule-based with configurable criteria
- **Data Validation**: Input sanitization and type checking

#### Notification System
- **Discord Integration**: Rich embeds with images and links
- **Rate Limiting**: 1-second delays between messages
- **Error Recovery**: Isolated error handling per notification
- **Graceful Degradation**: Max 10 alerts per run

### Security Considerations

#### Secret Management
- **Development**: Local .env file (gitignored)
- **Production**: GitHub Secrets for Discord token
- **Access Control**: Bot token has minimal required permissions

#### Input Validation
- **Price Parsing**: Sanitized regex extraction
- **URL Handling**: Validated against expected domains
- **Error Messages**: Sanitized before sending to Discord

#### Network Security
- **HTTPS Only**: All external connections use HTTPS
- **User Agent**: Realistic browser user agent string
- **Request Headers**: Standard browser headers for anti-detection

### Performance Optimization

#### Execution Efficiency
- **Parallel Processing**: Not implemented (single-threaded for simplicity)
- **Caching**: No caching (stateless design)
- **Resource Usage**: Minimal memory footprint
- **Execution Time**: Typically completes in 30-60 seconds

#### GitHub Actions Optimization
- **Node.js Caching**: Dependencies cached between runs
- **Artifact Management**: Logs uploaded on failure
- **Scheduling**: Hourly execution to balance freshness and resource usage

### Monitoring and Debugging

#### Logging Strategy
- **Console Output**: Comprehensive logging for all operations
- **Error Reporting**: Detailed error messages with context
- **Discord Notifications**: System status updates
- **GitHub Actions**: Workflow logs and artifacts

#### Testing Framework
- **Unit Tests**: Configuration validation, price parsing
- **Integration Tests**: Discord connection, web scraping (optional)
- **CI/CD Tests**: Network tests skipped in automated environments
- **Manual Testing**: Local execution for development

### Deployment Pipeline

#### GitHub Actions Workflow
```yaml
# Scheduled execution
schedule:
  - cron: '0 * * * *'  # Every hour

# Manual trigger
workflow_dispatch:

# Environment setup
- Node.js 18
- npm ci (fast, deterministic install)
- Environment variables from secrets
```

#### Version Control
- **Git Strategy**: Main branch with direct commits
- **Dependency Updates**: Both package.json and package-lock.json committed together
- **Release Management**: No formal releases (continuous deployment)

### Future Technical Considerations

#### Scalability
- **Multi-Website**: Architecture supports easy extension
- **Database Integration**: Optional persistence layer
- **API Development**: REST endpoints for external integration
- **Containerization**: Docker support for local development

#### Monitoring
- **Health Checks**: System status monitoring
- **Performance Metrics**: Execution time and success rates
- **Error Tracking**: Centralized error reporting
- **Alerting**: Enhanced notification system
