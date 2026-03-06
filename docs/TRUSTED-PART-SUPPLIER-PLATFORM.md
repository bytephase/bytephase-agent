# Trusted Part Supplier Platform — Project Documentation

**Domain:** `partner.bytephase.com`
**Parent Product:** BytePhase CRM (`*.bytephase.com`)
**Company:** BytePhase Technologies Private Limited
**Status:** Planning Phase

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Business Context](#business-context)
- [The Core Problem](#the-core-problem)
- [Why This Product Exists](#why-this-product-exists)
- [Product Overview](#product-overview)
- [How It Fits Into the BytePhase Ecosystem](#how-it-fits-into-the-bytephase-ecosystem)
- [Key Stakeholders & User Roles](#key-stakeholders--user-roles)
- [Core Features](#core-features)
- [The Tally Integration Challenge](#the-tally-integration-challenge)
- [BytePhase Agent — The Bridge](#bytephase-agent--the-bridge)
- [Agent & Tally — Engineering Decisions](#agent--tally--engineering-decisions)
  - [1. Tally Company Selection](#1-tally-company-selection)
  - [2. Stock Group Filtering](#2-stock-group-filtering)
  - [3. Inventory Mapping & Normalization](#3-inventory-mapping--normalization)
  - [4. Sync Rate vs Tally Performance](#4-sync-rate-vs-tally-performance)
  - [5. Agent Update Strategy](#5-agent-update-strategy)
  - [6. Offline Resilience for Tally Sync](#6-offline-resilience-for-tally-sync)
- [Agent Trigger Flow — Deep Link vs Polling](#agent-trigger-flow--deep-link-vs-polling)
- [Database Design Decisions](#database-design-decisions)
- [Figma / UI Design Prompt](#figma--ui-design-prompt)
- [CRM Integration (In-App Search & Ordering)](#crm-integration-in-app-search--ordering)
- [Platform Architecture Overview](#platform-architecture-overview)
- [Technical Stack & Infrastructure](#technical-stack--infrastructure)
- [Monetization Model](#monetization-model)
- [Roadmap Priorities](#roadmap-priorities)

---

## Executive Summary

**Trusted Part Supplier Platform** is a B2B marketplace and inventory syndication network built on top of BytePhase's existing repair shop ecosystem. It lives at `partner.bytephase.com` and serves as the missing link between **repair part suppliers** and **repair shop owners** — with a public search layer accessible to anyone.

The platform solves a real, daily pain point in the repair industry: a technician working on a laptop or mobile device runs out of a specific part, has no idea who has it in stock nearby, and loses hours (or the job entirely) trying to locate it. This platform makes the answer instant.

The first and most critical integration is **Tally ERP**, which is the dominant inventory management tool used by parts suppliers in India. Since Tally has no internet access or cloud API, the **BytePhase Agent** — an Electron desktop app already built — serves as the secure local bridge to sync Tally inventory into the platform automatically.

---

## Business Context

### BytePhase CRM — The Existing Foundation

BytePhase is an all-in-one cloud CRM for repair shop businesses (laptops, mobiles, computers, AC, fridge, data recovery). It operates on a wildcard subdomain model:

```
*.bytephase.com
```

Every paying customer gets their own subdomain (e.g., `techfix.bytephase.com`). Reserved subdomains include `admin`, `clients`, and now — **`partner`**.

**BytePhase CRM already handles:**
- Repair ticket management
- POS billing (UPI + barcode)
- Inventory management
- Employee permissions & activity logs
- WhatsApp / SMS / Email auto-updates
- OTP-based device delivery verification
- AMC contract tracking
- Purchase management
- 1,600+ active repair businesses across 32+ countries

### The Gap

BytePhase manages inventory *inside* a repair shop. But it has no answer for when a shop's inventory runs out and the owner needs to source a specific part from a nearby supplier — fast.

---

## The Core Problem

| Who | Their Problem |
|-----|---------------|
| **Repair Shop Owner (CRM User)** | Part not in stock. No system to quickly find who has it nearby. Order placed on phone calls / WhatsApp manually. Time-wasting, error-prone. |
| **Part Supplier** | No digital storefront. No way to broadcast their inventory to shops that need it. Orders come randomly. |
| **End Customer (Device Owner)** | Delayed repairs because the shop can't source parts fast enough. |
| **Data Recovery Business** | Needs specific drive components. No central place to find who stocks them. |

---

## Why This Product Exists

1. **India's repair industry runs on Tally.** A large share of parts suppliers manage their entire inventory in Tally ERP — an offline, desktop-based accounting + inventory tool. There is no internet-accessible API, and no cloud Tally that bridges this gap reliably.

2. **BytePhase already built the bridge.** The BytePhase Agent (Electron desktop app) was originally built for directory scanning (data recovery use case). Its architecture — local job execution, cloud sync, module system — is perfectly suited to add a **Tally Sync Module** that reads inventory from Tally and pushes it to the partner platform.

3. **BytePhase has the distribution.** With 1,600+ active repair shops already using the CRM, embedding a "Search Nearby Suppliers" feature inside the CRM creates instant demand for the partner platform. Suppliers join because buyers are already there.

---

## Product Overview

### What `partner.bytephase.com` Is

A **three-sided platform:**

```
┌──────────────────────────────────────────────────────────────┐
│                  partner.bytephase.com                        │
│                                                              │
│  ┌─────────────────┐   ┌─────────────────┐   ┌───────────┐  │
│  │   Supplier       │   │  Public Search  │   │  CRM      │  │
│  │   Dashboard      │   │  (Anyone)       │   │  In-App   │  │
│  │                  │   │                 │   │  Search   │  │
│  │ - Manage Stock   │   │ - Search parts  │   │           │  │
│  │ - View Orders    │   │ - Find suppliers│   │ - Shop    │  │
│  │ - Sync w/ Tally  │   │ - Location-based│   │   owners  │  │
│  │ - Pricing        │   │   results       │   │   order   │  │
│  └─────────────────┘   └─────────────────┘   │   direct  │  │
│                                               └───────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## How It Fits Into the BytePhase Ecosystem

```
                         ┌────────────────────────┐
                         │   BytePhase CRM         │
                         │   *.bytephase.com        │
                         │                          │
                         │  Jobs | POS | Inventory  │
                         │  Purchase | Customers    │
                         │                          │
                         │  ┌──────────────────┐   │
                         │  │ "Find a Part"    │   │
                         │  │  [Search]        │───┼──────────┐
                         │  └──────────────────┘   │          │
                         └────────────────────────┘          │
                                                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               partner.bytephase.com                              │
│                                                                  │
│  Public Search ──────────────────► Supplier Listings            │
│                                    (Location-sorted)             │
│                                                                  │
│  CRM In-App Request ─────────────► Direct Order to Supplier     │
└─────────────────────────────────────────────────────────────────┘
                         ▲
                         │ Inventory Sync (via Agent)
                         │
              ┌──────────────────────┐
              │  BytePhase Agent     │
              │  (Electron Desktop)  │
              │                      │
              │  Tally Sync Module   │──── Tally ERP (offline)
              └──────────────────────┘
```

---

## Key Stakeholders & User Roles

### 1. Partner / Supplier
- A parts supplier, distributor, or wholesaler who has inventory to sell
- Has their own login at `partner.bytephase.com`
- Can manually add/edit inventory OR sync it automatically from Tally via the Agent
- Can be an **existing BytePhase CRM user** (dual role: repair shop + supplier)
- Receives and manages orders through the platform

### 2. CRM User (Repair Shop Owner)
- Already a BytePhase subscriber on `*.bytephase.com`
- While managing a repair job or inventory shortfall, searches for parts directly within the CRM
- Sees nearby suppliers with stock, places an order without leaving the CRM

### 3. Public User (Anyone)
- No login required
- Accesses the public search at `partner.bytephase.com`
- Searches for a part, sees which suppliers have it, views their contact/location info
- Can initiate an order or contact the supplier directly

### 4. End Customer (Device Owner)
- A person who owns a device being repaired
- May use public search to understand part availability
- Secondary audience, not the primary user

---

## Core Features

### Supplier Dashboard
- Supplier registration and verified login
- Inventory management (add, edit, bulk upload)
- Pricing and availability control per item
- Order inbox — receive, confirm, dispatch orders
- Business profile (name, address, location pin, contact, working hours)
- Sales analytics and order history

### Public Search
- Search by part name, model, SKU, or category
- Location-based results — nearest suppliers shown first
- Supplier profile preview (rating, stock count, contact)
- No login required to search
- Option to place an enquiry or order (login required to order)

### CRM In-App Integration (Embedded in `*.bytephase.com`)
- "Search for a Part" button on the CRM's Purchase / Inventory screens
- Opens an in-app panel showing real-time results from `partner.bytephase.com`
- Repair shop owner selects a supplier and places an order
- Order is tracked within both the CRM and the partner platform
- Optionally auto-links the purchase to the active repair job/ticket

### Tally Inventory Sync (via BytePhase Agent)
- Supplier installs BytePhase Agent on the same machine running Tally
- Agent's Tally Sync Module reads stock items, quantities, and prices from Tally
- Inventory is pushed to `partner.bytephase.com` on a schedule (e.g., every 15–30 minutes)
- Changes in Tally reflect automatically — no manual data entry
- Sync logs and error reporting visible in Agent UI and Supplier Dashboard

### Multi-Role Account Support
- A BytePhase CRM user can activate their account as a Partner (Supplier)
- Single login, dual access — CRM dashboard + Supplier dashboard
- Billing handled separately per product

---

## The Tally Integration Challenge

### Why Tally Cannot Sync Directly

| Factor | Detail |
|--------|--------|
| **Tally is offline-first** | No internet-facing API. Runs on `localhost:9000` |
| **No cloud API** | Even Tally on Cloud is tightly restricted — no third-party REST access |
| **XML-based communication** | Tally accepts HTTP POST of XML envelopes on local port only |
| **Firewall / NAT** | Not reachable from the internet by design |
| **India market reality** | The majority of Indian part suppliers use Tally for inventory — this isn't a niche edge case |

### The Solution: BytePhase Agent as the Bridge

The BytePhase Agent runs locally on the supplier's machine — the same machine (or LAN) as Tally. It:

1. Connects to Tally on `localhost:9000` via XML API
2. Reads stock items, quantities, categories, and pricing
3. Authenticates with `partner.bytephase.com` using an encrypted API key
4. Pushes inventory data to the cloud platform
5. Polls for any orders placed by buyers and surfaces them in the Supplier Dashboard
6. Runs silently in the system tray — no manual interaction needed after setup

---

## BytePhase Agent — The Bridge

### Current State (v2.0)
The agent is production-ready with:
- Module system (plugin architecture)
- Directory Scanner Module (used for data recovery businesses)
- Tally Module — stub implementations exist for vouchers, ledgers, stock read/write
- Auth, Polling, Queue (SQLite), Deep Linking, Token Security

### What Needs to Be Built / Extended

| Task | Module / Service | Priority |
|------|-----------------|----------|
| `tally.stock.read` — Full implementation | Tally Module | 🔴 Critical |
| `tally.stock.sync` — Scheduled sync to partner platform | Tally Module | 🔴 Critical |
| Sync status reporting to Supplier Dashboard | Polling Service | 🔴 Critical |
| `tally.ledger.read` — Supplier/vendor list | Tally Module | 🟡 Medium |
| Auto-detect Tally company and stock groups | Tally Service | 🟡 Medium |
| Partner API endpoints on `partner.bytephase.com` | Backend | 🔴 Critical |
| Agent onboarding flow for Partners | Settings UI | 🟡 Medium |

### Tally Sync Job Flow (Target)

```
BytePhase Agent (Supplier Machine)
  │
  ├─ Every 15–30 minutes:
  │     1. POST to Tally localhost:9000 — request stock list (XML)
  │     2. Parse XML response → normalized inventory array
  │     3. POST to partner.bytephase.com/api/partner/inventory/sync
  │     4. Receive acknowledgement + diff (what changed)
  │     5. Log sync result
  │
  └─ On demand (triggered by partner.bytephase.com):
        1. Cloud sends job via /api/agent/poll
        2. JobRouter → Tally Module → execute sync immediately
        3. Result reported back to cloud
```

---

## Agent & Tally — Engineering Decisions

These are the six critical problems that must be solved before the Tally sync is production-ready. Every decision here affects DB design, Agent code, and the platform API.

---

### 1. Tally Company Selection

**Problem:** Tally can have multiple companies open simultaneously. Every XML request must be scoped to the correct one.

**Solution — Two-step flow triggered by "Test Connection" in Agent UI:**

**Step 1:** Fetch available open companies via XML:

```xml
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of Companies</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="List of Companies" ISMODIFY="No">
            <TYPE>Company</TYPE>
            <FETCH>Name</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>
```

**Step 2:** Agent shows a dropdown — "Select Company to Sync" — populated from the response. User picks one, saved to encrypted config. All future Tally requests inject the company name:

```xml
<STATICVARIABLES>
  <SVCURRENTCOMPANY>ABC Electronics Pvt Ltd</SVCURRENTCOMPANY>
</STATICVARIABLES>
```

**Agent config storage:**
```json
{
  "tally": {
    "host": "localhost",
    "port": 9000,
    "selectedCompany": "ABC Electronics Pvt Ltd",
    "autoDetect": false
  }
}
```

**Edge case:** If Tally is closed or the company is not open when sync runs, the Agent must detect the empty/error XML response, stop the sync job gracefully, and surface a clear tray notification: "Tally company not found. Please open Tally and try again."

---

### 2. Stock Group Filtering

**Problem:** Tally holds everything — stock items, ledgers, salary groups, expense heads. Only specific inventory groups should sync. Sending everything would pollute the platform with irrelevant internal data.

**Solution — Three filtering layers:**

**Layer 1 (Always applied): Filter by `Stock Item` type only**
Every sync XML request is scoped to `Stock Item` type. This permanently excludes ledgers, payroll groups, and expense heads — no configuration required.

**Layer 2 (Supplier configures once): Stock Group checkbox tree**

Fetch all stock groups from Tally:
```xml
<COLLECTION NAME="All Stock Groups" ISMODIFY="No">
  <TYPE>Stock Group</TYPE>
  <FETCH>Name, Parent</FETCH>
</COLLECTION>
```

Render in Agent UI as a hierarchical checkbox tree (Tally groups are parent/child):
```
☑ Mobile Parts
  ☑ Batteries
  ☑ Screens
  ☐ Internal Cables        ← supplier unchecks, excluded from sync
☑ Laptop Parts
  ☑ RAM
  ☑ SSD
☐ Tools & Equipment        ← entire group excluded
```

During sync, only fetch stock items whose `PARENT` group is in the selected list.

**Layer 3 (Phase 2): Item-level visibility toggle**
Suppliers can mark individual items as hidden even within a synced group — useful for reserved stock or items they don't want publicly listed.

**Agent config storage:**
```json
{
  "tally": {
    "selectedCompany": "ABC Electronics Pvt Ltd",
    "syncGroups": ["Batteries", "Screens", "RAM", "SSD"],
    "excludedItems": []
  }
}
```

---

### 3. Inventory Mapping & Normalization

**Problem:** Tally item names are often messy internal codes (e.g., `SamsungS21Batt-OEM-A-Grade-2023`) that are unsearchable and meaningless to buyers on the platform.

**Solution — Three layers:**

**Layer 1: Extract all available Tally fields**

| Tally Field | Platform Field | Notes |
|-------------|----------------|-------|
| `NAME` | `tally_item_name` | Sync key — never overwritten |
| `PARENT` (group) | `category` | Auto-mapped from sync group |
| `CLOSINGBALANCE` | `quantity` | Updated on every sync |
| `RATE` | `unit_price` | Updated on every sync |
| `BASEUNITS` | `unit` | pcs, kg, box, etc. |
| `DESCRIPTION` | `notes` | If present in Tally |
| `ALIAS` | `alternate_name` | Secondary searchable name |

**Layer 2: Agent-side normalization rules (configurable JSON)**

After reading raw Tally data, Agent runs a normalization pass before pushing to the platform:

```json
{
  "normalization": {
    "stripPatterns": ["-OEM", "-Grade-A", "-2023", "-NEW"],
    "replaceMap": {
      "Batt": "Battery",
      "Scrn": "Screen",
      "Mob": "Mobile",
      "Lpt": "Laptop"
    },
    "categoryAliases": {
      "Batteries": "Battery",
      "Batt Group": "Battery"
    }
  }
}
```

This produces a clean `display_name` alongside the raw Tally name.

**Layer 3: Platform-side mapping UI (Supplier Dashboard — Phase 2)**

After first sync, the Supplier Dashboard shows a mapping table:

```
Raw Tally Name                  →  Display Name (editable)       Category
SamsungS21Batt-OEM-A-Grade      →  Samsung S21 Battery (OEM)     Battery
AppleIP13Scrn-LCD               →  iPhone 13 LCD Screen          Screen
```

Supplier edits display names once. These are saved on the platform side and survive all future syncs — `tally_item_name` is the immutable key, `display_name` is the human-readable version.

**Critical DB rule:** During sync, NEVER overwrite `display_name`. Only update `quantity`, `unit_price`, and `last_synced_at`.

**`partner_inventory` table (core fields):**
```
partner_inventory
├── id
├── partner_id
├── tally_item_name      ← immutable sync key
├── display_name         ← editable by supplier, never overwritten by sync
├── category
├── quantity             ← updated every sync
├── unit
├── unit_price           ← updated every sync
├── is_visible           ← supplier can hide items
├── last_synced_at
└── meta (JSON)          ← raw Tally snapshot for debugging
```

---

### 4. Sync Rate vs Tally Performance

**Problem:** Tally is a desktop app. Too-frequent XML polling degrades the supplier's machine performance.

**Solution — Adaptive intervals with off-hours scheduling:**

| Scenario | Default Interval |
|----------|-----------------|
| Business hours | 30 minutes |
| Off-hours (configurable window) | 2 hours |
| Manual "Sync Now" | Immediate, on demand |
| Post-order (buyer places order) | Targeted single-item refresh |

**Agent config:**
```json
{
  "syncIntervalMinutes": 30,
  "offHoursIntervalMinutes": 120,
  "offHoursStart": "20:00",
  "offHoursEnd": "09:00",
  "partialSyncOnOrder": true
}
```

**Partial sync on order** is a key optimization: when a buyer places an order on the platform, the platform queues a job to the Agent to refresh that single item's stock count only. Targeted XML query, takes milliseconds, keeps availability accurate without a full sync cycle.

**Tally load protection rules (always enforced):**
- Sync items in chunks of 200 per XML request
- 2-second delay between chunks if total items > 500
- If Tally response time exceeds 10 seconds, back off and retry in 5 minutes
- Mutex lock — never start a new sync if a previous one is still running

---

### 5. Agent Update Strategy

**Problem:** Once both CRM users (directory scanning) and Partners (Tally sync) depend on the Agent, a bad update breaks two separate user groups. A forced restart during an active sync or scan is a bad experience.

**Solution — `electron-updater` with staged rollout on S3:**

```javascript
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = false; // notify first, never silently download
autoUpdater.checkForUpdatesAndNotify();

autoUpdater.on('update-available', (info) => {
  // Show tray notification: "Agent update v2.x.x available"
  // User clicks → download starts in background
});

autoUpdater.on('update-downloaded', () => {
  // Tray notification: "Update ready — restart to apply"
  // Check if sync or scan is active before allowing restart
});
```

**Host update files on:** `agent-updates.bytephase.com` (S3 bucket). Preferred over GitHub Releases for rollout control.

**Staged rollout process:**
```
1. Build new version → upload to S3 channel: "beta"
2. Internal team installs Agent with beta channel — test 48 hours
3. No critical issues → promote to "stable" channel on S3
4. All production Agents on "stable" auto-notify their users
```

**Two update channels in config:**
```json
{
  "updateChannel": "stable",
  "autoCheckUpdates": true,
  "checkIntervalHours": 24
}
```

**Rules:**
- Never auto-install without user confirmation
- Never allow restart if a Tally sync or directory scan is in progress — prompt "A sync is running. Restart after it completes?"
- Keep backend polling API versioned (`/api/agent/v2/poll`) so older Agent versions continue to work while users update

---

### 6. Offline Resilience for Tally Sync

**Problem:** Internet drops mid-sync with 3,000 items partially uploaded. Data must not be lost or partially committed on the platform.

**Solution — Chunked sync with session ID + SQLite queue:**

The same chunked upload pattern used by the Directory Scanner is applied here, with the addition of a sync session to enable resume capability.

**Sync flow:**
```
1. Agent reads all stock from Tally → in-memory array (e.g., 3,200 items)
2. Creates a sync_session_id (UUID) → saves to SQLite
3. Splits into chunks of 500 items
4. For each chunk:
     a. POST /api/partner/inventory/sync
          { session_id, chunk_index, total_chunks, items: [...] }
     b. Success → mark chunk "synced" in SQLite
     c. Failure → mark chunk "pending", retry on next poll cycle
5. All chunks sent → POST /api/partner/inventory/sync/complete
          { session_id }  ← platform commits the full session
6. Clear session from SQLite
```

**Platform rule:** Do NOT apply partial syncs to live inventory until `sync/complete` is received. Buyers always see either the last fully committed sync or the new one — never a half-updated state.

**SQLite tables in Agent:**
```sql
CREATE TABLE tally_sync_sessions (
  id          TEXT PRIMARY KEY,  -- UUID
  started_at  INTEGER,
  total_items INTEGER,
  total_chunks INTEGER,
  status      TEXT               -- 'in_progress' | 'complete' | 'failed'
);

CREATE TABLE tally_sync_chunks (
  session_id      TEXT,
  chunk_index     INTEGER,
  item_count      INTEGER,
  status          TEXT,          -- 'pending' | 'synced' | 'failed'
  attempts        INTEGER DEFAULT 0,
  last_attempt_at INTEGER,
  PRIMARY KEY (session_id, chunk_index)
);
```

**What survives an internet outage:**
- Full Tally read is already in SQLite before any upload begins
- Successfully uploaded chunks are marked and won't re-send
- Pending chunks retry automatically on the next Agent poll cycle
- Platform only commits when session is complete — no dirty state for buyers

---

### Engineering Decisions Summary

| Concern | Solution |
|---------|---------|
| Company selection | XML fetch on connect → dropdown → inject in every request |
| Stock group filtering | Fetch groups → checkbox tree UI → filter items by selection |
| Inventory mapping | `tally_item_name` as immutable key + editable `display_name` never overwritten by sync |
| Sync performance | 30-min default, off-hours interval, 200-item chunks, mutex lock, partial sync on order |
| Agent updates | `electron-updater` + S3 staged rollout + no force-restart during active sync/scan |
| Offline resilience | Chunked sync + session ID + SQLite queue + platform commits only on complete session |

---

## Agent Trigger Flow — Deep Link vs Polling

This is an important architectural distinction. The two existing use cases use different trigger mechanisms, and Tally sync follows the polling model — not deep link.

| Flow | Trigger | Why |
|------|---------|-----|
| **Directory Scan** | Deep Link (`bytephase://scan-directory?token=...`) | User-initiated from web app, opens UI window |
| **CRM Agent Connect** | Deep Link (`bytephase://connect?token=...`) | One-time setup, user clicks from browser |
| **Partner Agent Connect** | Deep Link (`bytephase://partner-connect?token=...`) | One-time setup from `partner.bytephase.com` |
| **Tally Inventory Sync** | Polling (every 30 min, automatic) | Continuous background process, no human needed |
| **Partial sync on order** | Cloud job via polling (`/api/agent/poll`) | Platform queues a targeted refresh job |

**Deep Link is only used for the initial Partner onboarding** — clicking "Connect Agent" from `partner.bytephase.com` sends `bytephase://partner-connect?token=...` to configure the Agent with the Partner API key. After that, everything is polling-based and runs automatically in the background.

This preserves all existing directory scanning deep link functionality without any conflict.

---

## Database Design Decisions

### Key Decision 1: Separate Database for Partner Platform

`partner.bytephase.com` must have its **own dedicated database** — completely separate from the BytePhase CRM database. The CRM and Partner platform communicate via API, never via shared DB queries. This ensures clean separation, independent scaling, and no risk of breaking existing CRM functionality.

### Key Decision 2: Linking CRM Users Who Are Also Partners

A BytePhase CRM user can activate a Partner account. The linking mechanism uses a `crm_shop_id` reference column — nullable, so standalone (non-CRM) Partners are also supported.

### Core Tables

```
partners
├── id
├── crm_shop_id          ← nullable, links to CRM shop if dual-role user
├── name
├── email
├── phone
├── status               ← active | suspended | pending
├── subscription_plan
├── created_at

partner_locations
├── id
├── partner_id
├── address
├── city
├── state
├── pincode
├── lat
├── lng
├── is_primary

partner_inventory
├── id
├── partner_id
├── tally_item_name      ← immutable sync key from Tally
├── display_name         ← editable, NEVER overwritten by sync
├── category
├── quantity             ← updated every sync
├── unit
├── unit_price           ← updated every sync
├── is_visible
├── last_synced_at
├── meta (JSON)          ← raw Tally snapshot

inventory_categories
├── id
├── name
├── parent_id            ← nullable, supports hierarchy
├── slug

orders
├── id
├── buyer_type           ← 'crm_user' | 'public_user'
├── buyer_id
├── partner_id
├── status               ← pending | confirmed | dispatched | delivered | cancelled
├── total_amount
├── notes
├── created_at

order_items
├── id
├── order_id
├── inventory_id
├── quantity
├── unit_price_at_order  ← snapshot of price at time of order

tally_sync_logs
├── id
├── partner_id
├── session_id
├── status               ← success | partial | failed
├── items_synced
├── chunks_total
├── chunks_completed
├── error_message
├── started_at
├── completed_at
```

---

## Figma / UI Design Prompt

Use this prompt directly in Figma AI or with a designer to build the Agent UI flows:

> Design a desktop application UI flow for **BytePhase Agent** — an Electron system tray app (Windows/macOS/Linux). The app has a Settings window with tabs. Design the following screens and flows:
>
> **Screen 1 — Settings: Tally Configuration Tab**
> Fields: Tally Host (default: localhost), Tally Port (default: 9000), Company Name dropdown (populated after "Detect Companies" button click), Tally Version (auto-detect toggle). Action buttons: "Test Connection", "Detect Companies". Status indicator: Connected / Disconnected / Error with last-ping timestamp.
>
> **Screen 2 — Settings: Stock Group Filter Tab**
> Shown after Tally connection is established. Displays a hierarchical checkbox tree of all Tally stock groups (parent/child structure). "Select All" and "Deselect All" buttons. Save button. Warning if nothing is selected.
>
> **Screen 3 — Settings: Sync Status Tab**
> Shows: Last sync time, total items synced, sync interval selector (15 min / 30 min / 1 hr), off-hours window picker (start time / end time), sync history log (last 10 entries: timestamp + item count + status + expandable error row). Manual "Sync Now" button.
>
> **Screen 4 — Tally Sync Progress (Modal/Inline)**
> Progress bar, current operation label (e.g., "Reading stock items… chunk 3 of 12"), item counter (e.g., 1,240 / 3,500), Cancel button. Shown during active sync.
>
> **Screen 5 — Partner Connection Setup (Deep Link arrival)**
> Shown when `bytephase://partner-connect?token=...` is triggered. Displays: "Connect to partner.bytephase.com?", Partner name + Shop name extracted from token, Connect / Cancel buttons.
>
> **Screen 6 — System Tray Menu (updated)**
> Two clear sections: (1) BytePhase CRM — Directory Scanner status, last scan time. (2) Partner Platform — Tally sync status, last sync time, item count, "Sync Now" option. Quit button at bottom.
>
> **Style:** Dark sidebar navigation, clean minimal SaaS desktop tool aesthetic. Neutral dark theme (#1a1a2e or similar). Status dots: green (connected/synced), yellow (syncing/warning), red (error/disconnected). Consistent with existing BytePhase brand.

---

## CRM Integration (In-App Search & Ordering)

### Where It Appears in the CRM

| CRM Screen | Integration Point |
|------------|------------------|
| **Inventory** | "Can't find this part? Search suppliers →" |
| **Purchase Order** | Supplier search panel embedded in new purchase flow |
| **Repair Job / Ticket** | "Part needed?" shortcut during job management |
| **Low Stock Alert** | Direct link to search that part on partner platform |

### Order Flow (CRM → Partner Platform)

```
CRM User sees low stock / needs a part
  ↓
Opens "Find Part" panel (embedded in CRM)
  ↓
Real-time search hits partner.bytephase.com API
  ↓
Results shown: [Supplier Name | Distance | Price | Stock Count]
  ↓
CRM User selects supplier → clicks "Order"
  ↓
Order created on partner.bytephase.com
  ↓
Supplier notified (dashboard + notification)
  ↓
Order status syncs back to CRM (optional purchase record created)
```

---

## Platform Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                  partner.bytephase.com (Laravel)                  │
│                                                                    │
│  Auth (Partner Login)      Public Search API                      │
│  Supplier Dashboard        Inventory Index (Elasticsearch/Scout)  │
│  Order Management          CRM Integration API                    │
│  Sync API (Agent push)     Location-based ranking                 │
└───────────────────┬──────────────────────┬───────────────────────┘
                    │                      │
         ┌──────────▼──────┐    ┌──────────▼──────────┐
         │  BytePhase CRM  │    │  BytePhase Agent     │
         │  *.bytephase.com│    │  (Supplier Machine)  │
         │                 │    │                      │
         │  In-app search  │    │  Tally Sync Module   │
         │  Order panel    │    │  ↕ Tally localhost   │
         └─────────────────┘    └──────────────────────┘
```

---

## Technical Stack & Infrastructure

| Layer | Technology |
|-------|-----------|
| Backend | Laravel |
| Admin / Supplier Dashboard | Filament (Laravel) |
| CRM Frontend | Angular (existing stack) |
| Subdomain | `partner.bytephase.com` |
| Hosting | AWS EC2 + S3 + CloudFront (existing infra) |
| Search Index | Laravel Scout (Algolia / Meilisearch / database) |
| Desktop Agent | Electron 39 + Node.js (existing) |
| Local Tally Bridge | BytePhase Agent — Tally Module |
| Database | MySQL (existing) + SQLite (agent queue) |
| Real-time | Pusher / Laravel Echo (for order notifications) |

---

## Monetization Model

| Plan | Who | Pricing Model |
|------|-----|---------------|
| **Supplier Basic** | Small suppliers, manual inventory | Subscription (monthly/yearly) |
| **Supplier Pro** | Tally sync, analytics, priority listing | Higher-tier subscription |
| **CRM Add-on** | BytePhase CRM users who want in-app search | Included or small add-on fee |
| **Commission Model** | Per-order transaction fee | Optional future model |

> Note: BytePhase CRM already starts at ₹299/month with a 20% discount active. Partner platform pricing to be determined.

---

## Roadmap Priorities

### Phase 1 — Agent: Tally Full Implementation (Current Focus)
- [ ] `tally.stock.read` — full XML implementation with company scoping
- [ ] Tally company detection and selection UI in Agent settings
- [ ] Stock group fetch and checkbox filter UI in Agent settings
- [ ] Agent-side normalization rules (strip patterns, replace map)
- [ ] `tally.stock.sync` — scheduled sync job with adaptive intervals
- [ ] Chunked sync with session ID + SQLite queue for offline resilience
- [ ] Mutex lock — prevent overlapping sync jobs
- [ ] Sync status tab in Agent settings (history, last sync, Sync Now button)
- [ ] Tally sync progress modal in Agent UI
- [ ] Staging sync API endpoint to verify Agent → Cloud flow end-to-end

### Phase 2 — Partner Platform Foundation (Laravel + Filament)
- [ ] `partner.bytephase.com` project setup
- [ ] Partner registration, login, and dashboard (Filament)
- [ ] `partners`, `partner_inventory`, `partner_locations`, `tally_sync_logs` DB tables
- [ ] Partner sync API endpoint (`POST /api/partner/inventory/sync` + `/sync/complete`)
- [ ] Manual inventory management (add/edit/delete/hide items)
- [ ] Inventory display name editing (mapping layer)
- [ ] Public search with location-based results (nearest suppliers first)
- [ ] Supplier business profile

### Phase 3 — Agent ↔ Partner Platform Linking
- [ ] `bytephase://partner-connect?token=...` deep link flow
- [ ] Partner API key auth in Agent (separate from CRM API key)
- [ ] Agent tray menu updated with Partner Platform section
- [ ] Sync status visible in Supplier Dashboard
- [ ] Partial sync on order — platform queues targeted item refresh job

### Phase 4 — CRM Integration
- [ ] "Find a Part" panel inside BytePhase CRM
- [ ] Real-time inventory search API consumed by CRM
- [ ] In-app order placement from CRM
- [ ] Order status sync back to CRM (optional purchase record)
- [ ] Low-stock alert → direct supplier search link

### Phase 5 — Orders & Notifications
- [ ] Full order lifecycle (placed → confirmed → dispatched → delivered → cancelled)
- [ ] Supplier order inbox with real-time notifications
- [ ] CRM user order tracking
- [ ] WhatsApp/SMS order status updates (via existing Gupshup/Twilio)

### Phase 6 — Agent Auto-Update & Production Hardening
- [ ] `electron-updater` integration with S3 update server
- [ ] Staged rollout (beta → stable channels)
- [ ] No-force-restart guard during active sync/scan
- [ ] Versioned polling API (`/api/agent/v2/poll`)

### Phase 7 — Growth
- [ ] Supplier ratings and reviews
- [ ] Analytics for suppliers (top searched parts, order trends)
- [ ] Bulk inventory import (CSV / Excel) for non-Tally suppliers
- [ ] Item-level visibility toggle (Phase 2 of group filtering)
- [ ] Mobile-friendly supplier interface
- [ ] API for third-party supplier integrations (non-Tally)
