# Contributing to SAW Flight Logger

Thank you for your interest in contributing to the Semi-Automated Webhook Flight Logger! This document provides guidelines and instructions for contributors.

## Code Style Guidelines

### JavaScript

- Use Prettier for code formatting (configuration in `.prettierrc`)
- Follow existing code patterns and naming conventions
- Add JSDoc comments to exported functions and important internal functions
- Use descriptive variable names
- Limit console.log statements to essential debugging information

### General Guidelines

- Make small, focused commits with clear commit messages
- Test your changes thoroughly before submitting
- Preserve existing functionality - this is a userscript used by real flight sim communities
- Keep the public API stable to avoid breaking existing installations

## Development Setup

### Prerequisites

- Node.js and npm (for development tools)
- A modern web browser with userscript support (Tampermonkey, etc.)
- Access to GeoFS for testing

### Local Development

1. **Clone the repository:**

   ```bash
   git clone https://github.com/SAW-flight-logger/SAW-flight-logger.git
   cd SAW-flight-logger
   ```

2. **Install development dependencies:**

   ```bash
   npm install
   ```

3. **Format code before committing:**

   ```bash
   npm run format
   ```

4. **Check code formatting:**
   ```bash
   npm run format:check
   ```

### Testing Your Changes

1. **Install the userscript in your browser:**
   - Copy the contents of `SAW.user.js`
   - Install it via Tampermonkey or similar userscript manager

2. **Test in GeoFS:**
   - Navigate to GeoFS (geofs.com)
   - Verify the flight logger panel appears
   - Test basic functionality (start/end flight logging)
   - Test edge cases and error conditions

3. **Test with different scenarios:**
   - Different aircraft types
   - Various airports (known and unknown ICAO codes)
   - Flight interruptions and resumes
   - Normal landings vs. crashes

## Submitting Changes

### Pull Request Process

1. **Fork the repository** and create a feature branch from `main`
2. **Make your changes** following the code style guidelines
3. **Format your code** using `npm run format`
4. **Test thoroughly** with the userscript in GeoFS
5. **Commit your changes** with descriptive commit messages
6. **Push to your fork** and submit a pull request

### Pull Request Guidelines

- **Title:** Use a clear, descriptive title
- **Description:** Explain what changes you made and why
- **Testing:** Describe how you tested your changes
- **Screenshots:** Include screenshots for UI changes
- **Breaking Changes:** Clearly mark any breaking changes

## Code Review Process

- All changes require review before merging
- Reviews focus on code quality, functionality, and user impact
- Be responsive to feedback and questions
- Help improve the codebase for all users

## Reporting Issues

When reporting bugs or requesting features:

1. **Search existing issues** to avoid duplicates
2. **Use clear titles** and provide detailed descriptions
3. **Include steps to reproduce** for bugs
4. **Provide environment details** (browser, GeoFS version, etc.)
5. **Add screenshots or logs** when helpful

## Community Guidelines

- Be respectful and professional in all interactions
- Help newcomers and answer questions when possible
- Focus on constructive feedback during code reviews
- Remember that this tool is used by real flight simulation communities

## Questions?

If you have questions about contributing, feel free to:

- Open an issue for discussion
- Ask in pull request comments
- Contact the maintainers

Thank you for helping improve SAW Flight Logger!
