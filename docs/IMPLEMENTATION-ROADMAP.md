# Implementation Roadmap - Modular Agent v2.0

## 🎯 Overview

Transform BytePhase Agent from Tally-only to multi-purpose modular system with Directory Scanner support.

---

## 📊 Comparison: Before vs After

### BEFORE (v1.0) - Tally Only
```
❌ Tightly coupled to Tally
❌ Hard to add new features
❌ Single-purpose agent
❌ Tally-specific configuration

Services:
├── tally.service.js      (Tally logic)
├── polling.service.js    (hardcoded Tally)
├── auth.service.js       (Tally auth)
└── queue.service.js

Jobs Supported:
✓ voucher.create
✓ ledger.read
✓ stock.create
```

### AFTER (v2.0) - Modular System
```
✅ Plugin-based architecture
✅ Easy to add modules
✅ Multi-purpose agent
✅ Module-specific configs

Core:
├── module-manager.js     (manages all modules)
├── job-router.js         (routes to modules)
└── base-module.js        (module interface)

Modules:
├── tally/                (Tally integration)
└── directory-scanner/    (NEW: Directory scanning)

Jobs Supported:
✓ tally.voucher.create
✓ tally.ledger.read
✓ scanner.directory.scan    ← NEW
✓ scanner.export.html       ← NEW
✓ [future modules...]
```

---

## 🚀 Implementation Options

### Option A: Full Refactor (Recommended)
**Time:** 3-4 days
**Pros:** Clean architecture, future-proof, best practices
**Cons:** More work upfront

**Steps:**
1. Build core module system
2. Refactor Tally into module
3. Build Directory Scanner module
4. Update UI for modules
5. Test everything

### Option B: Hybrid Approach
**Time:** 2-3 days
**Pros:** Faster, keeps existing code mostly intact
**Cons:** Some technical debt remains

**Steps:**
1. Add minimal module layer
2. Keep Tally code as-is
3. Add Directory Scanner alongside
4. Update UI for directory picker
5. Test integration

### Option C: Directory Scanner Only (Quick)
**Time:** 1-2 days
**Pros:** Fastest, solves immediate need
**Cons:** Will need refactor later

**Steps:**
1. Add directory scanner to existing services/
2. Add job types for scanner
3. Add UI for directory picker
4. Test and deploy

---

## 📅 Recommended Plan: Option A (Full Refactor)

### Week 1: Core System + Tally Module

#### Day 1-2: Core Framework
- [ ] Create `core/` directory structure
- [ ] Implement `BaseModule` class
- [ ] Implement `ModuleManager`
- [ ] Implement `JobRouter`
- [ ] Update `PollingService` to use JobRouter
- [ ] Update config system for modules

#### Day 3-4: Tally Module Conversion
- [ ] Create `modules/tally/` directory
- [ ] Move Tally code to module
- [ ] Create `TallyModule` class (extends BaseModule)
- [ ] Test Tally functionality (ensure backward compatibility)
- [ ] Update existing config to new format

#### Day 5: Testing
- [ ] Test module enable/disable
- [ ] Test Tally operations still work
- [ ] Verify backward compatibility
- [ ] Update documentation

### Week 2: Directory Scanner + UI

#### Day 6-7: Directory Scanner Module
- [ ] Create `modules/directory-scanner/`
- [ ] Implement `ScannerService` (directory scanning)
- [ ] Implement `TreeBuilder` (directory tree structure)
- [ ] Implement `HtmlGenerator` (Snap2HTML-like output)
- [ ] Test with small directories

#### Day 8: Large Directory Support
- [ ] Add streaming for large directories
- [ ] Add progress reporting
- [ ] Test with 100K+ files
- [ ] Optimize memory usage

#### Day 9-10: UI Updates
- [ ] Add module management UI
- [ ] Add directory picker dialog
- [ ] Add scan progress display
- [ ] Add result preview
- [ ] Test user flows

### Week 3: Integration + Deployment

#### Day 11-12: BytePhase Integration
- [ ] Update Laravel API for scanner jobs
- [ ] Test full flow: Cloud → Agent → Scan → Cloud
- [ ] Handle large result uploads
- [ ] Add error handling

#### Day 13-14: Testing + Documentation
- [ ] End-to-end testing
- [ ] Performance testing
- [ ] Update all documentation
- [ ] Create migration guide

