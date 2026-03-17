# Agent Connection Flows — Complete System Map

## The 4 Codebases

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BytePhase Ecosystem                          │
│                                                                     │
│  1. FRONTEND (Angular)           2. BACKEND (Laravel)               │
│     ../smart-center-frontend        ../smart-center-backend         │
│     *.bytephase.com                 *.api.bytephase.com             │
│     CRM UI for repair shops         API + multi-tenant backend      │
│                                                                     │
│  3. AGENT (Electron)             4. PARTNER PLATFORM (NOT BUILT)    │
│     ../bytephase-agent              partner.bytephase.com           │
│     Desktop app on user's PC        Laravel + Filament              │
│     Bridges local ↔ cloud           B2B supplier marketplace        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## What's Working vs What's Not

| Feature | Frontend | Backend | Agent | Status |
|---------|----------|---------|-------|--------|
| Directory Scan (deep link) | YES | YES | YES | FULLY WORKING IN PRODUCTION |
| Quick Setup (API key) | — | NO (verify-key missing) | YES | NOT WORKING |
| Advanced Setup (manual) | — | NO (poll missing) | YES | SAVES LOCALLY ONLY |
| Deep Link Connect | — | NO (verify-key missing) | YES | NOT WORKING |
| Tally Sync | — | NO (sync endpoints missing) | YES (dry-run) | AGENT-SIDE ONLY |
| Partner Connect | NOT BUILT | NOT BUILT | YES (UI ready) | NOT WORKING |

---

## Directory Scan — The Complete Working Flow

This is the only flow working end-to-end in production. Here's exactly how all 3 codebases connect:

```
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│  FRONTEND (Angular)  │     │  BACKEND (Laravel)   │     │  AGENT (Electron)    │
│  *.bytephase.com     │     │  *.api.bytephase.com │     │  User's Desktop      │
└──────────┬───────────┘     └──────────┬───────────┘     └──────────┬───────────┘
           │                            │                            │
           │ 1. User clicks             │                            │
           │ "Data Validation"          │                            │
           │ on a recovery job          │                            │
           ├───────────────────────────►│                            │
           │ POST /api/jobs/{id}/       │                            │
           │ directory-scans/initiate   │                            │
           │                            │ 2. Creates DirectoryScan   │
           │                            │    record in DB            │
           │                            │                            │
           │                            │ 3. Generates HMAC token    │
           │                            │    with job/scan metadata  │
           │                            │                            │
           │◄───────────────────────────┤                            │
           │ Returns deep link:         │                            │
           │ bytephase://scan-directory │                            │
           │ ?token={signed_token}      │                            │
           │                            │                            │
           │ 4. Opens deep link         │                            │
           │    (3 strategies:          │                            │
           │     anchor, location,      │                            │
           │     window.open)           │                            │
           │─────────────────────────────────────────────────────────►
           │                            │                            │
           │                            │              5. Agent validates token:
           │                            │                 ✓ HMAC signature
           │                            │                 ✓ < 10 min old
           │                            │                 ✓ Nonce not replayed
           │                            │                            │
           │                            │              6. Opens scan window
           │                            │                 Shows: job#, customer
           │                            │                            │
           │                            │◄───────────────────────────┤
           │                            │ POST /agent/directory-scans│
           │                            │ /{jobId}/progress          │
           │                            │ status: 'agent_connected'  │
           │                            │                            │
           │                            │ 7. Stores in Redis         │
           │                            │    (2hr TTL)               │
           │                            │                            │
           │ 8. Polls every 2 seconds   │                            │
           ├───────────────────────────►│                            │
           │ GET /api/directory-scans/  │                            │
           │ job/{jobId}/progress       │                            │
           │◄───────────────────────────┤                            │
           │ Shows "Agent Connected"    │                            │
           │                            │                            │
           │                            │              9. User picks directory
           │                            │                 ScannerService.scan()
           │                            │                 Recursive traversal
           │                            │                            │
           │                            │◄───────────────────────────┤
           │                            │ POST /agent/directory-scans│
           │                            │ /results (chunked, 1000/ea)│
           │                            │                            │
           │                            │ 10. Each chunk → Redis     │
           │                            │     Last chunk → merge     │
           │                            │     → temp file → S3      │
           │                            │                            │
           │ 11. Frontend shows results │                            │
           │     DevExtreme FileManager │                            │
           │     in iframe              │                            │
           │                            │                            │
           │ 12. Send verification link │                            │
           │     to customer            │                            │
           │     (Email/SMS/WhatsApp)   │                            │
```

### Key Files for Each Step

