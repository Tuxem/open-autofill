# Open Autofill

A Firefox extension (Manifest V3) for automatic form filling with bi-directional Google Sheets synchronization.

## Features

- **Form Auto-Fill**: Automatically fill forms based on saved profiles and rules
- **Google Sheets Sync**: Bi-directional synchronization with Google Sheets
- **Multiple Profiles**: Create different profiles for different sites or use cases
- **Hotkey Support**: Assign keyboard shortcuts to profiles for quick filling
- **SPA Support**: Works with modern Single Page Applications (React, Vue, Angular)
- **Context Menu**: Right-click to save form fields or entire forms

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/open-autofill.git
   cd open-autofill
   ```

2. Build the extension:
   ```bash
   # Option 1: Using Docker (recommended - no local dependencies)
   ./build.sh

   # Option 2: Using npm directly
   npm install
   npm run build:css
   ```

3. Load in Firefox (temporary mode):
   - Open Firefox and navigate to `about:debugging`
   - Click "This Firefox" in the left sidebar
   - Click "Load Temporary Add-on..."
   - Navigate to the `open-autofill` folder and select `manifest.json`

> **Note**: In temporary mode, the extension will be removed when Firefox closes. For permanent installation, the extension needs to be signed by Mozilla.

### Configuration

1. Click the extension icon and go to Options

2. **Google OAuth Setup** (required for sync):
   - Create a project in [Google Cloud Console](https://console.cloud.google.com/)
   - Enable the Google Sheets API
   - Create OAuth 2.0 credentials (usually **Web application** type works, but **Chrome app** or **Other** is also suitable for extensions)
   - **Note**: This extension uses the **Implicit Flow**, so you do **NOT** need a `client_secret`. Only the `client_id` is required.
   - Retrieve your extension's redirect URI:
     - Open Firefox and go to `about:debugging`
     - Find "Open Autofill" and click "Inspect" (this opens the background page console)
     - Look for the log message: `Extension Redirect URI: ...`
   - Add this URI to the "Authorized redirect URIs" in your Google Cloud Console credentials
   - Update `src/shared/constants.js` with your **Client ID**

3. **Extension ID**:
   - The extension ID is configured in `manifest.json` under `browser_specific_settings.gecko.id`.
   - Changing this ID will change your redirect URI.

4. Connect your Google account in the extension options

5. Enter your Google Sheet ID

## Google Sheet Setup

Create a Google Sheet with two tabs:

### Profiles Tab
| ID | Name | Hotkey | Site |
|----|------|--------|------|
| p1 | My Profile | Alt + W | example.com |

### Rules Tab
| ID | Type | Name | Value | Site | Mode | Profile ID |
|----|------|------|-------|------|------|------------|
| r1 | Text | username | john@example.com | | Overwrite | p1 |
| r2 | Select | country | France | | Overwrite | p1 |

### Column Descriptions

**Profiles:**
- `ID`: Unique identifier for the profile
- `Name`: Display name for the profile
- `Hotkey`: Keyboard shortcut (e.g., "Alt + W", "Ctrl + Shift + 1")
- `Site`: URL pattern to match (optional, restricts profile to specific sites)

**Rules:**
- `ID`: Unique identifier for the rule
- `Type`: Field type - "Text", "Select", "Checkbox", or "Radio"
- `Name`: Field identifier (id, name attribute, or CSS selector)
- `Value`: Value to fill
- `Site`: URL pattern (optional, further restricts the rule)
- `Mode`: "Overwrite", "Append", or "Skip if filled"
- `Profile ID`: Links to a profile's ID

## Usage

### Filling Forms

1. Click the extension icon to show the floating bar
2. Select a profile from the dropdown
3. Click "Fill" or press the profile's hotkey

### Saving Form Data

1. Fill out a form manually
2. Right-click and select "Save form" or "Save this field"
3. Choose or create a profile
4. Data syncs to Google Sheets automatically

### Sync

- Automatic sync every 10 minutes (configurable)
- Manual sync via Options page
- Conflicts: Google Sheet always wins

## Development

### Prerequisites

- **Option A**: Docker (recommended)
- **Option B**: Node.js 18+ and npm

### Build Commands

```bash
# Build CSS (required before first run)
./build.sh                    # Auto-detects Docker or npm