#### Day 15: Deployment
- [ ] Build installers (Windows, Mac, Linux)
- [ ] Test installations
- [ ] Deploy to staging
- [ ] Production release

---

## 💻 Code Changes Summary

### Files to Create (NEW)
```
core/
├── base-module.js              # Base class for modules
├── module-manager.js           # Module lifecycle manager
├── job-router.js               # Routes jobs to modules
└── event-bus.js                # Inter-module communication

modules/
├── tally/
│   └── index.js                # Tally module entry
└── directory-scanner/
    ├── index.js                # Scanner module entry
    ├── scanner.service.js      # Directory scanning logic
    ├── tree-builder.js         # Build directory tree
    └── html-generator.js       # Generate HTML output

ui/
├── modules.html                # Module management UI
└── directory-picker.html       # Directory selection UI
```

### Files to Modify (REFACTOR)
```
index.js                        # Load modules on startup
services/
├── polling.service.js          # Use JobRouter instead of TallyService
└── auth.service.js             # Support module configs

config/
└── agent.config.json           # Add modules section
```

### Files to Move (MIGRATION)
```
services/tally.service.js       → modules/tally/tally.service.js
tally/*                         → modules/tally/
```

---

## 🔧 Technical Decisions

### 1. Job Type Naming Convention
```javascript
// OLD (v1.0)
'voucher.create'
'ledger.read'

// NEW (v2.0)
'tally.voucher.create'       // Prefixed with module name
'tally.ledger.read'
'scanner.directory.scan'
'scanner.export.html'
```

### 2. Configuration Structure
```json
{
  "version": "2.0",
  "agent": {
    "id": "...",
    "shopId": "...",
    "apiKey": "..."
  },
  "modules": {
    "tally": {
      "enabled": true,
      "config": { ... }
    },
    "directory-scanner": {
      "enabled": true,
      "config": { ... }
    }
  }
}
```

### 3. Module Communication
- Modules DON'T communicate directly
- Use EventBus for inter-module events
- Core services are shared (auth, queue, polling)

### 4. Backward Compatibility
- Support old job types for 6 months
- Auto-prefix with 'tally.' if no prefix
- Migration warnings in logs

---

## 📦 Package Dependencies (NEW)

```json
{
  "dependencies": {
    "fast-folder-size": "^2.0.0",     // Fast directory size calculation
    "glob": "^10.0.0",                 // Pattern matching
    "mime-types": "^2.1.35",           // File type detection
    "node-stream-zip": "^1.15.0"       // Optional: ZIP export
  }
}
```

---

## 🧪 Testing Strategy

### Unit Tests
```javascript
// Test ModuleManager
✓ Register module
✓ Enable/disable module
✓ Find handler for job type
✓ Execute job

// Test DirectoryScanner
✓ Scan small directory (< 100 files)
✓ Scan large directory (> 10K files)
✓ Handle permission errors
✓ Respect max depth
✓ Exclude patterns work
✓ Generate HTML output
```

### Integration Tests
```javascript
// Test full flow
✓ BytePhase creates scan job
✓ Agent receives job
✓ User selects directory
✓ Agent scans and reports
✓ BytePhase receives tree
✓ User views snapshot
```

### Performance Tests
```javascript
// Benchmark
✓ 10K files: < 5 seconds
✓ 100K files: < 30 seconds
✓ 1M files: < 5 minutes
✓ Memory usage: < 500MB for 100K files
```

---

## 🎨 UI Mockups

### Module Management Screen
```
┌─────────────────────────────────────────────┐
│  BytePhase Agent - Modules                  │
├─────────────────────────────────────────────┤
│                                             │
│  Available Modules:                         │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ ✅ Tally Integration                  │ │
│  │    Status: Active                     │ │
│  │    [Configure] [Disable]              │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ ✅ Directory Scanner                  │ │
│  │    Status: Active                     │ │
│  │    [Configure] [Disable]              │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ ⭕ File Backup (Coming Soon)          │ │
│  │    Status: Not Installed              │ │
│  └───────────────────────────────────────┘ │
│                                             │
└─────────────────────────────────────────────┘
```