| Step | Codebase | File | Line/Method |
|------|----------|------|-------------|
| 1 | Frontend | `jobs/components/data-validation/data-validation.component.ts` | `initiateDirectoryScan()` |
| 1 | Frontend | `shared/services/directory-scan.service.ts` | `initiateScan()` |
| 2-3 | Backend | `Http/Controllers/Tenant/DirectoryScanController.php` | `initiateDirectory()` (line 33) |
| 3 | Backend | `Services/TokenGeneratorService.php` | `generate()` |
| 4 | Frontend | `data-validation.component.ts` | `openAgentDeepLink()` |
| 5 | Agent | `services/token.service.js` | `validateToken()` |
| 5 | Agent | `services/deeplink.service.js` | `parseDeepLink()` |
| 6 | Agent | `index.js` | `handleDeepLink()` (line 529) |
| 7 | Backend | `DirectoryScanController.php` | `receiveProgress()` (line 119) |
| 8 | Frontend | `data-validation.component.ts` | `startPolling()` (2s interval) |
| 9 | Agent | `modules/directory-scanner/scanner.service.js` | `scan()` |
| 10 | Agent | `modules/directory-scanner/index.js` | `uploadInChunks()` |
| 10 | Backend | `DirectoryScanController.php` | `receiveResults()` (line 354) |
| 11 | Frontend | `data-validation.component.ts` | iframe with HTML viewer |
| 12 | Frontend | `data-validation.component.ts` | notification view |

### Frontend: What the User Sees

```
Job Detail Page → "Job Actions" menu → "Data Validation"
  ↓
Data Validation tab opens:
  ┌──────────────────────────────────────┐
  │  Start Data Validation               │
  │  [Start Scan] button                 │
  └──────────────────────────────────────┘
  ↓ (click Start Scan)
  ┌──────────────────────────────────────┐
  │  Waiting for Agent...                │
  │  ⟳ Checking if agent is running     │
  │                                      │
  │  (checks localhost:19876/health)     │
  │                                      │
  │  If agent not found after 5s:        │
  │  ┌────────────────────────────────┐  │
  │  │ Agent Not Responding           │  │
  │  │ • Copy Deep Link              │  │
  │  │ • Download Agent              │  │
  │  │ • Retry                       │  │
  │  │                               │  │
  │  │ Troubleshooting steps:        │  │
  │  │ (platform-specific)           │  │
  │  └────────────────────────────────┘  │
  └──────────────────────────────────────┘
  ↓ (agent responds)
  ┌──────────────────────────────────────┐
  │  Agent Connected ✓                   │
  │  Scanning: /Users/data/recovered/    │
  │  Files: 12,456 | Folders: 890       │
  │  ████████████░░░░░░░░ 65%           │
  └──────────────────────────────────────┘
  ↓ (scan complete)
  ┌──────────────────────────────────────┐
  │  Scan Complete ✓                     │
  │  ┌────────────────────────────────┐  │
  │  │ [DevExtreme File Manager]     │  │
  │  │  📁 recovered-data/           │  │
  │  │    📁 Documents/              │  │
  │  │    📁 Photos/                 │  │
  │  │    📄 important.docx          │  │
  │  └────────────────────────────────┘  │
  │                                      │
  │  [Send to Customer] [Download HTML]  │
  └──────────────────────────────────────┘
```

### Scan Status Flow

```
pending → agent_connected → scanning → uploading → processing → completed
                  └─ paused → scanning (resume)
                  └─ cancelled
                  └─ failed
```

Frontend polls backend every **2 seconds** and stops when status leaves the active set.

### Backend Routes (What's Actually Registered)

**Agent callback routes** (`routes/tenant.php:1045-1049`):
```
POST /agent/directory-scans/results           → receiveResults()
POST /agent/directory-scans/{jobId}/progress  → receiveProgress()
```
- No auth required (MVP) — uses `X-Tenant` header for tenant identification
- Progress stored in Redis (2hr TTL)
- Results chunked in Redis, merged to S3 on final chunk

**Authenticated routes** (`routes/tenant.php:917-934`):
```
POST   /api/jobs/{jobId}/directory-scans/initiate     → initiateDirectory()
GET    /api/jobs/{jobId}/directory-scans               → index()
GET    /api/directory-scans/job/{jobId}/progress       → getProgress()
GET    /api/directory-scans/{id}                       → show()
GET    /api/directory-scans/{id}/view-html             → viewHtml()
GET    /api/directory-scans/{id}/download-html         → downloadHtml()
POST   /api/directory-scans/{id}/pause                 → pause()
POST   /api/directory-scans/{id}/resume                → resume()
POST   /api/directory-scans/{id}/cancel                → cancel()
POST   /api/directory-scans/{id}/generate-verification-link
POST   /api/directory-scans/{id}/send-notification
GET    /api/directory-scans/{id}/timeline
GET    /api/directory-scans/{id}/validation-pdf
POST   /api/directory-scans/{id}/resend-confirmation
DELETE /api/directory-scans/{id}
```

**Public route** (no auth):
```
GET    /api/directory-scans/{id}/data                  → publicData()
```

---

## Token & Security Details

### How Tokens are Generated (Backend)

**File:** `app/Services/TokenGeneratorService.php`

```php
// Config values from .env:
AGENT_API_KEY=your-shared-api-key
AGENT_TOKEN_SECRET=your-hmac-secret
AGENT_TOKEN_EXPIRY_MINUTES=10

// Config file: config/agent.php
// Also has: AGENT_BACKEND_URL, AGENT_CHUNK_CACHE_TTL
```

