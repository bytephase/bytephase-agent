# API Endpoints & File Structure Explained

---

## 📡 Part 1: APIs the Agent Calls

The agent talks to your Laravel server through these APIs:

### **API 1: Poll for Jobs** ⭐ MOST IMPORTANT

**Endpoint:** `POST /api/agent/poll`

**When:** Every 30 seconds (automatically)

**What Agent Sends:**
```javascript
POST http://your-laravel-server.com/api/agent/poll
Headers:
  Authorization: Bearer YOUR_API_KEY
  Content-Type: application/json

Body:
{
  "agent_id": "agent_mumbai_shop1",
  "shop_id": "shop_001",
  "status": "idle",
  "tally_version": "Prime",
  "tally_company": "ABC Corporation",
  "agent_version": "1.0.0",
  "queue_stats": {
    "pending": 0,
    "synced": 5,
    "failed": 0,
    "unreported": 0
  }
}
```

**What Laravel Should Respond:**
```javascript
Response (200 OK):
{
  "jobs": [
    {
      "id": "job_12345",
      "type": "voucher.create",
      "payload": {
        "type": "Sales",
        "date": "2026-01-02",
        "voucherNumber": "INV-001",
        "party": "Customer Name",
        "ledgers": [
          { "name": "Customer Name", "amount": -1000 },
          { "name": "Sales Account", "amount": 1000 }
        ]
      }
    }
  ],
  "poll_interval": 30  // Optional: tell agent how often to poll
}
```

**Where in Code:**
```javascript
File: services/polling.service.js
Line: ~55

const response = await axios.post(
  `${cloudUrl}/api/agent/poll`,
  pollData,
  { headers: authService.getAuthHeader() }
);
```

---

### **API 2: Report Job Result**

**Endpoint:** `POST /api/agent/result`

**When:** After completing each job

**What Agent Sends:**
```javascript
POST http://your-laravel-server.com/api/agent/result
Headers:
  Authorization: Bearer YOUR_API_KEY
  Content-Type: application/json

Body:
{
  "agent_id": "agent_mumbai_shop1",
  "job_id": "job_12345",
  "status": "completed",  // or "failed"
  "result": {
    "success": true,
    "data": {
      "created": true,
      "masterId": "67890",
      "voucherId": "12345"
    }
  },
  "error": null,
  "error_type": null,
  "completed_at": "2026-01-02T10:30:00Z"
}
```

**If Job Failed:**
```javascript
{
  "agent_id": "agent_mumbai_shop1",
  "job_id": "job_12345",
  "status": "failed",
  "result": null,
  "error": "Tally is not running",
  "error_type": "tally_unavailable",
  "completed_at": "2026-01-02T10:30:00Z"
}
```

**Where in Code:**
```javascript
File: services/polling.service.js
Line: ~140

await axios.post(
  `${cloudUrl}/api/agent/result`,
  {
    agent_id: agentInfo.agentId,
    job_id: jobId,
    status: result.success ? 'completed' : 'failed',
    result: result.data,
    error: result.error
  }
);
```

---

### **API 3: Heartbeat (Optional)**

**Endpoint:** `POST /api/agent/heartbeat`

**When:** Every 5 minutes (to show agent is alive)

**What Agent Sends:**
```javascript
POST http://your-laravel-server.com/api/agent/heartbeat
Headers:
  Authorization: Bearer YOUR_API_KEY

Body:
{
  "agent_id": "agent_mumbai_shop1",
  "status": "online",
  "timestamp": "2026-01-02T10:30:00Z"
}
```

**Where:** Not implemented yet (you can add later)

---

### **API 4: Register Agent (Optional)**

**Endpoint:** `POST /api/agent/register`

**When:** First time setup

**What Agent Sends:**
```javascript
POST http://your-laravel-server.com/api/agent/register
Headers:
  Authorization: Bearer YOUR_API_KEY

Body:
{
  "agent_id": "agent_mumbai_shop1",
  "shop_id": "shop_001",
  "machine_id": "unique-machine-id-12345",
  "tally_version": "Prime",
  "tally_company": "ABC Corporation"
}
```

**Where:** Not implemented yet (you can add later)

---

## 📁 Part 2: All Files Explained

Let me explain EVERY file in the project:

### **🗂️ Root Files**

#### **1. index.js** - Main Application File
```javascript
What it does:
  ✓ Starts the Electron app
  ✓ Creates system tray icon
  ✓ Initializes all services
  ✓ Handles Settings window
  ✓ Manages app lifecycle (start/stop/quit)

Key functions:
  - createTray() → Creates system tray icon
  - updateTrayMenu() → Updates tray menu with status
  - openSettings() → Opens Settings window
  - togglePolling() → Start/stop polling
  - IPC handlers → Communication with UI

When it runs:
  Every time you run: npm start
```