# Or manually with npm
npm install                   # Install dependencies
npm run build:css             # Build minified CSS

# Development mode (watch for changes)
npm run watch:css
```

### Project Structure

```
open-autofill/
├── manifest.json             # Extension manifest (MV3)
├── Dockerfile                # Docker build configuration
├── build.sh                  # Build script (Docker or npm)
├── package.json              # npm dependencies
├── tailwind.config.js        # Tailwind CSS configuration
├── icons/                    # Extension icons
└── src/
    ├── core/                 # Business logic (UI-independent)
    │   ├── storage/
    │   │   └── storage.js    # Storage abstraction layer
    │   ├── network/
    │   │   ├── messaging.js  # Browser messaging utilities
    │   │   ├── oauth.js      # Google OAuth2 Implicit Flow
    │   │   └── sync.js       # Google Sheets synchronization
    │   └── logic/
    │       ├── form-detector.js    # Form detection engine
    │       ├── field-extractor.js  # Field data extraction
    │       ├── form-filler.js      # Form filling engine
    │       └── event-dispatcher.js # DOM event simulation
    │
    ├── app/                  # Extension entry points
    │   ├── background/
    │   │   ├── background.js # Service worker orchestrator
    │   │   ├── alarms.js     # Periodic sync scheduling
    │   │   └── context-menu.js # Right-click menu actions
    │   ├── content/
    │   │   ├── content.js    # Content script entry point
    │   │   └── mutation-watcher.js # SPA DOM observer
    │   └── options/
    │       ├── options.html  # Options page HTML
    │       ├── options.js    # Options page orchestrator
    │       └── components/   # Modular UI components
    │           ├── auth-section.js      # Google auth UI
    │           ├── settings-section.js  # Settings & sync UI
    │           ├── profiles-view.js     # Profile CRUD
    │           ├── rules-view.js        # Rules CRUD
    │           ├── data-section.js      # Import/Export
    │           ├── modal-manager.js     # Modal dialogs
    │           ├── search-pagination.js # Search & paging
    │           └── toast.js             # Toast notifications
    │
    ├── ui/                   # Reusable UI components
    │   ├── components/
    │   │   ├── floating-bar.js  # Floating action bar
    │   │   └── save-dialog.js   # Save form dialog
    │   └── styles/
    │       ├── input.css     # Tailwind source
    │       └── output.css    # Generated CSS (built)
    │
    └── shared/               # Cross-cutting utilities
        ├── constants.js      # Configuration & constants
        └── utils.js          # Shared helper functions
```

### Architecture Overview

The codebase follows a **component-based architecture** with strict separation of concerns:

- **`core/`** - Pure business logic with no UI dependencies. Can be tested independently.
- **`app/`** - Extension entry points that wire together core logic and UI.
- **`ui/`** - Reusable interface components (Shadow DOM isolated).
- **`shared/`** - Utilities and constants used across all layers.

### Key Files

- `src/app/background/background.js` - Service worker orchestrating OAuth, sync, and messaging
- `src/core/logic/form-filler.js` - Form filling engine with multi-type support
- `src/core/network/sync.js` - Bi-directional Google Sheets synchronization
- `src/ui/components/floating-bar.js` - Floating UI with profile selection
- `src/app/options/options.js` - Options page entry point (imports component modules)

### Development Workflow

1. Make changes to source files
2. If you modified CSS/HTML, rebuild: `npm run build:css`
3. In Firefox `about:debugging`, click "Reload" on the extension
4. Test your changes

> **Tip**: Use `npm run watch:css` to auto-rebuild CSS on changes.

## Security

- OAuth tokens stored locally in browser storage
- No data sent to third-party servers
- All sync happens directly with Google Sheets API
- Extension permissions are minimal

## License

MIT License - see LICENSE file for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

For issues and feature requests, please use the GitHub issue tracker.
