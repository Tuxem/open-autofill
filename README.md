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

2. Open Firefox and navigate to `about:debugging`

3. Click "This Firefox" in the left sidebar

4. Click "Load Temporary Add-on..."

5. Navigate to the `open-autofill` folder and select `manifest.json`

### Configuration

1. Click the extension icon and go to Options

2. **Google OAuth Setup** (required for sync):
   - Create a project in [Google Cloud Console](https://console.cloud.google.com/)
   - Enable the Google Sheets API
   - Create OAuth 2.0 credentials (Web application type)
   - Add your extension's redirect URI
   - Update `src/constants.js` with your client ID

3. Connect your Google account in the extension options

4. Enter your Google Sheet ID

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

### Project Structure

```
open-autofill/
├── manifest.json           # Extension manifest (MV3)
├── src/
│   ├── background/         # Service worker scripts
│   ├── content/            # Content scripts
│   ├── ui/                 # UI components
│   ├── options/            # Options page
│   ├── lib/                # Shared utilities
│   └── constants.js        # Configuration constants
├── icons/                  # Extension icons
└── tests/                  # Test files
```

### Key Files

- `background/background.js` - Service worker orchestration
- `background/oauth.js` - Google OAuth2 implementation
- `background/sync.js` - Google Sheets synchronization
- `content/form-filler.js` - Form filling engine
- `ui/floating-bar.js` - Floating UI component

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
