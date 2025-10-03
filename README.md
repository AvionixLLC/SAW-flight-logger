# SAW Flight Logger

**Semi-Automated Webhook Flight Logger** for GeoFS - Automated flight logging with Discord integration, crash detection, and teleportation prevention.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![JavaScript](https://img.shields.io/badge/JavaScript-UserScript-yellow.svg)](https://github.com/SAW-flight-logger/SAW-flight-logger)

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Features

- **🛫 Automated Flight Logging**: Tracks takeoff, flight data, and landing automatically
- **🔗 Discord Integration**: Sends detailed flight reports to Discord channels via webhooks
- **🛡️ Anti-Cheat Protection**: Advanced teleportation detection and crash monitoring
- **📊 Landing Analytics**: Real-time landing quality assessment with bounce detection
- **⚡ Session Recovery**: Resumes interrupted flights automatically
- **🌍 Airport Database**: Auto-detection of ICAO codes with manual fallback
- **🏢 Multi-Airline Support**: Configure multiple airlines with different Discord channels
- **📱 User-Friendly Interface**: Clean, intuitive UI panel within GeoFS

## Screenshots

<!-- TODO: Add screenshots of the flight logger in action -->

_Screenshots will be added showing the UI panel, flight reports, and Discord integration._

## Quick Start

### Requirements

- Web browser with userscript support (Chrome, Firefox, Safari, etc.)
- [Tampermonkey](https://www.tampermonkey.net/) or similar userscript manager
- Access to [GeoFS](https://www.geo-fs.com/) flight simulator
- Discord server with webhook permissions (for logging)

### Installation

1. **Install the userscript manager:**

   ```bash
   # Visit https://www.tampermonkey.net/ and install for your browser
   ```

2. **Install SAW Flight Logger:**
   - Copy the userscript: [SAW.user.js](https://github.com/SAW-flight-logger/SAW-flight-logger/raw/refs/heads/main/SAW.user.js)
   - Open Tampermonkey dashboard
   - Click "Create a new script"
   - Paste the script content and save

3. **Access GeoFS:**
   ```bash
   # Navigate to https://www.geo-fs.com/geofs.php
   # The flight logger panel will appear automatically
   ```

### Build and Development

For contributors and developers:

```bash
# Clone the repository
git clone https://github.com/SAW-flight-logger/SAW-flight-logger.git
cd SAW-flight-logger

# Install development dependencies
npm install

# Format code
npm run format

# Check formatting
npm run format:check
```

## Configuration

### Discord Webhook Setup

1. **Create a Discord webhook:**
   - Go to your Discord server settings
   - Navigate to "Integrations" → "Webhooks"
   - Click "New Webhook" and configure the channel
   - Copy the webhook URL

2. **Add airline in SAW:**
   - Click the "+Add" button in the flight logger panel
   - Enter your airline name (e.g., "Virtual Airways")
   - Enter ICAO code (e.g., "VAW")
   - Paste your Discord webhook URL

### Environment Variables

The script stores configuration in browser localStorage:

- `geofs_flight_logger_airlines` - Airline configurations
- `geofs_flight_logger_session` - Current flight session data
- `geofs_flight_logger_terms_agreed` - Terms of service acceptance

## Usage Examples

### Basic Flight Logging

```javascript
// 1. Start GeoFS and navigate to an airport
// 2. Enter flight number in the SAW panel (e.g., "516")
// 3. Select your airline from the dropdown
// 4. Click "Start Flight Logger"
// 5. Take off and fly normally
// 6. Landing is detected automatically
```

### Manual ICAO Entry

```javascript
// When the airport isn't in the database:
// 1. The system will prompt for ICAO code
// 2. Enter the 4-letter ICAO (e.g., "KJFK")
// 3. Flight logging continues normally
```

### Managing Airlines

```javascript
// Add new airline:
// - Click "+Add" button
// - Fill in airline details and webhook URL

// Switch airlines:
// - Use the dropdown to select different configured airlines
```

## Flight Report Format

The system generates detailed Discord embeds containing:

- **Flight Information**: Flight number, airline, aircraft type
- **Route Details**: Departure and arrival airports with ICAO codes
- **Performance Data**: Flight time, vertical speed, g-forces, true airspeed
- **Landing Quality**: Calculated landing assessment and bounce count
- **Timestamps**: Takeoff and landing times with timezone information

## Terms and Conditions

By using SAW Flight Logger, you agree to:

1. **Fair Play**: Not to fake flights or manipulate flight data
2. **Technical Integrity**: Not to make unauthorized modifications without notice to maintainers
3. **Proper Training**: Ensure pilots understand the system before deployment
4. **Appropriate Use**: Use only for flight simulation purposes, not commercial activities
5. **Data Responsibility**: Secure your Discord webhook URLs and ensure proper permissions

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:

- Code style guidelines
- Development setup
- Testing procedures
- Pull request process

### Quick Contribution Steps

```bash
# 1. Fork the repository
# 2. Create a feature branch
git checkout -b feature/your-feature-name

# 3. Make your changes and format code
npm run format

# 4. Test thoroughly in GeoFS
# 5. Submit a pull request
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Contact

- **Repository**: [SAW-flight-logger/SAW-flight-logger](https://github.com/SAW-flight-logger/SAW-flight-logger)
- **Issues**: [GitHub Issues](https://github.com/SAW-flight-logger/SAW-flight-logger/issues)
- **Discord**: Contact `jthweb` for support questions

---

**Note**: SAW Flight Logger is designed for the GeoFS flight simulation community. Please use responsibly and in accordance with community guidelines.
