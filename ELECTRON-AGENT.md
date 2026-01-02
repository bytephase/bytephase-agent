# Bytephase Tally Agent - Electron Desktop Application

## Overview

The Electron Agent is a desktop application that acts as a bridge between your local Tally software and the cloud-based Laravel Tally Connect service.

## Features

- ✅ **System Tray Application** - Runs in background with minimal footprint
- ✅ **Automatic Polling** - Checks for jobs every 30 seconds (configurable)
- ✅ **Offline Queue** - Stores jobs locally when internet is unavailable
- ✅ **Tally Detection** - Automatically detects Tally version and company
- ✅ **Secure Authentication** - Encrypted API key storage
- ✅ **Visual UI** - Easy configuration through settings window
- ✅ **Auto-Recovery** - Automatically reconnects after network failures
- ✅ **Job Tracking** - Complete history of processed jobs in SQLite

## Installation

### Prerequisites

- **Node.js** 18+ installed
- **Tally** ERP 9 / Prime / Prime Server running on localhost:9000
- **Windows / macOS / Linux**

### Step 1: Install Dependencies

```bash
cd bytephase-tally-agent
npm install
```

This will install:
- `electron` - Desktop application framework
- `axios` - HTTP client for API calls
- `better-sqlite3` - Local database for offline queue
- `electron-store` - Encrypted credential storage
- `xml2js` - XML parsing for Tally responses
- `uuid` - Generate unique identifiers
- `node-machine-id` - Get unique machine ID

### Step 2: Run the Agent

#### Development Mode

```bash
npm start
```

#### Production Build

```bash
npm run build
```

This creates installable packages in the `dist/` folder:
- **Windows**: `.exe` installer
- **macOS**: `.dmg` installer
- **Linux**: `.AppImage`

## Configuration

### First Time Setup

1. **Start the agent** - Run `npm start`
2. **Click the tray icon** - Find the Bytephase icon in your system tray
3. **Open Settings** - Click "Settings" from the menu
4. **Enter credentials:**
   - **Cloud URL**: Your Laravel Tally Connect server (e.g., `https://tally.yourcompany.com`)
   - **API Key**: Get this from your cloud service admin
   - **Agent ID**: Unique identifier (e.g., `agent_shop_001`)
   - **Shop ID**: Your shop identifier (e.g., `shop_123`)
5. **Save & Start** - Agent will begin polling automatically

### Configuration File Location

Credentials are stored encrypted at:
- **Windows**: `C:\Users\{username}\AppData\Roaming\bytephase-tally-agent\`
- **macOS**: `~/Library/Application Support/bytephase-tally-agent/`
- **Linux**: `~/.config/bytephase-tally-agent/`

## Usage

### System Tray Menu

The agent runs in the system tray with the following menu options:

```
Bytephase Tally Agent
---------------------
✓ Registered (shop_123)
✓ Tally Running
✓ Polling Active
---------------------
Jobs Processed: 45
Queue: 0 pending
---------------------
Settings
Stop/Start Polling
View Logs
---------------------
Quit
```

### Status Indicators

- **✓ Registered** - Agent is configured and connected
- **✓ Tally Running** - Tally software is accessible on port 9000
- **✓ Polling Active** - Agent is checking for jobs

### Settings Window

#### Setup Tab
- Configure cloud connection
- Enter credentials
- Test Tally connection
- Clear configuration

#### Status Tab
- Real-time agent status
- Tally connection status
- Job statistics
- Queue information

#### Logs Tab
- View recent activity (coming soon)

## How It Works

### Polling Cycle (Every 30 seconds)

```
1. Agent checks if Tally is running
2. Agent polls cloud service: POST /api/agent/poll
   {
     "agent_id": "agent_123",
     "status": "idle",
     "tally_version": "Prime",
     "tally_company": "ABC Corp"
   }
3. Cloud returns pending jobs
4. Agent executes jobs on Tally via XML API
5. Agent reports results: POST /api/agent/result
6. Agent syncs any unreported jobs from offline queue
7. Wait 30 seconds, repeat
```

### Job Execution Flow

```
Cloud Job Received
    ↓
Check if already processed (idempotent)
    ↓
Execute on Tally (XML API)
    ↓
Parse Tally response
    ↓
Save result locally (SQLite)
    ↓
Report to cloud
    ↓
Mark as reported
```

### Offline Handling

When internet is unavailable:
1. Cloud jobs accumulate in Redis queue
2. Agent stores completed results in local SQLite
3. When connection restored:
   - Agent downloads all pending jobs
   - Agent uploads unreported results
   - Everything syncs automatically

## Supported Tally Operations

### Vouchers
- `voucher.create` - Create sales, purchase, payment, receipt vouchers
- `voucher.read` - Read voucher details

### Ledgers
- `ledger.create` - Create new ledger accounts
- `ledger.read` - Fetch all ledgers

### Stock Items
- `stock.create` - Create stock/inventory items
- `stock.read` - Fetch stock items

### Reports
- `report.generate` - Generate day book, trial balance, stock summary

## Troubleshooting

### Agent Won't Start

```bash
# Check if dependencies are installed
npm install