#### **2. package.json** - Project Configuration
```javascript
What it does:
  ✓ Lists all dependencies (libraries)
  ✓ Defines scripts (npm start, npm build)
  ✓ App metadata (name, version, author)
  ✓ Build configuration for installers

Important parts:
  - dependencies: Libraries the app needs
  - devDependencies: Development tools
  - scripts: Commands you can run
  - build: How to create installers
```

#### **3. .gitignore** - Git Ignore File
```javascript
What it does:
  ✓ Tells Git which files NOT to upload
  ✓ Excludes node_modules, logs, databases

Why:
  Don't want to upload 500MB of dependencies!
```

---

### **📁 config/** - Configuration Files

#### **config/default.json** - App Settings
```javascript
What it contains:
{
  "cloudUrl": "http://localhost:8000",  // Laravel server
  "tallyPort": 9000,                    // Tally port
  "pollInterval": 30000,                // Poll every 30s
  "maxRetries": 3,                      // Retry failed jobs
  "requestTimeout": 10000               // 10s timeout
}

Purpose:
  - Default configuration values
  - Can be changed without editing code
  - Different for dev/production

Used by:
  All services load this file to get settings
```

#### **config/tally-versions.json** - Tally Version Info
```javascript
What it contains:
{
  "ERP9": { port: 9000, xml_version: "5.5", ... },
  "Prime": { port: 9000, xml_version: "7.0", ... },
  "PrimeServer": { ... }
}

Purpose:
  - Different Tally versions need different XML
  - Agent detects version and uses correct settings

Used by:
  services/tally.service.js
```

---

### **📁 services/** - Core Business Logic

#### **services/auth.service.js** - Authentication
```javascript
What it does:
  ✓ Stores API key securely (encrypted)
  ✓ Stores agent_id, shop_id
  ✓ Provides credentials to other services
  ✓ Checks if agent is registered

Key methods:
  - setCredentials(credentials) → Save API key
  - getApiKey() → Get saved API key
  - getAgentId() → Get agent ID
  - isRegistered() → Check if configured
  - getAuthHeader() → Get Authorization header

Used by:
  - polling.service.js (to authenticate API calls)
  - index.js (to check registration status)

Storage location:
  ~/Library/Application Support/bytephase-tally-agent/config.json
  (Encrypted with electron-store)
```

#### **services/polling.service.js** - Cloud Communication ⭐
```javascript
What it does:
  ✓ Polls Laravel API every 30 seconds
  ✓ Gets jobs from cloud
  ✓ Executes jobs via Tally service
  ✓ Reports results back
  ✓ Handles errors and retries
  ✓ Exponential backoff on failures

Key methods:
  - start() → Begin polling
  - stop() → Stop polling
  - poll() → Main polling loop (every 30s)
  - processJobs(jobs) → Execute received jobs
  - reportResult(jobId, result) → Send result to cloud
  - syncUnreportedJobs() → Sync offline jobs

Flow:
  1. start() is called when agent configured
  2. poll() runs every 30s automatically
  3. Gets jobs from Laravel
  4. Calls tally.service to execute
  5. Reports results back
  6. Schedules next poll

Used by:
  - index.js (starts/stops it)

APIs it calls:
  - POST /api/agent/poll
  - POST /api/agent/result
```

#### **services/tally.service.js** - Tally Communication
```javascript
What it does:
  ✓ Checks if Tally is running
  ✓ Detects Tally version
  ✓ Gets company name
  ✓ Sends XML requests to Tally
  ✓ Parses Tally responses
  ✓ Executes different job types

Key methods:
  - isRunning() → Check Tally on port 9000
  - getVersion() → Detect ERP9/Prime/PrimeServer
  - getCompanyName() → Get current company
  - executeJob(job) → Main job executor
  - createVoucher(data) → Create invoice
  - createLedger(data) → Create ledger
  - sendRequest(xml) → Send XML to Tally

Job types it handles:
  - voucher.create → Create sales/purchase voucher
  - ledger.create → Create ledger account
  - stock.create → Create stock item
  - report.generate → Generate reports

Used by:
  - polling.service.js (to execute jobs)
  - index.js (to check Tally status)

Talks to:
  - Tally on http://localhost:9000
```

#### **services/queue.service.js** - Offline Queue
```javascript
What it does:
  ✓ Stores jobs when offline (SQLite database)
  ✓ Tracks completed jobs
  ✓ Prevents duplicate execution
  ✓ Syncs when back online

Key methods:
  - init() → Create SQLite database
  - enqueue(job) → Add job to queue
  - getPendingJobs() → Get unprocessed jobs
  - saveCompletedJob(jobId, result) → Save result
  - isJobProcessed(jobId) → Check if done
  - getStats() → Get queue statistics
  - cleanup() → Remove old jobs (7 days)

Database tables:
  1. offline_queue → Jobs waiting to process
  2. completed_jobs → Jobs done but not reported

Used by:
  - polling.service.js (to track jobs)
  - index.js (to show queue stats)

Database location:
  ~/Library/Application Support/bytephase-tally-agent/offline-queue.db
```

