# SAW Flight Logger

A semi-automated webhook flight logger for GeoFS that enables pilots to log their flights via Discord webhooks with minimal setup time.

<!-- Badges placeholder -->

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Version](https://img.shields.io/badge/Version-2025--09--14-green.svg)]()

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Quick Start](#quick-start)
  - [Requirements](#requirements)
  - [Installation](#installation)
  - [Setup](#setup)
- [Configuration](#configuration)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## Features

- **Semi-automated flight logging** - Logs flights with minimal pilot intervention
- **Discord webhook integration** - Sends flight reports directly to Discord channels
- **Advanced teleportation detection** - Prevents cheating and ensures flight integrity
- **Crash detection** - Automatically detects and reports flight incidents
- **Auto ICAO detection** - Automatically identifies airports using comprehensive database
- **Session recovery** - Resumes flights after browser refresh or connection loss
- **Enhanced landing statistics** - Detailed landing analysis including vertical speed and G-force
- **Multi-airline support** - Configure multiple airlines with different webhook URLs
- **Real-time monitoring** - Continuous flight tracking during active sessions

## Screenshots

<!-- Screenshots placeholder - Add your screenshots here -->

_Screenshots will be added in future updates_

## Quick Start

### Requirements

- **GeoFS** - The flight simulator ([https://geo-fs.com](https://geo-fs.com))
- **Tampermonkey** - Browser extension for userscripts
- **Discord webhook** - For receiving flight reports

### Installation

1. **Install Tampermonkey**
   - [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
   - [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

2. **Install the userscript**
   - Download [SAW.user.js](https://github.com/SAW-flight-logger/SAW-flight-logger/raw/refs/heads/main/SAW.user.js)
   - Open Tampermonkey dashboard
   - Click "Create a new script"
   - Replace the template with the downloaded script content
   - Save the script

3. **Alternative installation**
   - Open GeoFS in your browser
   - Right-click and select "Inspect" (or press F12)
   - Go to the Console tab
   - Copy and paste the script code
   - Press Enter to execute

### Setup

1. **Create Discord webhook**
   - In your Discord server, go to your flight log channel
   - Channel Settings → Integrations → Webhooks
   - Click "New Webhook"
   - Give it a name and copy the webhook URL

2. **Configure the script**
   - In GeoFS, look for the SAW Flight Logger panel
   - Click the "+ Add" green button
   - Enter your airline name and ICAO code
   - Paste your Discord webhook URL
   - Select your airline from the dropdown

## Configuration

The script stores configuration locally in your browser:

- **Airlines**: Multiple airline configurations with individual webhook URLs
- **Session data**: Flight progress for recovery after browser refresh
- **User preferences**: Terms agreement and last selected airline

**Important**: The default webhook points to a test server. Make sure to configure your own airline and webhook to avoid sending flight data to the wrong channel.

## Usage

1. **Start a flight**
   - Enter your flight number/callsign (e.g., "516")
   - Click "📋 Start Flight Logger"
   - The script will automatically detect takeoff

2. **During flight**
   - The script monitors your flight continuously
   - Teleportation detection prevents cheating
   - Position and speed data are tracked

3. **Landing and completion**
   - Landing is automatically detected
   - Flight report is generated and sent to Discord
   - Includes departure/arrival airports, duration, landing quality, and flight statistics

4. **Airport database**
   - Uses comprehensive airport database for ICAO detection
   - If airport not found, manual ICAO entry is required
   - Unknown airports will show as "UNKNOWN" in reports

### Terms and Conditions

By using SAW Flight Logger, you agree to:

1. **No flight faking** - Use the script only for legitimate flights
2. **Modification notice** - Notify the creator before making major changes due to technical reasons and system integrity requirements
3. **Pilot preparation** - Ensure proper training and understanding before deployment
4. **Simulation use only** - Intended solely for GeoFS flight simulation logging
5. **Data responsibility** - Secure your Discord webhook URLs and ensure permission to use configured servers
6. **Disclaimer** - Script provided "as is" without warranty; users assume all risks

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:

- Code style and formatting
- Testing procedures
- Branch and pull request workflow
- Development setup

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Contact

- **Issues**: [GitHub Issues](https://github.com/SAW-flight-logger/SAW-flight-logger/issues)
- **Discord**: seabus0316 (for flight data recovery from test server)
- **Repository**: [SAW-flight-logger/SAW-flight-logger](https://github.com/SAW-flight-logger/SAW-flight-logger)
