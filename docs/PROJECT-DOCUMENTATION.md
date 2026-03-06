# BytePhase Agent v2.0 - Complete Project Documentation

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Core Module System](#core-module-system)
- [Services Layer](#services-layer)
- [Modules](#modules)
- [Utilities](#utilities)
- [User Interface](#user-interface)
- [Deep Linking](#deep-linking)
- [Configuration](#configuration)
- [Security](#security)
- [End-to-End Workflows](#end-to-end-workflows)
- [API Endpoints](#api-endpoints)
- [Build & Distribution](#build--distribution)

---

## Overview

**BytePhase Agent** is a production-ready **Electron desktop application** that acts as a bridge between cloud applications and local resources. It runs as a background service in the system tray, polls a cloud backend for jobs, routes them to appropriate modules, and reports results back.

| Detail        | Value                                    |
| ------------- | ---------------------------------------- |
| Version       | 2.0.0                                   |
| Platform      | Windows, macOS, Linux                    |
| Runtime       | Electron 39.2.7, Node.js (CommonJS)     |
| Protocol      | `bytephase://` (custom deep linking)     |
| App ID        | `com.bytephase.agent`                    |
| Health Server | `http://127.0.0.1:19876`                |

**Real-world use cases:**

- **Data Recovery:** Scan recovered drives and generate snapshots for customer verification
- **ERP Integration:** Push/pull data between Tally accounting software and cloud
- **Retail POS:** Sync local transactions to a cloud platform
- **Custom Workflows:** Extend with proprietary modules for any business logic

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloud Backend (CRM)                      │
│          /api/agent/poll  /api/agent/result  etc.            │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS (polling every 30s)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   BytePhase Agent (Electron)                 │
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │  System   │  │   Polling    │  │   Deep Link        │    │
│  │  Tray UI  │  │   Service    │  │   Handler          │    │
│  └──────────┘  └──────┬───────┘  └────────────────────┘    │
│                        │                                     │
│                 ┌──────▼───────┐                             │
│                 │  Job Router  │                             │
│                 └──────┬───────┘                             │
│                        │                                     │
│        ┌───────────────┼───────────────┐                    │
│        ▼               ▼               ▼                    │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐           │
│  │  Tally   │   │ Directory │   │  Future      │           │
│  │  Module  │   │ Scanner   │   │  Modules...  │           │
│  └──────────┘   └──────────┘   └──────────────┘           │
│        │                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────────┐           │
│  │  Queue   │   │  Auth     │   │  Event Bus   │           │
│  │ (SQLite) │   │  Service  │   │  (Pub/Sub)   │           │
│  └──────────┘   └──────────┘   └──────────────┘           │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
   Tally ERP (XML)              Local File System
   localhost:9000               (Directory Scanning)
```

---

## Project Structure

```
bytephase-agent/
├── index.js                              # Main Electron process (entry point)
├── package.json                          # Dependencies & build config
│
├── core/                                 # Module system infrastructure
│   ├── base-module.js                   # Abstract base class for all modules
│   ├── module-manager.js                # Lifecycle management & module loading
│   ├── job-router.js                    # Intelligent job routing to modules
│   └── event-bus.js                     # Inter-module pub/sub event system
│
├── modules/                              # Module implementations
│   ├── tally/                           # Tally ERP integration
│   │   ├── index.js                    # Module class
│   │   └── tally.service.js            # Tally XML API operations
│   │
│   └── directory-scanner/               # Directory scanning & upload
│       ├── index.js                    # Module class
│       ├── scanner.service.js          # Core recursive scanning logic
│       ├── html-generator.js           # Interactive HTML snapshot export
│       └── devextreme-formatter.js     # DevExtreme FileManager format conversion
│
├── services/                             # Core business services
│   ├── auth.service.js                  # Encrypted credential management
│   ├── polling.service.js               # Cloud polling with backoff
│   ├── queue.service.js                 # SQLite offline job queue
│   ├── deeplink.service.js              # bytephase:// URL handler
│   └── token.service.js                 # HMAC token validation
│
├── utils/                                # Utility helpers
│   ├── instance-lock.helper.js          # Single-instance enforcement
│   ├── protocol-registration.helper.js  # bytephase:// protocol setup
│   └── notification.helper.js           # Desktop notifications
│
├── ui/                                   # User interface
│   ├── settings.html                    # Main settings window
│   ├── directory-scan.html              # Directory scanner UI
│   ├── renderer.js                      # UI logic & IPC handlers
│   └── styles.css                       # Styling
│
├── config/                               # Configuration files
│   ├── agent.config.json                # Module configuration
│   ├── default.json                     # Default settings & fallbacks
│   └── tally-versions.json              # Tally version mappings
│
├── tally/                                # Legacy Tally utilities (v1.0)
│   ├── xml-builder.js
│   └── xml-parser.js
│
├── assets/                               # App icons & images
├── scripts/                              # Testing & utility scripts
├── docs/                                 # Architecture documentation
└── dist/                                 # Built packages (dmg, exe, AppImage)
```

---

## Core Module System

The core provides a plugin architecture that lets modules be loaded, enabled, and disabled dynamically.

### BaseModule (`core/base-module.js`)

Abstract base class that all modules must extend.

| Method              | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `initialize()`      | Set up resources (called once on load)               |
| `activate()`        | Start the module (called on enable)                  |
| `deactivate()`      | Stop the module (called on disable)                  |
| `destroy()`         | Clean up resources (called on shutdown)              |
| `canHandle(type)`   | Returns `true` if the module handles this job type   |
| `execute(job)`      | Process a job and return a result                    |
| `healthCheck()`     | Return current health status                         |
| `getCapabilities()` | Declare supported job types and features             |
| `validateConfig()`  | Validate module configuration                        |
| `getStatus()`       | Return module state, uptime, and statistics          |

### ModuleManager (`core/module-manager.js`)

Singleton that manages the complete module lifecycle.

- **Auto-discovery:** Scans the `/modules` directory for module folders
- **Dynamic loading:** Requires each module's `index.js` and instantiates it
- **Lifecycle control:** `enable()`, `disable()`, `initialize()`, `destroyAll()`
- **Job routing:** Finds the handler module for any given job type
- **Health monitoring:** Aggregates health checks from all loaded modules

### JobRouter (`core/job-router.js`)

Routes incoming jobs to the correct handler module.

- Finds the module that `canHandle()` the job type
- Executes the job and tracks the result
- Maintains a history of the last 1,000 jobs
- Collects statistics: success rate, average duration, failure count

### EventBus (`core/event-bus.js`)

Pub/sub system for loose coupling between components.

- `publish(event, data)` — Emit an event
- `subscribe(event, handler)` — Listen for events
- `subscribeOnce(event, handler)` — One-time listener
- Events include module lifecycle, job completion, scan progress, etc.

---

## Services Layer

### AuthService (`services/auth.service.js`)

Manages credentials and API key verification.

- **Encrypted storage** using `electron-store` with an encryption key
- **Machine ID** generation via `node-machine-id` for device identification
- **API key verification** against the cloud backend (`POST /api/agent/verify-key`)
- Returns `agentId`, `shopId`, `cloudUrl`, and per-module configurations

Key methods:
- `setCredentials(creds)` / `getApiKey()` / `getShopId()` — CRUD for credentials
- `verifyAndConfigureWithApiKey(apiKey)` — One-step verify + configure
- `isRegistered()` — Check if agent is configured
- `clearCredentials()` — Logout and wipe stored data

### PollingService (`services/polling.service.js`)

Handles periodic cloud communication and job execution.

- **Polls** the cloud every 30 seconds (configurable)
- **Exponential backoff:** 3+ consecutive failures double the interval (up to 5 min max)
- **Smart interval:** Server can override the poll interval in its response
- **Rate limiting:** Handles HTTP 429 with backoff
- Sends module health status with each poll request

**Poll cycle:**
1. `POST /api/agent/poll` with agent_id, shop_id, module health
2. Receive jobs array from the response
3. Check if job was already processed (duplicate prevention)
4. Route each job via `JobRouter.route(job)`
5. Save result to local SQLite queue
6. Report result via `POST /api/agent/result`
7. Sync any previously unreported jobs

### QueueService (`services/queue.service.js`)

Offline-first SQLite queue for reliability.

Uses `sql.js` (pure JavaScript SQLite — no native compilation required).

**Database tables:**

| Table            | Purpose                                           |
| ---------------- | ------------------------------------------------- |
| `offline_queue`  | Pending jobs: id, job_id, type, payload, status   |
| `completed_jobs` | Finished jobs: id, job_id, result, reported flag  |

- Jobs transition: `pending` → `synced` → auto-deleted after 7 days
- Duplicate prevention via unique `job_id`
- Auto-cleanup of old synced jobs

### DeepLinkService (`services/deeplink.service.js`)

Parses and handles `bytephase://` deep link URLs.

**URL format:**
```
bytephase://connect?token=<BASE64_HMAC_TOKEN>
bytephase://scan-directory?token=<BASE64_HMAC_TOKEN>
```

**Supported actions:**

| Action           | Behavior                                         |
| ---------------- | ------------------------------------------------ |
| `connect`        | Configure agent credentials and start polling    |
| `scan-directory` | Open directory scan UI with scan parameters      |

### TokenService (`services/token.service.js`)

Validates HMAC-signed tokens from deep links.

**Token format:** `BASE64(JSON_PAYLOAD).BASE64(HMAC_SIGNATURE)`

**Payload structure:**
```json
{
  "api_key": "...",
  "timestamp": 1234567890,
  "nonce": "unique-id",
  "metadata": { "frontendUrl": "...", "shopId": "..." }
}
```

**Security checks:**
- HMAC-SHA256 signature verification
- 10-minute expiry window
- Nonce tracking to prevent replay attacks
- Clock skew tolerance (±1 minute)

---

## Modules

### Tally Module (`modules/tally/`)

Integrates with **Tally ERP** accounting software via its local XML API.

**Supported job types:**

| Job Type               | Description                       | Status      |
| ---------------------- | --------------------------------- | ----------- |
| `tally.voucher.create` | Create sales/purchase vouchers    | Implemented |
| `tally.voucher.read`   | Read voucher details              | Stub        |
| `tally.ledger.create`  | Create ledger accounts            | Stub        |
| `tally.ledger.read`    | Fetch ledger list                 | Stub        |
| `tally.stock.create`   | Create stock items                | Stub        |
| `tally.stock.read`     | Fetch stock items                 | Stub        |
| `tally.report.generate`| Generate financial reports        | Stub        |

**Configuration:**
```json
{
  "tallyHost": "localhost",
  "tallyPort": 9000,
  "tallyCompany": null,
  "autoDetectVersion": true,
  "timeout": 10000
}
```

**How it works:**
- Communicates with Tally via HTTP POST of XML envelopes to `http://host:port`
- Auto-detects Tally version (ERP9, Prime, PrimeServer)
- Auto-detects active company name
- Builds XML request bodies and parses XML responses using `xml2js`

### Directory Scanner Module (`modules/directory-scanner/`)

Scans local directory structures for data recovery verification and file inventory.

**Supported job types:**

| Job Type                          | Description                            |
| --------------------------------- | -------------------------------------- |
| `scanner.directory.select`        | Show directory picker dialog           |
| `scanner.directory.scan`          | Scan directory and build tree          |
| `scanner.directory.scan-with-upload` | Scan + upload results to cloud      |
| `scanner.export.html`             | Generate interactive HTML snapshot     |
| `scanner.export.json`             | Export scan results as JSON            |
| `scanner.export.devextreme`       | Export for DevExtreme FileManager      |
| `scanner.cancel`                  | Cancel an ongoing scan                 |

**Configuration:**
```json
{
  "maxDepth": 10,
  "includeHidden": false,
  "maxFileSize": 104857600,
  "excludePatterns": ["node_modules", ".git", ".DS_Store", "$RECYCLE.BIN"],
  "calculateHashes": false,
  "followSymlinks": false
}
```

**Key features:**
- Recursive directory traversal with configurable depth (1–50)
- File categorization by type (image, video, audio, document, archive, code)
- Optional SHA-256 hash calculation
- Pause/Resume/Cancel support during long scans
- **Chunked uploads** — splits large scans into 1,000-item chunks for reliable transfer
- **Real-time progress** — sends percentage, file counts, and current path to both UI and backend
- **HTML snapshot export** — generates a self-contained interactive HTML file with search, expand/collapse, and statistics
- **DevExtreme format** — outputs hierarchical, flat, or DataSource format for the DevExtreme FileManager component

**Performance:**

| File Count  | Approximate Time |
| ----------- | ---------------- |
| 10,000      | < 5 seconds      |
| 100,000     | < 30 seconds     |
| 1,000,000   | < 5 minutes      |

**Upload flow:**
1. User selects a directory via Electron dialog
2. `ScannerService` recursively builds a file tree
3. Tree is flattened to an array via `DevExtremeFormatter.flatten()`
4. Array is split into chunks of 1,000 items
5. Each chunk is POSTed to `/api/agent/directory-scans/results`
6. Progress updates are sent to `/api/agent/directory-scans/{jobId}/progress`

---

## Utilities

### InstanceLockHelper (`utils/instance-lock.helper.js`)

Ensures only one instance of the agent runs at a time.

- Uses Electron's built-in single-instance lock
- **Heartbeat system:** writes a timestamp every 10 seconds
- **Stale detection:** if heartbeat is older than 30 seconds, assumes a crash and cleans up
- Forwards deep link URLs from a blocked second instance to the primary

### ProtocolRegistrationHelper (`utils/protocol-registration.helper.js`)

Registers the `bytephase://` custom protocol with the OS.

- **Windows/macOS:** `app.setAsDefaultProtocolClient()`
- **Linux:** Creates a `.desktop` file for XDG protocol handling

### NotificationHelper (`utils/notification.helper.js`)

Sends desktop notifications for key events:
- Connection success/failure
- Scan completion
- Network status changes

---

## User Interface

### System Tray

The agent runs as a tray icon with a context menu showing:
- Registration status
- Active module count
- Polling status (running/stopped)
- Jobs processed count
- Queue pending count
- Actions: Settings, Modules, Toggle Polling, View Logs, Quit

The tray menu updates every 5 seconds with live statistics.

### Settings Window (`ui/settings.html`)

Three tabs:

1. **Setup Tab**
   - **Quick Setup:** Paste an API key to auto-configure everything
   - **Advanced Setup:** Manual configuration of cloud URL, API key, agent ID, shop ID
   - Test Tally connection button

2. **Status Tab**
   - Registration status
   - Module list with health indicators
   - Polling statistics (total polls, success/fail counts)
   - Queue statistics (pending, synced, failed)

3. **Logs Tab**
   - Real-time log output (last 100 entries)
   - Color-coded by level: INFO (blue), WARNING (yellow), ERROR (red)

### Directory Scan Window (`ui/directory-scan.html`)

Dedicated window for directory scanning operations:
- Progress bar (0–100%)
- Current path being scanned
- File and folder counts
- Pause / Resume / Cancel controls
- Real-time statistics display

---

## Deep Linking

The agent supports `bytephase://` URLs for one-click actions from a web browser.

### Flow

```
Web App → generates bytephase:// URL → browser opens it
  → OS routes to BytePhase Agent → DeepLinkService parses URL
  → TokenService validates HMAC token → action is executed
```

### Platform Handling

| Platform      | Cold Start                          | Warm Start                         |
| ------------- | ----------------------------------- | ---------------------------------- |
| Windows/Linux | Parsed from `process.argv`          | `app.on('second-instance')` event  |
| macOS         | `app.on('open-url')` event          | `app.on('open-url')` event         |

### Supported URLs

```
bytephase://connect?token=<token>          → Register agent + start polling
bytephase://scan-directory?token=<token>   → Open directory scan UI
```

---

## Configuration

### `config/agent.config.json`

Per-module configuration:
```json
{
  "version": "2.0",
  "modules": {
    "tally": {
      "enabled": true,
      "config": {
        "tallyHost": "localhost",
        "tallyPort": 9000
      }
    },
    "directory-scanner": {
      "enabled": true,
      "config": {
        "maxDepth": 10,
        "includeHidden": false
      }
    }
  }
}
```

### `config/default.json`

Fallback defaults:
```json
{
  "cloudUrl": "http://localhost:8000",
  "tallyHost": "localhost",
  "tallyPort": 9000,
  "pollInterval": 30000,
  "pollIntervalMin": 10000,
  "pollIntervalMax": 300000,
  "maxRetries": 3,
  "backoffMultiplier": 2,
  "requestTimeout": 10000
}
```

### Health Check Server

A lightweight HTTP server on **port 19876** lets the frontend detect if the agent is running:

```
GET http://127.0.0.1:19876/health

Response:
{
  "status": "ok",
  "agent": "bytephase-agent",
  "version": "2.0.0",
  "registered": true,
  "polling": true
}
```

CORS is enabled for browser requests.

---

## Security

| Feature                     | Implementation                                         |
| --------------------------- | ------------------------------------------------------ |
| Encrypted credential store  | `electron-store` with encryption key                   |
| Token signing               | HMAC-SHA256 signature verification                     |
| Token expiry                | 10-minute lifetime from generation                     |
| Replay prevention           | Nonce tracking in persistent store                     |
| Clock skew tolerance        | ±1 minute allowed                                      |
| Single instance             | Electron lock + heartbeat-based stale detection        |
| Module isolation            | No cross-module access to credentials                  |
| HTTPS                       | All cloud communication over HTTPS                     |

---

## End-to-End Workflows

### 1. Agent Registration (Quick Setup)

```
User opens Settings → enters API key → clicks Connect
  ↓
IPC: connect-with-api-key
  ↓
AuthService.verifyAndConfigureWithApiKey(apiKey)
  → POST /api/agent/verify-key
  ← { agentId, shopId, cloudUrl, modules }
  ↓
Saves encrypted credentials
  ↓
Enables modules from cloud config
  ↓
Starts polling service
  ↓
Desktop notification: "Connected successfully"
```

### 2. Agent Registration (Deep Link)

```
User clicks "Connect Agent" in web app
  ↓
Backend generates HMAC token → bytephase://connect?token=...
  ↓
Browser opens deep link → OS routes to agent
  ↓
DeepLinkService validates token (HMAC, expiry, nonce)
  ↓
Extracts api_key from token payload
  ↓
Same flow as Quick Setup above
```

### 3. Job Processing (Polling Cycle)

```
Every 30 seconds:
  POST /api/agent/poll
    → { agent_id, shop_id, status, module_health }
    ← { jobs: [...], poll_interval: 30000 }
  ↓
For each job:
  JobRouter finds handler module → module.execute(job)
    ↓
  QueueService saves result locally
    ↓
  POST /api/agent/result → report to cloud
  ↓
If offline:
  Results queued in SQLite → retried on next successful poll
```

### 4. Directory Scan (Deep Link)

```
User clicks "Scan" in web app
  ↓
bytephase://scan-directory?token=... → opens agent
  ↓
Token validated → scan window opens
  ↓
User selects directory via file picker
  ↓
ScannerService.scan() → recursive traversal → builds tree
  ↓
DevExtremeFormatter.flatten() → flat array
  ↓
uploadInChunks() → 1000 items per chunk
  → POST /api/agent/directory-scans/results (per chunk)
  → POST /api/agent/directory-scans/{jobId}/progress (async)
  ↓
Backend reassembles chunks → scan complete
  ↓
User views results in web app
```

---

## API Endpoints

Endpoints the agent communicates with on the cloud backend:

| Method | Endpoint                                        | Purpose                          |
| ------ | ----------------------------------------------- | -------------------------------- |
| POST   | `/api/agent/verify-key`                         | Verify API key and register      |
| POST   | `/api/agent/poll`                               | Poll for new jobs                |
| POST   | `/api/agent/result`                             | Report job results               |
| POST   | `/api/agent/directory-scans/results`            | Upload scan data (chunked)       |
| POST   | `/api/agent/directory-scans/{jobId}/progress`   | Report scan progress             |
| POST   | `/api/agent/notify-connected`                   | Notify backend agent is online   |

---

## Build & Distribution

### Dependencies

| Package            | Version | Purpose                                  |
| ------------------ | ------- | ---------------------------------------- |
| `electron`         | 39.2.7  | Desktop runtime                          |
| `axios`            | 1.6.2   | HTTP client                              |
| `electron-store`   | 8.1.0   | Encrypted local storage                  |
| `xml2js`           | 0.6.2   | XML parsing (Tally API)                  |
| `sql.js`           | 1.13.0  | Pure JS SQLite (offline queue)           |
| `uuid`             | 9.0.1   | Unique ID generation                     |
| `node-machine-id`  | 1.1.12  | Hardware identification                  |
| `electron-builder` | 24.9.1  | Packaging & distribution                 |

### Build Targets

| Platform | Format   | Notes                          |
| -------- | -------- | ------------------------------ |
| Windows  | NSIS     | Installer with protocol setup  |
| macOS    | DMG      | Disk image                     |
| Linux    | AppImage | Portable                       |

### Adding a New Module

1. Create `modules/my-module/index.js`
2. Extend `BaseModule` from `core/base-module.js`
3. Implement required methods: `canHandle()`, `execute()`, `getCapabilities()`
4. Add configuration to `config/agent.config.json`:
   ```json
   {
     "modules": {
       "my-module": {
         "enabled": true,
         "config": {}
       }
     }
   }
   ```
5. Restart the agent — ModuleManager auto-discovers the new module

---

## Summary

BytePhase Agent is a modular desktop bridge that:

1. **Runs silently** in the system tray as a background service
2. **Polls the cloud** every 30 seconds for jobs to execute
3. **Routes jobs** to the appropriate module (Tally, Directory Scanner, or custom)
4. **Executes locally** — interacts with Tally ERP, scans file systems, etc.
5. **Reports results** back to the cloud with offline resilience
6. **Supports deep linking** for one-click setup and actions from a web browser
7. **Manages modules dynamically** — enable/disable without restarting
8. **Provides health monitoring** via tray menu, settings UI, and HTTP endpoint