#### **services/tallyClient.js** - Legacy File
```javascript
What it does:
  ✓ Simple Tally connectivity check
  ✓ Old version, kept for reference

Status:
  Not used anymore (tally.service.js is better)
  Can be deleted if you want
```

---

### **📁 tally/** - Tally XML Handling

#### **tally/xml-builder.js** - Build Tally XML ⭐
```javascript
What it does:
  ✓ Converts JSON data → Tally XML format
  ✓ Builds vouchers, ledgers, stock items
  ✓ Escapes special characters
  ✓ Formats dates for Tally

Key methods:
  - buildVoucher(data) → Create voucher XML
  - buildLedger(data) → Create ledger XML
  - buildStockItem(data) → Create stock XML
  - buildReadLedgers() → Read ledgers XML
  - buildReport(type, from, to) → Report XML
  - formatDate(date) → Convert to YYYYMMDD
  - escapeXml(string) → Escape special chars

Example:
  Input (JSON):
  {
    type: "Sales",
    date: "2026-01-02",
    party: "Customer ABC",
    amount: 1000
  }

  Output (XML):
  <ENVELOPE>
    <HEADER>
      <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
      <VOUCHER VCHTYPE="Sales">
        <DATE>20260102</DATE>
        <PARTYLEDGERNAME>Customer ABC</PARTYLEDGERNAME>
        ...
      </VOUCHER>
    </BODY>
  </ENVELOPE>

Used by:
  - tally.service.js (to build requests)
```

#### **tally/xml-parser.js** - Parse Tally Responses
```javascript
What it does:
  ✓ Converts Tally XML → JSON
  ✓ Extracts success/error info
  ✓ Parses voucher IDs
  ✓ Handles errors

Key methods:
  - parse(xmlString) → Parse any XML
  - parseVoucherResponse(xml) → Parse voucher result
  - parseLedgerResponse(xml) → Parse ledger result
  - parseLedgersList(xml) → Parse ledger list
  - hasErrors(xml) → Check for errors
  - extractErrors(xml) → Get error messages

Example:
  Input (XML from Tally):
  <ENVELOPE>
    <BODY>
      <IMPORTRESULT>
        <CREATED>1</CREATED>
        <LASTMID>12345</LASTMID>
      </IMPORTRESULT>
    </BODY>
  </ENVELOPE>

  Output (JSON):
  {
    success: true,
    created: true,
    masterId: "12345"
  }

Used by:
  - tally.service.js (to parse responses)
```

---

### **📁 ui/** - User Interface Files

#### **ui/settings.html** - Settings Window
```javascript
What it does:
  ✓ Displays configuration form
  ✓ Shows agent status
  ✓ 3 tabs: Setup, Status, Logs

Structure:
  - Header with title
  - Tab buttons (Setup/Status/Logs)
  - Setup tab: Form with 4 fields
  - Status tab: Real-time stats
  - Logs tab: Activity log (future)

Opened by:
  - Clicking "Settings" in tray menu
```

#### **ui/styles.css** - Styling
```javascript
What it does:
  ✓ Makes UI beautiful
  ✓ Purple gradient header
  ✓ Modern forms and buttons
  ✓ Responsive layout

Features:
  - Gradient header (purple)
  - Card-based layout
  - Hover effects on buttons
  - Status indicators (green/red)
```

#### **ui/renderer.js** - UI Logic
```javascript
What it does:
  ✓ Handles form submissions
  ✓ Talks to main process (IPC)
  ✓ Updates status display
  ✓ Tab switching

Key functions:
  - loadAgentInfo() → Load saved credentials
  - setupFormHandlers() → Handle form submit
  - testTallyConnection() → Test Tally button
  - clearConfiguration() → Clear credentials
  - refreshStatus() → Update status tab
  - updateStatusDisplay() → Show stats

IPC calls it makes:
  - ipcRenderer.invoke('get-agent-info')
  - ipcRenderer.invoke('save-credentials')
  - ipcRenderer.invoke('test-tally-connection')
  - ipcRenderer.invoke('clear-credentials')
```

---

### **📁 docs/** - Documentation

#### **docs/ARCHITECTURE.md** - Complete Architecture
```javascript
What it contains:
  ✓ Full system design (15,000+ words)
  ✓ Architecture decisions
  ✓ Communication patterns
  ✓ Edge cases
  ✓ Scalability strategy
  ✓ Database schemas
  ✓ API specifications

For who:
  Developers building the Laravel service
```