**Token format:** `Base64URL(payload).Base64URL(HMAC-SHA256(payload, secret))`

**Payload for scan deep link:**
```json
{
  "api_key": "AGENT_API_KEY from .env",
  "timestamp": 1710576000000,
  "nonce": "uuid-v4",
  "metadata": {
    "shop_id": "tenant-id",
    "job_id": 123,
    "scan_id": 456,
    "user_id": 1,
    "action": "scan-directory",
    "cloud_url": "https://techfix.api.bytephase.com",
    "frontend_url": "https://techfix.bytephase.com",
    "job_number": "JOB-1234",
    "customer_name": "John Doe",
    "shop_name": "TechFix Solutions"
  }
}
```

### How Tokens are Validated (Agent)

**File:** `services/token.service.js`

1. Split by `.` → payload + signature
2. Base64URL decode payload
3. Recompute HMAC-SHA256 and compare with signature
4. Check `timestamp` is within 10 minutes
5. Check `nonce` not already used (stored in electron-store)
6. Mark nonce as used (prevent replay)

### API Key — Current State

```
┌─────────────────────────────────────────────────┐
│ CURRENT: Single shared key per environment       │
│                                                   │
│ Backend .env:                                     │
│   AGENT_API_KEY=some-key          ← for tokens   │
│   AGENT_TOKEN_SECRET=some-secret  ← for HMAC     │
│                                                   │
│ Agent sends: X-Agent-API-Key header               │
│ Backend receives: but does NOT validate it (MVP)  │
│                                                   │
│ No per-shop keys. No agents table.                │
│ No API key management UI in CRM.                  │
└─────────────────────────────────────────────────┘
```

---

## Bug Fixed: Notification URL Mismatch

**Was present since January. Fixed on 2026-03-16.**

The "agent_connected" notification was hitting the wrong URL (missing `/agent/` in path) and missing the `X-Tenant` header required by the backend middleware.

**Fixes applied:**
1. `index.js:1249` — URL changed from `/api/directory-scans/...` to `/api/agent/directory-scans/...`
2. `index.js:1265` — Added `X-Tenant` header with shopId
3. `ui/directory-scan.html:635` — Now passes `shopId` to the IPC handler

---

## Quick Setup & Advanced Setup — Why They Don't Work Yet

### Quick Setup needs this backend endpoint:

```
POST /api/agent/verify-key

Request:
{
  "api_key": "user-pasted-key",
  "device_id": "machine-hardware-id",
  "device_name": "Vishwa-MacBook",
  "agent_version": "2.0.0",
  "platform": "darwin"
}

Expected Response:
{
  "agent_id": "ag_xxxxx",
  "shop_id": "shop_xxxxx",
  "modules": {
    "tally": { "enabled": true, "config": {} },
    "directory-scanner": { "enabled": true, "config": {} }
  }
}
```

### Advanced Setup needs:

- Same verify-key endpoint (for proper validation), OR
- Poll endpoint: `POST /api/agent/poll` (for lazy validation on first poll)

### What's needed to build these:

1. **`agents` database table** — store registered agents with per-shop API keys
2. **`POST /api/agent/verify-key`** — validate key, create/update agent record, return config
3. **`POST /api/agent/poll`** — return pending jobs for this agent
4. **`POST /api/agent/result`** — receive job completion reports
5. **CRM UI** — "Agent API Key" section in shop settings where owner can see/regenerate their key

---

## Agent Health Check (Frontend Detection)

The CRM frontend detects if the agent is running locally:

```
Frontend: fetch('http://127.0.0.1:19876/health', { timeout: 3000 })
  ↓
Agent health server responds:
{
  "status": "ok",
  "agent": "bytephase-agent",
  "version": "2.0.0",
  "registered": true/false,
  "polling": true/false
}
```

- Checked after 5-second delay (gives agent time to launch from deep link)
- If no response → shows "Agent Not Responding" with troubleshooting + download links
- Agent download links point to S3 bucket: `bytephase-agent-public.s3.ap-south-1.amazonaws.com`

---

## Summary: What's Connected

```
FULLY WORKING (PRODUCTION):
  ┌─────────┐    deep link     ┌─────────┐    upload chunks    ┌─────────┐
  │FRONTEND │ ──────────────── │  AGENT  │ ──────────────────── │ BACKEND │
  │(Angular)│ polls progress   │(Electron)│  progress updates   │(Laravel)│
  │         │ ◄────────────── │         │ ────────────────────► │         │
  └─────────┘                  └─────────┘                      └─────────┘
  Only for: Directory Scan via bytephase://scan-directory deep link

NOT YET CONNECTED:
  Quick Setup         → needs POST /api/agent/verify-key
  Advanced Setup      → needs POST /api/agent/poll
  Deep Link Connect   → needs POST /api/agent/verify-key
  Tally Sync Upload   → needs POST /api/partner/inventory/sync
  Partner Connect     → needs partner.bytephase.com (not built)
  Job Polling         → needs POST /api/agent/poll
  Job Results         → needs POST /api/agent/result
```