### Directory Picker Dialog
```
┌─────────────────────────────────────────────┐
│  Select Directory to Scan                   │
├─────────────────────────────────────────────┤
│                                             │
│  Recovery Job: #12345                       │
│  Customer: John Doe                         │
│                                             │
│  Please select the recovered data folder:   │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │ 📁 /Volumes/RecoveredData           │   │
│  │   └── 📁 Documents                  │   │
│  │   └── 📁 Photos                     │   │
│  │   └── 📁 Videos                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  [Browse...] [Cancel] [Scan Directory]      │
│                                             │
└─────────────────────────────────────────────┘
```

### Scan Progress
```
┌─────────────────────────────────────────────┐
│  Scanning Directory...                      │
├─────────────────────────────────────────────┤
│                                             │
│  📁 /Volumes/RecoveredData                  │
│                                             │
│  Progress: [████████░░░░░░░░░░] 45%        │
│                                             │
│  Files scanned: 15,847                      │
│  Folders scanned: 1,203                     │
│  Total size: 43.5 GB                        │
│                                             │
│  Current: /Photos/2023/IMG_1234.jpg         │
│                                             │
│  [Cancel]                                   │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 🔐 Security Considerations

### Directory Scanning Permissions
- Agent runs with user permissions
- Can only access directories user can access
- Respect system file permissions
- No elevation required

### Data Privacy
- Directory tree stays local until user confirms
- Option to exclude sensitive folders
- SHA-256 hash option for file verification (optional)
- GDPR-compliant data handling

### Upload Limits
- Large trees (> 10MB JSON) should be compressed
- Option to upload to S3/CDN instead of API
- Chunk large uploads
- Progress reporting

---

## 📈 Success Metrics

### Technical Metrics
- ✅ Module system working
- ✅ Backward compatibility maintained
- ✅ Can scan 100K files in < 30 seconds
- ✅ Memory usage < 500MB during scan
- ✅ No crashes on permission errors

### Business Metrics
- ✅ Recovery shops can verify data
- ✅ Reduces manual verification time by 80%
- ✅ Increases customer trust
- ✅ Reduces support calls

---

## 🎓 Developer Guide

### How to Add a New Module

1. **Create module directory:**
```bash
mkdir -p modules/my-module
```

2. **Create index.js:**
```javascript
const BaseModule = require('../../core/base-module');

class MyModule extends BaseModule {
  constructor() {
    super();
    this.name = 'my-module';
    this.version = '1.0.0';
  }

  canHandle(jobType) {
    return jobType.startsWith('mymodule.');
  }

  async execute(job) {
    // Your logic here
  }
}

module.exports = MyModule;
```

3. **Module auto-loads on startup!**

---

## 💡 Future Module Ideas

1. **File Backup Module**
   - Backup specific files to cloud
   - Incremental backups
   - Restore functionality

2. **Data Sync Module**
   - Sync folders between computers
   - Conflict resolution
   - Two-way sync

3. **Database Backup Module**
   - Backup MySQL/PostgreSQL/SQLite
   - Scheduled backups
   - Restore functionality

4. **Screenshot Module**
   - Take screenshots on demand
   - Screen recording
   - Send to cloud for support

5. **System Info Module**
   - Hardware info
   - Software inventory
   - Health monitoring

---

## 📞 Next Actions

### For You (Client)
1. ✅ Review architecture document
2. ✅ Approve approach (Option A/B/C)
3. ✅ Answer questions below
4. ✅ Provide feedback

### For Me (Developer)
1. ⏳ Await approval
2. ⏳ Start refactoring (Option A)
3. ⏳ Build Directory Scanner
4. ⏳ Test and deploy

---

## ❓ Questions for You

1. **Approach:** Option A (full refactor), B (hybrid), or C (quick)?
2. **Max Directory Depth:** Default 10 levels, or different?
3. **File Metadata:** Just name/size/date, or also permissions/hashes?
4. **Large Directories:** How to handle 1M+ files? (Stream, limit, paginate?)
5. **HTML Export:** Generate client-side or server-side?
6. **Network Drives:** Support scanning network/remote drives?
7. **Exclude Patterns:** Default exclusions look good? Add more?
8. **Upload Strategy:** Direct to API or S3/CDN for large results?
9. **Progress Updates:** Real-time progress to cloud, or only final result?
10. **Timeline:** When do you need this feature in production?

---

**Ready to proceed?** Let me know which option you prefer and I'll start building! 🚀