---

### **📄 Documentation Files (Root)**

#### **README.md** - Project Overview
```javascript
Quick introduction to the project
```

#### **QUICK-START.md** - 5-Minute Setup
```javascript
Step-by-step guide for users
```

#### **ELECTRON-AGENT.md** - Technical Docs
```javascript
Complete agent documentation
Installation, usage, troubleshooting
```

#### **TEST-GUI.md** - Testing Guide
```javascript
10 tests to verify the agent works
```

#### **CLI-TEST-REPORT.md** - Test Results
```javascript
Results of our CLI tests
```

#### **FIXES-APPLIED.md** - Bug Fixes
```javascript
Documentation of SQLite fix we did
```

#### **STARTUP-SUCCESS.md** - Success Report
```javascript
Report of successful agent startup
```

#### **EXPLAIN-SIMPLE.md** - Simple Explanation
```javascript
Everything explained simply (this doc)
```

#### **API-AND-FILES-EXPLAINED.md** - This File!
```javascript
API endpoints and file explanations
```

---

## 🔄 How Files Work Together

### **Startup Flow:**

```
1. npm start
   ↓
2. index.js runs
   ↓
3. app.whenReady() fires
   ↓
4. Loads services:
   - queue.service.js → Init database
   - auth.service.js → Load credentials
   - tally.service.js → Ready to talk to Tally
   - polling.service.js → Ready to poll
   ↓
5. Creates system tray (createTray)
   ↓
6. If registered → Start polling
   ↓
7. Agent runs in background
```

### **Polling Flow:**

```
1. polling.service.js starts
   ↓
2. Every 30 seconds:
   - Calls auth.service → Get API key
   - Calls tally.service → Get Tally status
   - Calls queue.service → Get queue stats
   ↓
3. Makes API call:
   POST /api/agent/poll
   ↓
4. Gets jobs from Laravel
   ↓
5. For each job:
   - Calls tally.service.executeJob()
   - tally.service uses xml-builder
   - Sends XML to Tally
   - Gets response
   - Uses xml-parser to parse it
   - Saves result in queue.service
   ↓
6. Reports result:
   POST /api/agent/result
   ↓
7. Waits 30s, repeats
```

### **Settings UI Flow:**

```
1. User clicks tray → Settings
   ↓
2. index.js opens settings.html
   ↓
3. renderer.js loads
   ↓
4. renderer.js calls IPC:
   ipcRenderer.invoke('get-agent-info')
   ↓
5. index.js handles IPC:
   Returns data from auth.service
   ↓
6. renderer.js displays form
   ↓
7. User fills form, clicks Save
   ↓
8. renderer.js sends IPC:
   ipcRenderer.invoke('save-credentials')
   ↓
9. index.js saves via auth.service
   ↓
10. index.js starts polling.service
   ↓
11. Agent begins working!
```

---

## 📊 File Dependency Map

```
index.js
├─ Uses: auth.service.js
├─ Uses: tally.service.js
├─ Uses: polling.service.js
├─ Uses: queue.service.js
└─ Loads: ui/settings.html

polling.service.js
├─ Uses: auth.service.js
├─ Uses: tally.service.js
├─ Uses: queue.service.js
└─ Calls: Laravel API

tally.service.js
├─ Uses: tally/xml-builder.js
├─ Uses: tally/xml-parser.js
├─ Uses: config/tally-versions.json
└─ Talks to: Tally (localhost:9000)

ui/settings.html
├─ Uses: ui/styles.css
└─ Uses: ui/renderer.js

ui/renderer.js
└─ Talks to: index.js (via IPC)
```

---

## 🎯 Summary

### **APIs Agent Calls:**
1. **`POST /api/agent/poll`** → Get jobs (every 30s)
2. **`POST /api/agent/result`** → Report results

### **Most Important Files:**
1. **index.js** → Main application
2. **polling.service.js** → Cloud communication
3. **tally.service.js** → Tally communication
4. **xml-builder.js** → Build Tally XML
5. **xml-parser.js** → Parse Tally responses

### **Data Flow:**
```
Laravel API
    ↓ (polling.service.js)
Agent receives job
    ↓ (tally.service.js)
Builds XML (xml-builder.js)
    ↓
Sends to Tally
    ↓
Gets response
    ↓ (xml-parser.js)
Parses result
    ↓ (polling.service.js)
Reports back to Laravel
```

---

**Now you know:**
- ✅ Which APIs the agent calls
- ✅ What each file does
- ✅ How they work together

**Questions?**
- "How does polling.service work exactly?"
- "How to add a new job type?"
- "How to debug API calls?"

Just ask! 😊
