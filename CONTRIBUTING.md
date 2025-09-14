# Contributing to SAW Flight Logger

Thank you for your interest in contributing to SAW Flight Logger! This document provides guidelines for contributing to this project.

## Code Style Guide

### JavaScript

- **Indentation**: 2 spaces (no tabs)
- **Semicolons**: Required at end of statements
- **Quotes**: Use double quotes for strings
- **Naming**:
  - Variables and functions: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`
  - Private functions: prefix with underscore `_functionName`
- **Comments**: Use JSDoc format for function documentation
- **Line Length**: Maximum 100 characters

### Example

```javascript
/**
 * Calculates the distance between two geographical points
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  // Implementation...
}
```

## Formatting and Linting

### Running Prettier

Since this is a userscript project, you can use Prettier for code formatting:

```bash
# Install Prettier globally (if not already installed)
npm install -g prettier

# Format the main script file
prettier --write SAW.user.js

# Format all JavaScript and JSON files
prettier --write "*.{js,json,md}"
```

### Prettier Configuration

The project uses these Prettier settings (see `.prettierrc.json`):

- 2 spaces for indentation
- Double quotes for strings
- 100 character line width
- Trailing commas where valid

### Manual Formatting for Userscripts

If you prefer manual formatting or can't use Prettier:

1. Use 2-space indentation consistently
2. Add blank lines between logical sections
3. Align similar statements for readability
4. Keep console.log statements concise and meaningful

## Testing

### Manual Testing

Since this is a userscript for GeoFS, testing must be done manually:

1. **Install the modified script** in Tampermonkey
2. **Load GeoFS** in your browser
3. **Test core functionality**:
   - Terms dialog appears for new users
   - UI panel loads correctly
   - Airline configuration works
   - Flight logging starts/stops properly
   - Discord webhook integration functions
   - Teleportation detection activates

4. **Test edge cases**:
   - Browser refresh during flight
   - Invalid webhook URLs
   - Missing airport data
   - Rapid position changes

### Testing Checklist

- [ ] Script loads without console errors
- [ ] Terms dialog functions properly
- [ ] UI elements render correctly
- [ ] Flight detection works (takeoff/landing)
- [ ] Discord messages send successfully
- [ ] Teleportation detection prevents cheating
- [ ] Session recovery after refresh
- [ ] Multiple airline configurations

## Branch and Pull Request Guidelines

### Branch Naming

- **Feature branches**: `feature/description-of-feature`
- **Bug fixes**: `fix/description-of-fix`
- **Documentation**: `docs/description-of-changes`
- **Refactoring**: `refactor/description-of-changes`

### Pull Request Process

1. **Fork the repository** and create your branch from `main`
2. **Make minimal, focused changes** - avoid large refactors
3. **Test thoroughly** using the manual testing process
4. **Update documentation** if you change functionality
5. **Write a clear PR description** including:
   - What changes were made
   - Why the changes were necessary
   - How to test the changes
   - Any breaking changes or considerations

### PR Description Template

```markdown
## Description

Brief description of changes made.

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update

## Testing

- [ ] Tested in GeoFS with Tampermonkey
- [ ] Verified flight logging functionality
- [ ] Checked Discord webhook integration
- [ ] Tested teleportation detection

## Screenshots (if applicable)

Add screenshots of UI changes or new features.

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes to public API
```

## Development Setup

### Prerequisites

- Modern web browser (Chrome, Firefox, Edge)
- Tampermonkey browser extension
- Access to GeoFS (https://geo-fs.com)
- Discord server with webhook permissions (for testing)

### Local Development

1. **Clone the repository**

   ```bash
   git clone https://github.com/SAW-flight-logger/SAW-flight-logger.git
   cd SAW-flight-logger
   ```

2. **Install development tools** (optional)

   ```bash
   npm install -g prettier
   ```

3. **Edit the script**
   - Modify `SAW.user.js` as needed
   - Use your preferred code editor with JavaScript support

4. **Test changes**
   - Copy the modified script to Tampermonkey
   - Test in GeoFS environment
   - Verify all functionality works as expected

## Code of Conduct

### Our Standards

- Be respectful and inclusive
- Focus on constructive feedback
- Help maintain a welcoming environment
- Report issues responsibly

### Scope

This Code of Conduct applies to all project spaces, including:

- GitHub repository (issues, PRs, discussions)
- Code comments and documentation
- Any project-related communication

## Questions?

If you have questions about contributing:

- Open an issue for discussion
- Check existing issues and PRs for similar topics
- Contact the maintainers through GitHub

Thank you for contributing to SAW Flight Logger!
