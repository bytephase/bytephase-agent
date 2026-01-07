# BytePhase Agent - Modular Architecture Design

**Version:** 2.0
**Date:** 2026-01-05
**Status:** Design Phase

---

## Table of Contents

1. [Overview](#overview)
2. [Current Problems](#current-problems)
3. [Proposed Solution](#proposed-solution)
4. [Architecture Design](#architecture-design)
5. [Module System](#module-system)
6. [Directory Scanner Module](#directory-scanner-module)
7. [Configuration System](#configuration-system)
8. [Migration Path](#migration-path)
9. [Implementation Guide](#implementation-guide)

---

## Overview

### Current State
The BytePhase Agent is tightly coupled to Tally integration. Adding new features (like directory scanning for recovery businesses) requires significant refactoring.

### Goal
Transform the agent into a **multi-purpose local bridge** that supports:
- ✅ Tally integration (existing)
- ✅ Directory scanning (new - like Snap2HTML)
- ✅ Future modules (file backup, data sync, etc.)

### Key Requirements
1. **Modular**: Easy to add/remove features
2. **Configurable**: Enable only needed modules per shop
3. **Maintainable**: Clean separation of concerns
4. **Backward Compatible**: Existing Tally users shouldn't break

---

## Current Problems

### Problem 1: Tight Coupling
```javascript
// Current structure - Everything assumes Tally
services/
  ├── tally.service.js        // Tally-specific
  ├── polling.service.js      // Hardcoded to Tally jobs
  ├── auth.service.js         // Assumes Tally credentials
  └── queue.service.js        // Mixed Tally + generic logic
```

### Problem 2: Inflexible Job Processing
```javascript
// Current job execution - Only Tally operations
async executeJob(job) {
  switch(job.type) {
    case 'voucher.create':    // Tally only
    case 'ledger.read':       // Tally only
    case 'stock.create':      // Tally only
  }
}
```

### Problem 3: Configuration Limitations
```json
// Current config - Tally-centric
{
  "cloudUrl": "https://...",
  "apiKey": "...",
  "agentId": "...",
  "shopId": "..."
}
```
No way to:
- Enable/disable Tally
- Add directory scanner config
- Manage multiple modules

---

## Proposed Solution

### Modular Plugin Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  BytePhase Agent Core                     │
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │           Core Services (Always Active)            │  │
│  │  • Polling Service (polls cloud for jobs)          │  │
│  │  • Auth Service (API key management)               │  │
│  │  • Queue Service (offline queue)                   │  │
│  │  • Module Manager (loads/manages modules)          │  │
│  │  • IPC Service (communicates with UI)             │  │
│  └────────────────────────────────────────────────────┘  │
│                          ↕                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Module Registry                        │  │
│  │  ┌──────────────┐  ┌──────────────────────────┐   │  │
│  │  │ Tally Module │  │ Directory Scanner Module │   │  │
│  │  │              │  │                          │   │  │
│  │  │ Jobs:        │  │ Jobs:                    │   │  │
│  │  │ • voucher.*  │  │ • scanner.directory.scan │   │  │
│  │  │ • ledger.*   │  │ • scanner.file.preview   │   │  │
│  │  │ • stock.*    │  │ • scanner.export.html    │   │  │
│  │  │              │  │                          │   │  │
│  │  │ Config:      │  │ Config:                  │   │  │
│  │  │ • tallyPort  │  │ • maxDepth               │   │  │
│  │  │ • company    │  │ • includeHidden          │   │  │
│  │  └──────────────┘  └──────────────────────────┘   │  │
│  │                                                     │  │
│  │  ┌──────────────────────────┐                      │  │
│  │  │ Future Modules           │                      │  │
│  │  │ • File Backup Module     │                      │  │
│  │  │ • Data Sync Module       │                      │  │
│  │  │ • Custom Scripts Module  │                      │  │
│  │  └──────────────────────────┘                      │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## Architecture Design

### Core Principles

1. **Separation of Concerns**: Core vs Modules
2. **Loose Coupling**: Modules don't know about each other
3. **Plugin System**: Modules register capabilities
4. **Event-Driven**: Core emits events, modules react

### Directory Structure

```
bytephase-agent/
├── index.js                          # Main Electron process
├── package.json
│
├── core/                             # ← NEW: Core framework
│   ├── module-manager.js             # Manages modules lifecycle
│   ├── job-router.js                 # Routes jobs to correct module
│   ├── event-bus.js                  # Inter-module communication
│   └── base-module.js                # Base class for modules
│
├── services/                         # Core services (refactored)
│   ├── polling.service.js            # Generic polling (no Tally logic)
│   ├── auth.service.js               # Generic auth
│   ├── queue.service.js              # Generic queue
│   └── ipc.service.js                # UI communication
│
├── modules/                          # ← NEW: All modules here
│   ├── tally/                        # Tally module (refactored)
│   │   ├── index.js                  # Module entry point
│   │   ├── tally.service.js          # Tally operations
│   │   ├── xml-builder.js
│   │   ├── xml-parser.js
│   │   └── config.json               # Module config
│   │
│   ├── directory-scanner/            # ← NEW: Directory scanner
│   │   ├── index.js                  # Module entry point
│   │   ├── scanner.service.js        # Directory scanning logic
│   │   ├── tree-builder.js           # Build directory tree
│   │   ├── html-generator.js         # Generate Snap2HTML-like output
│   │   └── config.json               # Module config
│   │
│   └── [future-modules]/
│
├── ui/
│   ├── settings.html                 # Enhanced UI
│   ├── modules.html                  # ← NEW: Module management UI
│   ├── directory-picker.html         # ← NEW: Directory selection UI
│   ├── renderer.js
│   └── styles.css
│
└── config/
    └── agent.config.json             # Enhanced config
```

---

## Module System

### Base Module Interface

```javascript
// core/base-module.js
class BaseModule {
  constructor() {
    this.name = '';
    this.version = '1.0.0';
    this.enabled = false;
    this.config = {};
  }

  // Lifecycle hooks
  async initialize() {}
  async activate() {}
  async deactivate() {}
  async destroy() {}

  // Job handling
  canHandle(jobType) { return false; }
  async execute(job) { throw new Error('Not implemented'); }

  // Configuration
  getConfigSchema() { return {}; }
  validateConfig(config) { return true; }

  // UI integration
  hasUI() { return false; }
  getUIComponent() { return null; }
}

module.exports = BaseModule;
```

### Module Manager

```javascript
// core/module-manager.js
const EventEmitter = require('events');

class ModuleManager extends EventEmitter {
  constructor() {
    super();
    this.modules = new Map();
    this.enabledModules = new Set();
  }

  /**
   * Register a module
   */
  register(moduleClass) {
    const module = new moduleClass();

    console.log(`[MODULE] Registering: ${module.name}`);

    this.modules.set(module.name, module);
    this.emit('module:registered', module.name);
  }

  /**
   * Load all modules from /modules directory
   */
  async loadAll() {
    const moduleDirs = fs.readdirSync(path.join(__dirname, '../modules'));

    for (const dir of moduleDirs) {
      const modulePath = path.join(__dirname, '../modules', dir, 'index.js');

      if (fs.existsSync(modulePath)) {
        const ModuleClass = require(modulePath);
        this.register(ModuleClass);
      }
    }
  }

  /**
   * Enable a module
   */
  async enable(moduleName) {
    const module = this.modules.get(moduleName);

    if (!module) {
      throw new Error(`Module not found: ${moduleName}`);
    }

    if (this.enabledModules.has(moduleName)) {
      console.log(`[MODULE] Already enabled: ${moduleName}`);
      return;
    }

    console.log(`[MODULE] Enabling: ${moduleName}`);

    await module.initialize();
    await module.activate();

    this.enabledModules.add(moduleName);
    module.enabled = true;

    this.emit('module:enabled', moduleName);
  }

  /**
   * Disable a module
   */
  async disable(moduleName) {
    const module = this.modules.get(moduleName);

    if (!module) return;

    console.log(`[MODULE] Disabling: ${moduleName}`);

    await module.deactivate();

    this.enabledModules.delete(moduleName);
    module.enabled = false;

    this.emit('module:disabled', moduleName);
  }

  /**
   * Find module that can handle a job
   */
  findHandler(jobType) {
    for (const [name, module] of this.modules) {
      if (module.enabled && module.canHandle(jobType)) {
        return module;
      }
    }
    return null;
  }

  /**
   * Execute a job
   */
  async executeJob(job) {
    const handler = this.findHandler(job.type);

    if (!handler) {
      throw new Error(`No module can handle job type: ${job.type}`);
    }

    console.log(`[MODULE] Executing ${job.type} with ${handler.name}`);

    return await handler.execute(job);
  }

  /**
   * Get all modules (for UI display)
   */
  getAll() {
    return Array.from(this.modules.values()).map(m => ({
      name: m.name,
      version: m.version,
      enabled: m.enabled,
      config: m.config,
      hasUI: m.hasUI()
    }));
  }
}

module.exports = new ModuleManager();
```

### Job Router

```javascript
// core/job-router.js
const moduleManager = require('./module-manager');

class JobRouter {
  /**
   * Route job to appropriate module
   */
  async route(job) {
    try {
      const result = await moduleManager.executeJob(job);

      return {
        success: true,
        result: result
      };
    } catch (error) {
      console.error('[ROUTER] Job execution failed:', error);

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if any module can handle this job type
   */
  canHandle(jobType) {
    return moduleManager.findHandler(jobType) !== null;
  }
}

module.exports = new JobRouter();
```

---

## Directory Scanner Module

### Module Implementation

```javascript
// modules/directory-scanner/index.js
const BaseModule = require('../../core/base-module');
const ScannerService = require('./scanner.service');
const TreeBuilder = require('./tree-builder');
const HtmlGenerator = require('./html-generator');
const { dialog } = require('electron');

class DirectoryScannerModule extends BaseModule {
  constructor() {
    super();
    this.name = 'directory-scanner';
    this.version = '1.0.0';
    this.config = {
      maxDepth: 10,
      includeHidden: false,
      maxFileSize: 1024 * 1024 * 100, // 100MB max per file
      excludePatterns: ['node_modules', '.git', 'Thumbs.db']
    };
  }

  async initialize() {
    console.log('[SCANNER] Initializing directory scanner module...');
    this.scanner = new ScannerService(this.config);
  }

  async activate() {
    console.log('[SCANNER] Directory scanner activated');
  }

  canHandle(jobType) {
    return jobType.startsWith('scanner.');
  }

  async execute(job) {
    switch(job.type) {
      case 'scanner.directory.select':
        return await this.selectDirectory(job);

      case 'scanner.directory.scan':
        return await this.scanDirectory(job);

      case 'scanner.export.html':
        return await this.exportToHtml(job);

      case 'scanner.export.json':
        return await this.exportToJson(job);

      default:
        throw new Error(`Unknown scanner job type: ${job.type}`);
    }
  }

  /**
   * Show directory picker dialog
   */
  async selectDirectory(job) {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: job.payload.title || 'Select Directory to Scan',
      message: job.payload.message || 'Choose a directory for data recovery scanning'
    });

    if (result.canceled) {
      return { canceled: true };
    }

    const selectedPath = result.filePaths[0];

    // Return basic info without scanning yet
    return {
      canceled: false,
      path: selectedPath,
      name: path.basename(selectedPath)
    };
  }

  /**
   * Scan directory structure
   */
  async scanDirectory(job) {
    const { directoryPath, options = {} } = job.payload;

    console.log(`[SCANNER] Scanning directory: ${directoryPath}`);

    const scanOptions = {
      ...this.config,
      ...options
    };

    // Build directory tree
    const tree = await this.scanner.scan(directoryPath, scanOptions);

    return {
      path: directoryPath,
      scannedAt: new Date().toISOString(),
      tree: tree,
      statistics: this.scanner.getStatistics(),
      options: scanOptions
    };
  }

  /**
   * Export to HTML (Snap2HTML-like)
   */
  async exportToHtml(job) {
    const { tree, outputPath } = job.payload;

    console.log('[SCANNER] Generating HTML snapshot...');

    const html = await HtmlGenerator.generate(tree);

    if (outputPath) {
      fs.writeFileSync(outputPath, html);
    }

    return {
      html: outputPath ? null : html,
      htmlPath: outputPath,
      size: Buffer.byteLength(html, 'utf8')
    };
  }

  /**
   * Export to JSON
   */
  async exportToJson(job) {
    const { tree } = job.payload;

    return {
      json: tree,
      size: JSON.stringify(tree).length
    };
  }

  hasUI() {
    return true;
  }

  getConfigSchema() {
    return {
      maxDepth: { type: 'number', default: 10, min: 1, max: 50 },
      includeHidden: { type: 'boolean', default: false },
      maxFileSize: { type: 'number', default: 104857600 },
      excludePatterns: { type: 'array', default: ['node_modules', '.git'] }
    };
  }
}

module.exports = DirectoryScannerModule;
```

### Scanner Service

```javascript
// modules/directory-scanner/scanner.service.js
const fs = require('fs').promises;
const path = require('path');

class ScannerService {
  constructor(config) {
    this.config = config;
    this.stats = {
      totalFiles: 0,
      totalFolders: 0,
      totalSize: 0,
      scannedDepth: 0,
      errors: 0
    };
  }

  /**
   * Scan directory recursively
   */
  async scan(dirPath, options = {}, depth = 0) {
    const maxDepth = options.maxDepth || this.config.maxDepth;
    const includeHidden = options.includeHidden || this.config.includeHidden;

    if (depth > maxDepth) {
      return null;
    }

    this.stats.scannedDepth = Math.max(this.stats.scannedDepth, depth);

    try {
      const stat = await fs.stat(dirPath);
      const name = path.basename(dirPath);

      // Skip hidden files/folders
      if (!includeHidden && name.startsWith('.')) {
        return null;
      }

      // Skip excluded patterns
      if (this.isExcluded(name)) {
        return null;
      }

      const node = {
        name: name,
        path: dirPath,
        type: stat.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modified: stat.mtime,
        created: stat.birthtime,
        depth: depth
      };

      if (stat.isDirectory()) {
        this.stats.totalFolders++;

        const entries = await fs.readdir(dirPath);
        const children = [];

        for (const entry of entries) {
          const childPath = path.join(dirPath, entry);
          const childNode = await this.scan(childPath, options, depth + 1);

          if (childNode) {
            children.push(childNode);
          }
        }

        node.children = children;
        node.childCount = children.length;

      } else {
        this.stats.totalFiles++;
        this.stats.totalSize += stat.size;

        // Add file extension
        node.extension = path.extname(name).toLowerCase();
      }

      return node;

    } catch (error) {
      this.stats.errors++;
      console.error(`[SCANNER] Error scanning ${dirPath}:`, error.message);
      return null;
    }
  }

  /**
   * Check if path matches exclusion patterns
   */
  isExcluded(name) {
    const excludePatterns = this.config.excludePatterns || [];
    return excludePatterns.some(pattern => name.includes(pattern));
  }

  /**
   * Get scan statistics
   */
  getStatistics() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStatistics() {
    this.stats = {
      totalFiles: 0,
      totalFolders: 0,
      totalSize: 0,
      scannedDepth: 0,
      errors: 0
    };
  }
}

module.exports = ScannerService;
```

### HTML Generator (Snap2HTML-like)

```javascript
// modules/directory-scanner/html-generator.js
class HtmlGenerator {
  static generate(tree) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Directory Snapshot - ${tree.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #f5f5f5;
      padding: 20px;
    }
    .header {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header h1 { color: #2563eb; margin-bottom: 10px; }
    .stats { display: flex; gap: 20px; margin-top: 15px; }
    .stat {
      background: #f0f9ff;
      padding: 10px 15px;
      border-radius: 6px;
      border-left: 3px solid #2563eb;
    }
    .stat-label { font-size: 12px; color: #64748b; }
    .stat-value { font-size: 20px; font-weight: bold; color: #1e293b; }

    .tree-container {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .tree { font-family: 'Courier New', monospace; font-size: 14px; }
    .tree-item {
      padding: 4px 0;
      cursor: pointer;
      transition: background 0.2s;
    }
    .tree-item:hover { background: #f0f9ff; }
    .tree-item.directory { color: #2563eb; font-weight: 500; }
    .tree-item.file { color: #475569; }
    .indent { display: inline-block; width: 20px; }
    .icon { margin-right: 8px; }
    .size {
      color: #94a3b8;
      margin-left: 10px;
      font-size: 12px;
    }
    .search {
      margin-bottom: 15px;
      width: 100%;
      padding: 12px;
      border: 2px solid #e2e8f0;
      border-radius: 6px;
      font-size: 14px;
    }
    .search:focus {
      outline: none;
      border-color: #2563eb;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📁 Directory Snapshot</h1>
    <p><strong>Path:</strong> ${tree.path}</p>
    <p><strong>Scanned:</strong> ${new Date().toLocaleString()}</p>
    <div class="stats">
      <div class="stat">
        <div class="stat-label">Total Files</div>
        <div class="stat-value" id="total-files">0</div>
      </div>
      <div class="stat">
        <div class="stat-label">Total Folders</div>
        <div class="stat-value" id="total-folders">0</div>
      </div>
      <div class="stat">
        <div class="stat-label">Total Size</div>
        <div class="stat-value" id="total-size">0 MB</div>
      </div>
    </div>
  </div>

  <div class="tree-container">
    <input type="text" class="search" id="search" placeholder="🔍 Search files and folders...">
    <div class="tree" id="tree"></div>
  </div>

  <script>
    const treeData = ${JSON.stringify(tree, null, 2)};

    let stats = {
      files: 0,
      folders: 0,
      size: 0
    };

    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function renderTree(node, parentElement, depth = 0) {
      const indent = '&nbsp;'.repeat(depth * 4);
      const icon = node.type === 'directory' ? '📁' : '📄';
      const className = node.type === 'directory' ? 'directory' : 'file';
      const size = node.type === 'file' ? \`<span class="size">\${formatSize(node.size)}</span>\` : '';

      if (node.type === 'directory') {
        stats.folders++;
      } else {
        stats.files++;
        stats.size += node.size;
      }

      const item = document.createElement('div');
      item.className = \`tree-item \${className}\`;
      item.innerHTML = \`\${indent}<span class="icon">\${icon}</span>\${node.name}\${size}\`;
      item.dataset.path = node.path;
      parentElement.appendChild(item);

      if (node.children) {
        const childContainer = document.createElement('div');
        childContainer.className = 'children';

        node.children.forEach(child => {
          renderTree(child, childContainer, depth + 1);
        });

        parentElement.appendChild(childContainer);

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          childContainer.style.display = childContainer.style.display === 'none' ? 'block' : 'none';
        });
      }
    }

    // Render tree
    const treeContainer = document.getElementById('tree');
    renderTree(treeData, treeContainer);

    // Update stats
    document.getElementById('total-files').textContent = stats.files.toLocaleString();
    document.getElementById('total-folders').textContent = stats.folders.toLocaleString();
    document.getElementById('total-size').textContent = formatSize(stats.size);

    // Search functionality
    document.getElementById('search').addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const items = document.querySelectorAll('.tree-item');

      items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(query) ? 'block' : 'none';
      });
    });
  </script>
</body>
</html>
    `.trim();

    return html;
  }
}

module.exports = HtmlGenerator;
```

---

## Configuration System

### Enhanced Agent Config

```json
{
  "version": "2.0",
  "agent": {
    "id": "agent_shop_001",
    "shopId": "shop_123",
    "cloudUrl": "https://tally-api.yourcompany.com",
    "apiKey": "your-api-key-here",
    "pollInterval": 30000
  },
  "modules": {
    "tally": {
      "enabled": true,
      "config": {
        "tallyPort": 9000,
        "tallyCompany": "My Company",
        "autoDetectVersion": true
      }
    },
    "directory-scanner": {
      "enabled": true,
      "config": {
        "maxDepth": 10,
        "includeHidden": false,
        "maxFileSize": 104857600,
        "excludePatterns": ["node_modules", ".git", "Thumbs.db", "$RECYCLE.BIN"]
      }
    }
  }
}
```

---

## Migration Path

### Step 1: Refactor Core (Week 1)
```
✓ Create core/ directory
✓ Build ModuleManager
✓ Build JobRouter
✓ Update PollingService to be module-agnostic
✓ Update AuthService
```

### Step 2: Convert Tally to Module (Week 1)
```
✓ Move services/tally.service.js → modules/tally/
✓ Move tally/* → modules/tally/
✓ Create modules/tally/index.js (implements BaseModule)
✓ Test backward compatibility
```

### Step 3: Build Directory Scanner (Week 2)
```
✓ Create modules/directory-scanner/
✓ Implement scanner.service.js
✓ Build HTML generator
✓ Add directory picker UI
✓ Test scanning large directories
```

### Step 4: Update UI (Week 2)
```
✓ Add module management UI
✓ Add directory picker dialog
✓ Show scan progress
✓ Display results preview
```

### Step 5: Testing & Deployment (Week 3)
```
✓ Test all modules independently
✓ Test module enable/disable
✓ Test large directory scans (1M+ files)
✓ Update documentation
✓ Build installers
```

---

## Implementation Guide

### Quick Start: Adding Directory Scanner

1. **Install the modular system** (I'll provide refactoring scripts)
2. **Add Directory Scanner module** (copy from above)
3. **Update UI** for directory selection
4. **Test locally**

### Data Flow: Directory Scan Job

```
BytePhase Cloud (Recovery Job)
    ↓
Laravel API creates job:
{
  "type": "scanner.directory.select",
  "payload": {
    "title": "Select recovered data directory",
    "jobId": "recovery_job_123"
  }
}
    ↓
Agent polls, receives job
    ↓
ModuleManager routes to DirectoryScanner
    ↓
Shows native directory picker dialog
    ↓
User selects directory: "/Volumes/RecoveredData"
    ↓
Agent reports selection:
{
  "jobId": "recovery_job_123",
  "result": {
    "path": "/Volumes/RecoveredData",
    "canceled": false
  }
}
    ↓
Laravel creates second job:
{
  "type": "scanner.directory.scan",
  "payload": {
    "directoryPath": "/Volumes/RecoveredData",
    "options": { "maxDepth": 5 }
  }
}
    ↓
Agent scans directory (may take minutes for large dirs)
    ↓
Agent reports tree structure:
{
  "tree": { /* full directory tree */ },
  "statistics": {
    "totalFiles": 15847,
    "totalFolders": 1203,
    "totalSize": 45893234567
  }
}
    ↓
BytePhase Cloud displays tree to user
User verifies recovered data ✅
```

---

## Benefits of This Architecture

### 1. Flexibility
- Enable only needed modules per shop
- Easy to add new features
- No breaking changes to existing functionality

### 2. Maintainability
- Clean separation of concerns
- Each module is independent
- Easy to debug and test

### 3. Scalability
- Modules can be loaded dynamically
- Can distribute modules as separate packages
- Easy to update individual modules

### 4. Reusability
- Core services shared across modules
- Consistent job handling
- Standard configuration pattern

---

## Next Steps

1. Review this architecture
2. Approve the approach
3. I'll refactor the agent to support modules
4. Build the Directory Scanner module
5. Test with BytePhase integration

---

**Questions?**
- Should we support remote directory scanning (network drives)?
- Max directory depth limit? (default: 10 levels)
- Should HTML snapshot be generated client-side or server-side?
- Any specific file metadata needed (permissions, hashes)?