# Check for errors
npm start

# Check logs
# Windows: %APPDATA%\bytephase-tally-agent\logs
# macOS: ~/Library/Logs/bytephase-tally-agent/
# Linux: ~/.config/bytephase-tally-agent/logs
```

### Tally Not Detected

1. **Verify Tally is running**
2. **Check Tally XML API is enabled:**
   - Gateway of Tally → F12 (Configure) → Connectivity
   - Enable "Allow Data Access via XML"
   - Port should be 9000
3. **Test manually:**
   ```bash
   curl -X POST http://localhost:9000 -d "<ENVELOPE></ENVELOPE>"
   ```

### Jobs Not Processing

1. **Check registration status** - Open Settings → Status tab
2. **Verify polling is active** - Should show "✓ Polling Active"
3. **Check cloud URL** - Make sure it's reachable
4. **Check API key** - Invalid key will cause 401 errors
5. **View queue stats** - Settings → Status → Queue information

### Connection Errors

**Error: 401 Unauthorized**
- Invalid API key
- Solution: Re-enter API key in Settings

**Error: ECONNREFUSED**
- Cloud service unreachable
- Solution: Check cloud URL, verify server is running

**Error: Tally Not Running**
- Tally software not started
- Solution: Start Tally and ensure XML API is enabled

### Reset Agent

To completely reset the agent:

```bash
# Stop the agent
# Then delete configuration:

# Windows
del /q %APPDATA%\bytephase-tally-agent\*

# macOS/Linux
rm -rf ~/Library/Application\ Support/bytephase-tally-agent/*
rm -rf ~/.config/bytephase-tally-agent/*
```

## Development

### Project Structure

```
bytephase-tally-agent/
├── index.js                    # Main Electron process
├── package.json                # Dependencies and scripts
├── config/
│   ├── default.json            # Default configuration
│   └── tally-versions.json     # Tally version mappings
├── services/
│   ├── auth.service.js         # API key management
│   ├── tally.service.js        # Tally XML communication
│   ├── polling.service.js      # Cloud polling
│   ├── queue.service.js        # Offline queue (SQLite)
│   └── tallyClient.js          # Legacy Tally check
├── tally/
│   ├── xml-builder.js          # Build Tally XML requests
│   └── xml-parser.js           # Parse Tally responses
├── ui/
│   ├── settings.html           # Settings UI
│   ├── styles.css              # Styles
│   └── renderer.js             # UI logic
├── assets/
│   └── icon.png                # App icon
├── docs/
│   └── ARCHITECTURE.md         # System architecture
└── README.md                   # Project overview
```

### Adding New Tally Operations

1. **Add operation to `tally.service.js`:**

```javascript
async createNewOperation(data) {
  console.log('[TALLY] Creating new operation:', data);

  const xml = await xmlBuilder.buildNewOperation(data);
  const response = await this.sendRequest(xml);

  return await xmlParser.parseNewOperationResponse(response);
}
```

2. **Add XML builder method in `tally/xml-builder.js`:**

```javascript
buildNewOperation(data) {
  return `
    <ENVELOPE>
      <!-- Your XML structure -->
    </ENVELOPE>
  `.trim();
}
```

3. **Add parser method in `tally/xml-parser.js`:**

```javascript
async parseNewOperationResponse(xmlString) {
  const result = await this.parse(xmlString);
  // Parse and return
}
```

4. **Add route handler in `executeJob()` method:**

```javascript
case 'operation.new':
  result = await this.createNewOperation(job.payload);
  break;
```

### Testing

```bash
# Test Tally connection
npm start
# Open Settings → Test Tally button

# Monitor logs
tail -f ~/Library/Application\ Support/bytephase-tally-agent/logs/main.log
```

## Security Best Practices

1. **API Keys** - Never commit API keys to version control
2. **HTTPS Only** - Always use HTTPS for cloud URL
3. **Firewall** - Tally should only be accessible on localhost
4. **Updates** - Keep agent updated for security patches
5. **Credentials** - Use strong, unique API keys per agent

## Performance

### Resource Usage

- **CPU**: < 1% idle, 5-10% when processing jobs
- **Memory**: ~100-150 MB
- **Disk**: < 50 MB (including database)
- **Network**: Minimal (polls every 30s, ~1 KB per poll)

### Scaling

- Each agent can handle ~100 jobs/hour
- Polling interval adjusts based on server response
- Automatic backoff on errors
- SQLite can store 10,000+ jobs offline

## License

ISC License - See LICENSE file

## Support

For issues, questions, or contributions:
- GitHub: [Repository URL]
- Email: support@bytephase.com
- Docs: See `docs/ARCHITECTURE.md`

## Changelog

### v1.0.0 (2026-01-02)
- Initial release
- System tray application
- HTTP polling (30s interval)
- Offline queue with SQLite
- Settings UI
- Support for all Tally versions
- Voucher, Ledger, Stock operations
