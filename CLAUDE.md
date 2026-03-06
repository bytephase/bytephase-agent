# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                                  # Run the Electron app
npm run dev                                # Run in dev mode (--dev flag)
npm run build -- --mac --win --linux       # Build for all platforms (outputs to dist/)
npm run build -- --mac                     # Build for macOS only
npm run build -- --win                     # Build for Windows only
npm run build -- --linux                   # Build for Linux only
```

No test framework or linter is configured. `npm test` is a placeholder.

## Architecture

BytePhase Agent is an **Electron desktop app** that bridges cloud CRM applications with local resources. It runs as a **system tray background service**, polls a cloud backend for jobs, routes them to handler modules, and reports results back.

### Entry Point & Main Process

`index.js` — Electron main process. Handles:
- System tray creation and menu updates (every 5s)
- Health check HTTP server on port 19876 (frontend detection)
- IPC handlers for settings/scan UI windows
- Deep link routing (`bytephase://` protocol)
- Single-instance enforcement via `InstanceLockHelper`
- Module/service initialization and lifecycle

### Core Module System (`core/`)

Plugin architecture with auto-discovery. All modules live in `modules/` and extend `BaseModule`.

- **`base-module.js`** — Abstract base class. Required overrides: `canHandle(jobType)`, `execute(job)`, `getCapabilities()`. Lifecycle: `initialize()` → `activate()` → `deactivate()` → `destroy()`.
- **`module-manager.js`** — Singleton. Scans `modules/` dir, loads each `index.js`, manages enable/disable lifecycle. Key methods: `loadAll()`, `enable(name, config)`, `disable(name)`, `findHandler(jobType)`, `executeJob(job)`.
- **`job-router.js`** — Singleton. Routes jobs via `route(job)`, delegates to module-manager's `findHandler()` + `executeJob()`. Maintains last 1000 job history.
- **`event-bus.js`** — Singleton pub/sub. Events: `module:registered`, `module:enabled`, `module:disabled`, `job:start`, `job:complete`, `job:error`.

### Services (`services/`)

- **`auth.service.js`** — Encrypted credential storage via `electron-store`. API key verification against `POST /api/agent/verify-key`. Provides `getAuthHeader()` for all cloud requests.
- **`polling.service.js`** — Singleton. Polls `POST /api/agent/poll` every 30s. Exponential backoff on 3+ consecutive failures (doubles interval, max 5min). Reports results to `POST /api/agent/result`. Syncs unreported jobs from SQLite queue.
- **`queue.service.js`** — Offline-first SQLite queue using `sql.js` (pure JS, no native deps). Tables: `offline_queue`, `completed_jobs`. Auto-cleanup after 7 days.
- **`deeplink.service.js`** — Parses `bytephase://` URLs, routes to `handleConnect()` or `handleScanDirectory()`.
- **`token.service.js`** — HMAC-SHA256 token validation with 10-min expiry and nonce replay prevention.

### Modules (`modules/`)

**Tally** (`modules/tally/`) — Integrates with Tally ERP via local XML API on `localhost:9000`. Job types prefixed with `tally.`. Uses `tally.service.js` for HTTP XML communication.

**Directory Scanner** (`modules/directory-scanner/`) — Scans local directories for data recovery. Job types prefixed with `scanner.`. Key files:
- `scanner.service.js` — Recursive traversal with pause/resume/cancel
- `html-generator.js` — Self-contained interactive HTML snapshots
- `devextreme-formatter.js` — Converts tree to DevExtreme FileManager formats (hierarchical, flat, datasource)
- Upload uses chunked POST (1000 items/chunk) to `/api/agent/directory-scans/results`

### Data Flow

```
Cloud poll → jobs array → JobRouter.route() → ModuleManager.findHandler() →
Module.execute() → result saved to SQLite → POST /api/agent/result
```

For directory scans via deep link:
```
bytephase://scan-directory?token=... → token validated → scan window opens →
user picks directory → ScannerService.scan() → DevExtremeFormatter.flatten() →
chunked upload to cloud → progress updates via POST
```

## Key Patterns

- **CommonJS throughout** (`require`/`module.exports`), no ESM
- **Singletons** — `module-manager`, `job-router`, `event-bus`, all services export `new Instance()`
- **No context isolation** — `nodeIntegration: true`, `contextIsolation: false` in BrowserWindows
- **IPC** — Main process uses `ipcMain.handle()` (invoke/handle pattern) for settings, `ipcMain.on()` (send/on pattern) for scan operations
- **Config** — `config/default.json` for defaults, `config/agent.config.json` for module enable/disable state (can be updated at runtime by cloud)

## Cloud API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/agent/verify-key` | Register agent with API key |
| POST | `/api/agent/poll` | Poll for jobs |
| POST | `/api/agent/result` | Report job results |
| POST | `/api/agent/directory-scans/results` | Upload scan data (chunked) |
| POST | `/api/agent/directory-scans/{jobId}/progress` | Report scan progress |

## Adding a New Module

1. Create `modules/<name>/index.js` extending `BaseModule`
2. Implement `canHandle(jobType)`, `execute(job)`, `getCapabilities()`
3. Add entry to `config/agent.config.json` under `modules`
4. ModuleManager auto-discovers on next startup

## Git Workflow

- **New task** — always pull main, create a new branch from it (e.g., `feat/tally-stock-sync`)
- **Continuing on same branch** — always pull and merge latest main before starting work each day

## Git Commit Rules

- **Always split into multiple logical commits** — one concern per commit
- **Single-line commit messages** following conventional commit prefixes: `feat:`, `fix:`, `impr:`, `chore:`, `refactor:`, `docs:`
- **Never add Co-Authored-By or Claude attribution** in commit messages
- Examples:
  - `feat: add tally company detection and selection`
  - `fix: reduce chunk size to 1000 for nginx compatibility`
  - `chore: remove outdated documentation files`
