# Tally Integration System - Architecture Documentation

**Version:** 1.0
**Last Updated:** 2026-01-02
**Status:** Design Phase

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Decisions](#architecture-decisions)
3. [System Architecture](#system-architecture)
4. [Communication Patterns](#communication-patterns)
5. [Component Details](#component-details)
6. [Edge Cases & Error Handling](#edge-cases--error-handling)
7. [Scalability Strategy](#scalability-strategy)
8. [Security Considerations](#security-considerations)
9. [Deployment Architecture](#deployment-architecture)
10. [Data Flow Examples](#data-flow-examples)

---

## System Overview

### Problem Statement

**Challenge:** Bytephase Repair Shop (cloud application) needs to integrate with Tally software, but:
- Tally runs on local desktop computers (no internet access)
- Tally is behind firewalls/NAT (no public IP)
- Cloud applications cannot directly connect to local Tally installations
- Need to support 1000+ shop locations simultaneously
- Need to support all Tally versions (ERP 9, Prime, Prime Server)
- Need to support all operations (Vouchers, Ledgers, Stock Items, Reports)

### Solution

A three-tier architecture with a desktop agent acting as a bridge:

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1: Business Applications (Cloud)                          │
│  - Bytephase Repair Shop                                        │
│  - Any other business application                               │
└────────────────────┬────────────────────────────────────────────┘
                     │ REST API (JSON)
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│  TIER 2: Laravel Tally Connect Service (Cloud)                  │
│  - REST API endpoints                                           │
│  - JSON ↔ XML conversion                                        │
│  - Agent management & job queuing                               │
│  - Redis queue for scalability                                  │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTP Polling (30s interval)
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│  TIER 3: Electron Desktop Agent (Local - 1000+ instances)       │
│  - Polls cloud service for jobs                                 │
│  - Executes Tally operations via XML API                        │
│  - Offline queue support                                        │
│  - Auto-update capability                                       │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTP (localhost:9000)
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│  TIER 4: Tally Software (Local)                                 │
│  - Tally ERP 9 / Prime / Prime Server                           │
│  - XML API on port 9000                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture Decisions

### Decision 1: Laravel Tally Connect - Standalone Service vs Composer Package

**Decision:** ✅ **Standalone HTTP Service (Microservice)**

**Reasoning:**

| Aspect | Standalone Service | Composer Package |
|--------|-------------------|------------------|
| Reusability | ✅ Any app can consume via HTTP | ❌ Only PHP/Laravel apps |
| Updates | ✅ Update once, all apps benefit | ❌ Must redeploy all apps |
| Scaling | ✅ Scale independently | ❌ Scales with each app |
| Maintenance | ✅ Single codebase | ❌ Multiple instances |
| Security | ✅ Centralized credential management | ❌ Credentials in each app |
| Cost | ✅ One server for all apps | ❌ Logic duplicated in each app |

**Verdict:** Standalone service is better for multi-application usage and easier maintenance.

---

### Decision 2: Communication Method - WebSocket vs HTTP Polling

**Decision:** ✅ **HTTP Polling (30-60s interval)**

**Analysis:**

| Method | Pros | Cons | Cost | Scale |
|--------|------|------|------|-------|
| **WebSocket (Reverb)** | Real-time, bidirectional | Complex infrastructure, connection limits | Free (self-hosted) | 100-500 agents per server |
| **HTTP Polling** | Simple, stateless, firewall-friendly | 30-60s delay | Free | Unlimited (horizontal scaling) |
| **Server-Sent Events** | Simple, one-way push | Limited browser/client support | Free | 100-500 agents |
| **Long Polling** | Better than polling | More complex, connection limits | Free | 500-1000 agents |

**For 1000+ agents:**
- WebSocket requires sticky sessions, load balancer complexity
- HTTP polling is stateless → easier load balancing
- 30-60s delay is acceptable for most Tally operations

**Verdict:** HTTP Polling with 30s interval for scalability and simplicity.

---

### Decision 3: Real-time vs Batch Operations

**Decision:** ✅ **Hybrid Approach (Configurable per customer)**

```javascript
// Small shops (< 50 agents)
pollInterval: 10 seconds  // Near real-time

// Medium shops (50-200 agents)
pollInterval: 30 seconds  // Balanced

// Large enterprises (200+ agents)
pollInterval: 60 seconds  // Batch mode
```

**Flexibility:** Customers choose based on their needs:
- Real-time critical → 10s polling
- Normal operations → 30s polling (recommended)
- Batch reports → 60s or scheduled sync

---

### Decision 4: Offline Queue Strategy

**Decision:** ✅ **Bidirectional Offline Queue with Configurable Limits**

**Queue Locations:**
1. **Cloud Queue (Redis):** Jobs waiting for agent to pick up
2. **Agent Queue (SQLite):** Data waiting to send to cloud when online

**Queue Retention:**
- Cloud queue: 24-48 hours (configurable)
- Agent queue: Until successful sync (with max size limit)
- Failed jobs: Retry 3 times, then move to dead letter queue

---

## System Architecture

### High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLOUD INFRASTRUCTURE                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  Business Applications (Multiple)                          │     │
│  │  ┌──────────────────┐  ┌──────────────────┐               │     │
│  │  │ Bytephase Repair │  │  Future App #2   │               │     │
│  │  │      Shop        │  │                  │               │     │
│  │  └────────┬─────────┘  └────────┬─────────┘               │     │
│  │           │                     │                          │     │
│  └───────────┼─────────────────────┼──────────────────────────┘     │
│              │                     │                                 │
│              └──────────┬──────────┘                                 │
│                         │ REST API (JSON)                            │
│                         ↓                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │         Laravel Tally Connect Service                        │   │
│  │  ┌──────────────┐  ┌───────────┐  ┌────────────────────┐   │   │
│  │  │  REST API    │  │   Queue   │  │  Agent Manager     │   │   │
│  │  │  Controller  │→→│  Workers  │←→│  (Health tracking) │   │   │
│  │  └──────────────┘  └─────┬─────┘  └────────────────────┘   │   │
│  │                          │                                   │   │
│  │  ┌──────────────┐        ↓         ┌────────────────────┐  │   │
│  │  │ XML Converter│   ┌─────────┐    │   Agent Registry   │  │   │
│  │  │ (JSON ↔ XML) │   │  Redis  │    │    (Database)      │  │   │
│  │  └──────────────┘   └─────────┘    └────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                         ↕                                           │
│                    HTTP Polling                                     │
│                (Every 30 seconds)                                   │
└──────────────────────────────────────────────────────────────────────┘
                          ↕
┌──────────────────────────────────────────────────────────────────────┐
│                     LOCAL DESKTOP (1000+ Locations)                  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Shop #1                     Shop #2                    Shop #N      │
│  ┌──────────────────┐       ┌──────────────────┐      ┌─────────┐  │
│  │ Electron Agent   │       │ Electron Agent   │      │   ...   │  │
│  │ ┌──────────────┐ │       │ ┌──────────────┐ │      └─────────┘  │
│  │ │ Polling Svc  │ │       │ │ Polling Svc  │ │                    │
│  │ │ (Every 30s)  │ │       │ │ (Every 30s)  │ │                    │
│  │ └──────┬───────┘ │       │ └──────┬───────┘ │                    │
│  │        │         │       │        │         │                    │
│  │ ┌──────▼───────┐ │       │ ┌──────▼───────┐ │                    │
│  │ │ Tally Service│ │       │ │ Tally Service│ │                    │
│  │ │ (XML Builder)│ │       │ │ (XML Builder)│ │                    │
│  │ └──────┬───────┘ │       │ └──────┬───────┘ │                    │
│  │        │         │       │        │         │                    │
│  │ ┌──────▼───────┐ │       │ ┌──────▼───────┐ │                    │
│  │ │ Offline Queue│ │       │ │ Offline Queue│ │                    │
│  │ │   (SQLite)   │ │       │ │   (SQLite)   │ │                    │
│  │ └──────────────┘ │       │ └──────────────┘ │                    │
│  └────────┬─────────┘       └────────┬─────────┘                    │
│           │                          │                               │
│           │ HTTP (localhost:9000)    │                               │
│           ↓                          ↓                               │
│  ┌──────────────────┐       ┌──────────────────┐                    │
│  │  Tally ERP 9     │       │  Tally Prime     │                    │
│  │  (XML API)       │       │  (XML API)       │                    │
│  └──────────────────┘       └──────────────────┘                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Communication Patterns

### Pattern 1: Cloud to Tally (Push from Cloud)

**Use Case:** User creates invoice in Bytephase app → sync to Tally

```
┌─────────────┐         ┌─────────────┐         ┌─────────┐         ┌───────┐
│  Bytephase  │         │   Laravel   │         │  Agent  │         │ Tally │
│  (Cloud)    │         │   Tally     │         │ (Local) │         │(Local)│
└──────┬──────┘         └──────┬──────┘         └────┬────┘         └───┬───┘
       │                       │                     │                  │
       │ POST /api/vouchers    │                     │                  │
       │ (JSON invoice data)   │                     │                  │
       ├──────────────────────>│                     │                  │
       │                       │                     │                  │
       │ 200 OK                │                     │                  │
       │ {job_id: "abc123"}    │                     │                  │
       │<──────────────────────┤                     │                  │
       │                       │                     │                  │
       │                       │ [Stores in Redis]   │                  │
       │                       │ agent:123:jobs      │                  │
       │                       │ [{id: abc123, ...}] │                  │
       │                       │                     │                  │
       │                       │                     │ [30s later]      │
       │                       │                     │ POST /agent/poll │
       │                       │                     ├─────────────────>│
       │                       │                     │                  │
       │                       │ 200 OK              │                  │
       │                       │ {jobs: [{...}]}     │                  │
       │                       │<────────────────────┤                  │
       │                       │                     │                  │
       │                       │                     │ [Convert to XML] │
       │                       │                     │                  │
       │                       │                     │ POST Tally XML   │
       │                       │                     ├─────────────────>│
       │                       │                     │                  │
       │                       │                     │ XML Response     │
       │                       │                     │<─────────────────┤
       │                       │                     │                  │
       │                       │ POST /agent/result  │                  │
       │                       │<────────────────────┤                  │
       │                       │                     │                  │
       │ [Webhook/Polling]     │                     │                  │
       │ GET /api/jobs/abc123  │                     │                  │
       ├──────────────────────>│                     │                  │
       │                       │                     │                  │
       │ 200 OK                │                     │                  │
       │ {status: "completed"} │                     │                  │
       │<──────────────────────┤                     │                  │
       │                       │                     │                  │
```

**Timeline:**
- T+0s: User creates invoice in cloud
- T+0s: Laravel queues job for agent
- T+30s: Agent polls, receives job
- T+35s: Agent executes on Tally
- T+36s: Agent reports result to cloud
- **Total delay: ~36 seconds**

---

### Pattern 2: Tally to Cloud (Pull from Tally)

**Use Case:** Sync existing Tally data to cloud (initial import, periodic sync)

```
┌─────────────┐         ┌─────────────┐         ┌─────────┐         ┌───────┐
│  Bytephase  │         │   Laravel   │         │  Agent  │         │ Tally │
│  (Cloud)    │         │   Tally     │         │ (Local) │         │(Local)│
└──────┬──────┘         └──────┬──────┘         └────┬────┘         └───┬───┘
       │                       │                     │                  │
       │ POST /api/sync-ledgers│                     │                  │
       │ {shop_id: "123"}      │                     │                  │
       ├──────────────────────>│                     │                  │
       │                       │                     │                  │
       │                       │ [Creates job]       │                  │
       │                       │                     │                  │
       │                       │                     │ [Polls]          │
       │                       │<────────────────────┤                  │
       │                       │                     │                  │
       │                       │ Job: "fetch ledgers"│                  │
       │                       │────────────────────>│                  │
       │                       │                     │                  │
       │                       │                     │ GET Ledgers XML  │
       │                       │                     ├─────────────────>│
       │                       │                     │                  │
       │                       │                     │ XML (All Ledgers)│
       │                       │                     │<─────────────────┤
       │                       │                     │                  │
       │                       │                     │ [Parse XML→JSON] │
       │                       │                     │                  │
       │                       │ POST /api/data      │                  │
       │                       │ {ledgers: [...]}    │                  │
       │                       │<────────────────────┤                  │
       │                       │                     │                  │
       │ [Webhook]             │                     │                  │
       │ Ledgers synced        │                     │                  │
       │<──────────────────────┤                     │                  │
```

---

### Pattern 3: Offline → Online Sync

**Scenario:** Agent offline for 2 hours, then comes back online

```
TIME: 10:00 AM - Agent goes OFFLINE
├─ User creates 5 invoices in cloud
├─ Jobs queue up in Redis: [job1, job2, job3, job4, job5]
├─ Agent cannot poll (no internet)
│
TIME: 12:00 PM - Agent comes ONLINE
├─ Agent polls cloud
├─ Cloud: "You have 5 pending jobs (oldest: 2 hours)"
├─ Agent: Downloads all 5 jobs
├─ Agent: Executes job1 → Success
├─ Agent: Executes job2 → Success
├─ Agent: Executes job3 → Tally error (duplicate entry)
├─ Agent: Executes job4 → Success
├─ Agent: Executes job5 → Success
├─ Agent: Reports results (4 success, 1 failed)
└─ Cloud: Updates job statuses

Result: 4/5 synced, 1 requires manual review
```

---

## Component Details

### Component 1: Laravel Tally Connect Service

**Technology Stack:**
- Laravel 11
- Redis (Queue + Cache)
- MySQL/PostgreSQL
- Laravel Horizon (Queue monitoring)

**Directory Structure:**
```
laravel-tally-connect/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── TallyController.php          # Business API endpoints
│   │   │   └── AgentController.php          # Agent management endpoints
│   │   └── Middleware/
│   │       ├── AgentAuthentication.php      # Agent API key auth
│   │       └── RateLimitAgentPolling.php    # Prevent abuse
│   ├── Services/
│   │   ├── TallyXmlConverter.php            # Core: JSON ↔ XML conversion
│   │   ├── AgentManager.php                 # Agent health tracking
│   │   └── TallyOperations/
│   │       ├── BaseOperation.php
│   │       ├── VoucherOperation.php         # Sales, Purchase, Payment, etc.
│   │       ├── LedgerOperation.php          # Create/Read ledgers
│   │       ├── StockItemOperation.php       # Inventory items
│   │       └── ReportOperation.php          # Tally reports
│   ├── Jobs/
│   │   └── ProcessTallyRequest.php          # Queued job processing
│   ├── Models/
│   │   ├── Agent.php
│   │   ├── TallyJob.php
│   │   └── TallyLog.php
│   └── Events/
│       ├── AgentConnected.php
│       ├── AgentDisconnected.php
│       └── TallyJobCompleted.php
├── routes/
│   └── api.php
├── config/
│   └── tally.php
└── database/
    └── migrations/
```

**Core API Endpoints:**

```php
// Business Application Endpoints (JSON in/out)
POST   /api/tally/vouchers              # Create voucher
GET    /api/tally/vouchers/{id}         # Get voucher
POST   /api/tally/ledgers               # Create ledger
GET    /api/tally/ledgers               # List ledgers
POST   /api/tally/stock-items           # Create stock item
GET    /api/tally/reports/{type}        # Get reports

// Agent Endpoints
POST   /api/agent/poll                  # Agent polls for jobs
POST   /api/agent/result                # Agent submits result
POST   /api/agent/heartbeat             # Health check
POST   /api/agent/register              # Initial registration

// Webhook/Status Endpoints
GET    /api/jobs/{id}                   # Check job status
POST   /api/webhooks/{shop_id}          # Register webhook
```

**Database Schema:**

```sql
-- Agents table
CREATE TABLE agents (
    id VARCHAR(36) PRIMARY KEY,
    shop_id VARCHAR(36) NOT NULL,
    name VARCHAR(255),
    api_key VARCHAR(64) UNIQUE,
    tally_version VARCHAR(20),          -- ERP9, Prime, PrimeServer
    tally_company_name VARCHAR(255),
    status ENUM('online', 'offline', 'error') DEFAULT 'offline',
    last_seen_at TIMESTAMP,
    last_poll_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,

    INDEX idx_shop_id (shop_id),
    INDEX idx_status_last_seen (status, last_seen_at),
    INDEX idx_api_key (api_key)
);

-- Jobs table
CREATE TABLE tally_jobs (
    id VARCHAR(36) PRIMARY KEY,
    agent_id VARCHAR(36) NOT NULL,
    shop_id VARCHAR(36) NOT NULL,
    type VARCHAR(50) NOT NULL,          -- voucher.create, ledger.read, etc.
    payload JSON NOT NULL,
    result JSON NULL,
    status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
    priority TINYINT DEFAULT 5,         -- 1=highest, 10=lowest
    attempts TINYINT DEFAULT 0,
    max_attempts TINYINT DEFAULT 3,
    error_message TEXT NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    completed_at TIMESTAMP NULL,

    INDEX idx_agent_status (agent_id, status),
    INDEX idx_shop_status (shop_id, status),
    INDEX idx_priority_created (priority ASC, created_at ASC),
    INDEX idx_expires (expires_at)
);

-- Logs table (for debugging and audit)
CREATE TABLE tally_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    agent_id VARCHAR(36),
    job_id VARCHAR(36),
    level ENUM('info', 'warning', 'error'),
    message TEXT,
    context JSON,
    created_at TIMESTAMP
);
```

**Redis Data Structure:**

```
# Agent-specific job queue (List)
agent:{agent_id}:jobs              → ["job_id_1", "job_id_2", ...]

# Agent info cache (Hash)
agent:{agent_id}:info              → {shop_id, status, last_seen, tally_version}

# Agent last seen timestamp (String)
agent:{agent_id}:last_seen         → Unix timestamp

# Shop's agents (Set)
shop:{shop_id}:agents              → {"agent_1", "agent_2", ...}

# Online agents count (String)
stats:agents:online                → 1247

# Job data cache (Hash) - TTL 24 hours
job:{job_id}                       → {status, result, created_at, ...}
```

---

### Component 2: Electron Desktop Agent

**Technology Stack:**
- Electron 28+
- Node.js 20+
- SQLite (local queue)
- axios (HTTP client)
- xml2js (XML parsing)

**Directory Structure:**
```
electron-tally-agent/ (current folder)
├── main.js (or index.js)            # Electron main process
├── preload.js                       # Security bridge
├── package.json
├── services/
│   ├── polling.service.js           # Poll cloud every 30s
│   ├── auth.service.js              # API key management
│   ├── tally.service.js             # Tally XML communication
│   ├── queue.service.js             # SQLite offline queue
│   └── update.service.js            # Auto-updater
├── tally/
│   ├── xml-builder.js               # Build Tally XML requests
│   ├── xml-parser.js                # Parse Tally XML responses
│   ├── operations/
│   │   ├── voucher.js               # Voucher operations
│   │   ├── ledger.js                # Ledger operations
│   │   ├── stock.js                 # Stock item operations
│   │   └── report.js                # Report operations
│   └── versions/
│       ├── erp9.js                  # ERP 9 specific logic
│       ├── prime.js                 # Prime specific logic
│       └── prime-server.js          # Prime Server specific
├── ui/
│   ├── index.html                   # Settings/Status UI
│   ├── renderer.js                  # UI logic
│   └── styles.css
├── config/
│   ├── default.json                 # Default config
│   └── tally-versions.json          # Version mappings
└── assets/
    ├── icon.png                     # Tray icon
    └── logo.png
```

**Core Polling Service Implementation:**

```javascript
// services/polling.service.js
class PollingService {
  constructor() {
    this.interval = 30000;           // 30 seconds
    this.maxRetries = 3;
    this.backoffMultiplier = 2;
    this.isRunning = false;
  }

  async start() {
    this.isRunning = true;
    await this.poll();
  }

  async poll() {
    if (!this.isRunning) return;

    try {
      const agentInfo = await AuthService.getAgentInfo();

      // Poll cloud service
      const response = await axios.post(
        `${config.cloudUrl}/api/agent/poll`,
        {
          agent_id: agentInfo.id,
          status: 'idle',
          tally_version: await TallyService.getVersion(),
          tally_company: await TallyService.getCompanyName()
        },
        {
          headers: {
            'Authorization': `Bearer ${agentInfo.apiKey}`,
            'User-Agent': `TallyAgent/${app.getVersion()}`
          },
          timeout: 10000  // 10s timeout
        }
      );

      if (response.data.jobs && response.data.jobs.length > 0) {
        await this.processJobs(response.data.jobs);
      }

      // Use server-provided interval if available
      this.interval = (response.data.poll_interval || 30) * 1000;

    } catch (error) {
      console.error('Polling error:', error);

      // Exponential backoff on error
      this.interval = Math.min(this.interval * this.backoffMultiplier, 300000);
    }

    // Schedule next poll
    setTimeout(() => this.poll(), this.interval);
  }

  async processJobs(jobs) {
    for (const job of jobs) {
      try {
        const result = await TallyService.executeJob(job);
        await this.reportSuccess(job.id, result);
      } catch (error) {
        await this.reportError(job.id, error);
      }
    }
  }
}
```

**Offline Queue (SQLite):**

```sql
-- Local database schema
CREATE TABLE offline_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT UNIQUE,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,             -- JSON stringified
    result TEXT,                        -- JSON stringified
    status TEXT DEFAULT 'pending',      -- pending, synced, failed
    retry_count INTEGER DEFAULT 0,
    created_at INTEGER,                 -- Unix timestamp
    synced_at INTEGER
);

CREATE INDEX idx_status ON offline_queue(status);
CREATE INDEX idx_created ON offline_queue(created_at);
```

---

### Component 3: Tally XML API Integration

**Tally Version Support:**

```javascript
// config/tally-versions.json
{
  "ERP9": {
    "port": 9000,
    "xml_version": "5.5",
    "supported_features": [
      "vouchers",
      "ledgers",
      "stock_items",
      "basic_reports"
    ],
    "limitations": [
      "No batch operations",
      "Limited concurrent requests"
    ]
  },
  "Prime": {
    "port": 9000,
    "xml_version": "7.0",
    "supported_features": [
      "vouchers",
      "ledgers",
      "stock_items",
      "advanced_reports",
      "batch_operations"
    ],
    "limitations": []
  },
  "PrimeServer": {
    "port": 9000,
    "xml_version": "7.2",
    "connection_type": "server",
    "supported_features": [
      "all",
      "multi_company",
      "concurrent_access"
    ],
    "limitations": []
  }
}
```

**XML Request Example (Create Sales Voucher):**

```xml
<!-- Tally XML Request -->
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER REMOTEID="" VCHKEY="" VCHTYPE="Sales" ACTION="Create">
            <DATE>20260102</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>1</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Customer ABC</PARTYLEDGERNAME>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Customer ABC</LEDGERNAME>
              <AMOUNT>-10000</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Sales Account</LEDGERNAME>
              <AMOUNT>10000</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
```

---

## Edge Cases & Error Handling

### Edge Case 1: Agent Offline During Job Creation

**Scenario:** User creates invoice while agent is offline.

```
USER ACTION: Create invoice at 10:00 AM
    ↓
CLOUD: Job queued in Redis (expires in 24h)
    ↓
AGENT: Offline (no internet)
    ↓
TIME PASSES: 2 hours
    ↓
AGENT: Comes online at 12:00 PM
    ↓
AGENT: Polls cloud → receives 2-hour-old job
    ↓
AGENT: Executes on Tally
    ↓
RESULT: ✅ Job completed (2-hour delay acceptable)
```

**Handling:**
- Jobs have TTL (24-48 hours)
- After TTL: Job marked as "expired"
- Cloud app notified via webhook
- User sees "Sync failed - agent offline too long"

---

### Edge Case 2: Tally Software Closed

**Scenario:** Agent online, but Tally not running.

```
AGENT: Receives job from cloud
    ↓
AGENT: Tries to connect to localhost:9000
    ↓
ERROR: Connection refused (Tally not running)
    ↓
AGENT: Reports error to cloud
    ↓
CLOUD: Marks job as "failed" (reason: Tally unavailable)
    ↓
RETRY: Cloud retries job after 5 minutes
    ↓
(If Tally still closed after 3 retries)
    ↓
CLOUD: Marks job as "permanently failed"
    ↓
USER: Receives notification "Please start Tally"
```

**Retry Strategy:**
- Attempt 1: Immediate
- Attempt 2: After 5 minutes
- Attempt 3: After 15 minutes
- After 3 failures: Manual intervention required

---

### Edge Case 3: Duplicate Job Execution

**Scenario:** Network issue causes agent to process same job twice.

**Prevention:**
```javascript
// Agent checks if job already processed locally
const alreadyProcessed = await db.jobs.findOne({
  job_id: job.id,
  status: 'completed'
});

if (alreadyProcessed) {
  console.log('Job already processed, skipping');
  return alreadyProcessed.result;
}

// Execute job
const result = await TallyService.execute(job);

// Store result locally to prevent re-execution
await db.jobs.insert({
  job_id: job.id,
  result: result,
  status: 'completed',
  completed_at: Date.now()
});
```

---

### Edge Case 4: Multiple Agents for Same Shop

**Scenario:** Shop has multiple computers with agents (different Tally companies).

**Handling:**
```javascript
// Each agent has unique ID but same shop_id
Agent 1: { agent_id: "agent_001", shop_id: "shop_123", company: "Company A" }
Agent 2: { agent_id: "agent_002", shop_id: "shop_123", company: "Company B" }

// Jobs specify which agent (by company or agent_id)
Job: {
  shop_id: "shop_123",
  agent_id: "agent_001",  // Optional: specific agent
  company: "Company A",    // Or: any agent with this company
  ...
}

// During poll, agent only gets jobs for itself
GET /api/agent/poll?agent_id=agent_001
→ Returns jobs where (agent_id === 'agent_001' OR company === 'Company A')
```

---

## Scalability Strategy

### Horizontal Scaling Plan

```
┌─────────────────────────────────────────────────────────────┐
│                    Load Balancer                             │
│                 (Nginx / Cloudflare)                         │
└────────────┬────────────────────────────┬───────────────────┘
             │                            │
             ↓                            ↓
┌────────────────────────┐   ┌────────────────────────┐
│ Laravel Instance 1     │   │ Laravel Instance 2     │   ...
│ - API Endpoints        │   │ - API Endpoints        │
│ - Queue Workers (2)    │   │ - Queue Workers (2)    │
└────────────┬───────────┘   └────────────┬───────────┘
             │                            │
             └────────────┬───────────────┘
                          ↓
             ┌────────────────────────┐
             │    Redis Cluster       │
             │  - Job Queue           │
             │  - Agent Info Cache    │
             │  - Rate Limiting       │
             └────────────┬───────────┘
                          ↓
             ┌────────────────────────┐
             │  Database (Master)     │
             │  - Agents              │
             │  - Jobs                │
             │  - Logs                │
             └────────────────────────┘
```

**Scaling Metrics:**

| Agents | Laravel Instances | Redis | Database | Queue Workers |
|--------|------------------|-------|----------|---------------|
| 1-100 | 1 | Single | Single | 2 |
| 100-500 | 2 | Single | Single | 4 |
| 500-1000 | 3-4 | Cluster | Master + Read Replica | 8 |
| 1000+ | 5+ | Cluster | Sharded | 16+ |

---

## Security Considerations

### 1. Agent Authentication

**API Key Generation:**
```php
// Generate secure API key on agent registration
$apiKey = bin2hex(random_bytes(32)); // 64-character hex string

// Store hash in database (never plain text)
$agent->api_key_hash = hash('sha256', $apiKey);

// Return to user ONCE (cannot be retrieved again)
return response()->json([
    'agent_id' => $agent->id,
    'api_key' => $apiKey,
    'message' => 'Save this key securely.'
]);
```

### 2. Data Encryption

- All communication over HTTPS (TLS 1.3)
- Certificate pinning in Electron agent
- Sensitive data encrypted in local SQLite

### 3. Rate Limiting

```php
// Per-agent rate limits
Route::middleware([
    'throttle:agent-poll:10,1'  // 10 requests per minute
])->post('/agent/poll');
```

---

## Deployment Architecture

### Production Environment (AWS Example)

```
Cloudflare (CDN + DDoS) → Load Balancer → Laravel Servers
                                          ↓
                                    Redis + MySQL
```

**Estimated Costs (AWS):**
- 2x EC2 t3.medium: ~$60/month
- RDS MySQL: ~$70/month
- Redis ElastiCache: ~$120/month
- **Total: ~$270/month for 1000+ agents**

---

## Data Flow Examples

### Example 1: Create Sales Invoice (End-to-End)

**1. Bytephase creates voucher:**
```http
POST /api/tally/vouchers
{
  "shop_id": "shop_123",
  "type": "Sales",
  "amount": 1180,
  "ledgers": [...]
}
→ Response: {job_id: "abc123", status: "queued"}
```

**2. Agent polls (30s later):**
```javascript
POST /api/agent/poll
← Receives: {jobs: [{id: "abc123", type: "voucher.create", ...}]}
```

**3. Agent executes on Tally:**
```javascript
→ Converts to Tally XML
→ POST http://localhost:9000
← Tally response: <CREATED>1</CREATED>
```

**4. Agent reports result:**
```javascript
POST /api/agent/result
{job_id: "abc123", status: "completed", result: {...}}
```

**5. Bytephase checks status:**
```http
GET /api/jobs/abc123
→ {status: "completed", duration: 35}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- ✅ Architecture documentation
- [ ] Laravel project setup
- [ ] Database migrations
- [ ] Basic agent registration API
- [ ] Electron agent skeleton enhancement

### Phase 2: Core Functionality (Week 3-4)
- [ ] XML converter (JSON ↔ XML)
- [ ] Polling mechanism in agent
- [ ] Job queue system
- [ ] Basic voucher operations

### Phase 3: All Operations (Week 5-6)
- [ ] Ledger operations
- [ ] Stock item operations
- [ ] Report generation
- [ ] Support all Tally versions

### Phase 4: Reliability (Week 7-8)
- [ ] Offline queue
- [ ] Error handling & retry logic
- [ ] Health monitoring
- [ ] Auto-updater

### Phase 5: Production (Week 9-10)
- [ ] Security hardening
- [ ] Load testing
- [ ] Documentation
- [ ] Deployment

---

## Next Steps

**Choose your starting point:**

1. **Option A: Start with Electron Agent**
   - Can test Tally integration immediately
   - Build polling service
   - Implement Tally XML communication
   - Add offline queue

2. **Option B: Start with Laravel Service**
   - API-first approach
   - Build job queue system
   - Create XML converter
   - Implement agent management

3. **Option C: Build Both in Parallel**
   - Faster completion
   - Requires 2 developers
   - More coordination needed

---

## Questions Requiring Decisions

- [ ] What is the primary Tally version used by most shops?
- [ ] What is acceptable sync delay? (10s, 30s, 60s?)
- [ ] Should agent have UI or run headless?
- [ ] What monitoring/logging service? (Sentry, custom?)
- [ ] Deployment strategy? (AWS, DigitalOcean, self-hosted?)
- [ ] Do you want to start with Agent or Laravel service?

---

**Document Status:** ✅ Complete - Ready for implementation
**Next Action:** Choose starting point and begin development
