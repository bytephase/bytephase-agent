/**
 * Tally Module - Integrates with Tally ERP software
 *
 * Handles all Tally-related operations:
 * - Vouchers (create, read)
 * - Ledgers (create, read)
 * - Stock items (create, read, sync)
 * - Reports (generate)
 * - Inventory sync to cloud platform
 */

const BaseModule = require('../../core/base-module');
const TallyService = require('./tally.service');
const TallySyncService = require('./sync.service');
const SyncScheduler = require('./sync-scheduler');
const queueService = require('../../services/queue.service');

class TallyModule extends BaseModule {
  constructor() {
    super();

    this.name = 'tally';
    this.version = '1.0.0';
    this.description = 'Tally ERP integration module';

    this.config = {
      tallyHost: 'localhost',
      tallyPort: 9000,
      tallyCompany: null,
      autoDetectVersion: true,
      timeout: 10000,
      // Sync config
      selectedCompany: null,
      syncGroups: [],
      excludedItems: [],
      syncIntervalMinutes: 30,
      offHoursIntervalMinutes: 120,
      offHoursStart: '20:00',
      offHoursEnd: '09:00',
      fullSyncTime: '02:00',
      dryRun: true
    };

    this.tallyService = null;
    this.syncService = null;
    this.scheduler = null;
  }

  /**
   * Sync stats backed by SQLite state
   */
  get syncStats() {
    const status = this.syncService ? this.syncService.getStatus() : {};
    const history = queueService.getSyncHistory ? queueService.getSyncHistory(10) : [];

    return {
      lastSyncTime: status.lastDeltaSyncAt || status.lastFullSyncAt || null,
      lastDeltaSyncTime: status.lastDeltaSyncAt || null,
      lastFullSyncTime: status.lastFullSyncAt || null,
      totalItemsSynced: history.length > 0 ? history[0].items_synced || 0 : 0,
      syncStatus: status.syncStatus || 'idle',
      consecutiveFailures: status.consecutiveFailures || 0,
      isSyncing: status.isSyncing || false,
      syncHistory: history.map(s => ({
        id: s.id,
        timestamp: s.started_at,
        completedAt: s.completed_at,
        status: s.status,
        syncType: s.sync_type,
        itemCount: s.total_items,
        itemsSynced: s.items_synced,
        error: s.error,
        duration: s.completed_at ? s.completed_at - s.started_at : null
      }))
    };
  }

  async initialize() {
    await super.initialize();

    console.log('[TALLY] Initializing Tally module...');

    // Create Tally service instance with config
    this.tallyService = new TallyService(this.config);

    // Create sync service
    this.syncService = new TallySyncService(this.tallyService, this.config);

    // Create scheduler
    this.scheduler = new SyncScheduler(this.syncService, this.config);

    this.initialized = true;
  }

  async activate() {
    await super.activate();

    console.log('[TALLY] Tally module activated');

    // Test Tally connection
    try {
      const isRunning = await this.tallyService.isRunning();

      if (isRunning) {
        const version = await this.tallyService.getVersion();
        const company = await this.tallyService.getCompanyName();

        console.log(`[TALLY] Connected to Tally ${version} - Company: ${company}`);
      } else {
        console.warn('[TALLY] Tally is not currently running');
      }
    } catch (error) {
      console.warn('[TALLY] Could not connect to Tally:', error.message);
    }

    // Resume any incomplete sync sessions
    try {
      await this.syncService.resumeIncompleteSession();
    } catch (error) {
      console.warn('[TALLY] Error resuming sync sessions:', error.message);
    }

    // Start scheduler if a company is selected
    if (this.config.selectedCompany) {
      this.scheduler.start();
    }

    this.active = true;
  }

  async deactivate() {
    await super.deactivate();

    // Stop scheduler
    if (this.scheduler) {
      this.scheduler.stop();
    }

    // Cancel running sync
    if (this.syncService) {
      this.syncService.abort();
    }

    console.log('[TALLY] Tally module deactivated');
    this.active = false;
  }

  /**
   * Check if this module can handle the job
   */
  canHandle(jobType) {
    // Handle both old format (voucher.create) and new format (tally.voucher.create)
    if (jobType.startsWith('tally.')) {
      return true;
    }

    // Backward compatibility: support old job types without prefix
    const oldFormats = [
      'voucher.create',
      'voucher.read',
      'ledger.create',
      'ledger.read',
      'stock.create',
      'stock.read',
      'report.generate'
    ];

    return oldFormats.includes(jobType);
  }

  /**
   * Execute a Tally job
   */
  async execute(job) {
    console.log(`[TALLY] Executing job: ${job.type}`);

    // Normalize job type (remove 'tally.' prefix if present)
    const normalizedType = job.type.replace(/^tally\./, '');

    // Route to appropriate handler
    switch (normalizedType) {
      case 'voucher.create':
        return await this.tallyService.createVoucher(job.payload);

      case 'voucher.read':
        return await this.tallyService.readVoucher(job.payload);

      case 'ledger.create':
        return await this.tallyService.createLedger(job.payload);

      case 'ledger.read':
        return await this.tallyService.readLedgers(job.payload);

      case 'stock.create':
        return await this.tallyService.createStockItem(job.payload);

      case 'stock.read':
        return await this.tallyService.readStockItems(job.payload);

      case 'report.generate':
        return await this.tallyService.generateReport(job.payload);

      case 'company.detect':
        return await this.tallyService.listCompanies();

      case 'groups.fetch':
        return await this.tallyService.listStockGroups(
          job.payload?.companyName || this.config.selectedCompany
        );

      case 'stock.sync.delta':
        return await this.syncService.executeDeltaSync(
          job.payload?.companyName || this.config.selectedCompany,
          job.payload?.syncGroups || this.config.syncGroups
        );

      case 'stock.sync.full':
        return await this.syncService.executeFullSync(
          job.payload?.companyName || this.config.selectedCompany,
          job.payload?.syncGroups || this.config.syncGroups
        );

      case 'stock.sync.partial':
        return await this.syncService.executePartialSync(
          job.payload?.companyName || this.config.selectedCompany,
          job.payload?.itemNames || []
        );

      default:
        throw new Error(`Unknown Tally job type: ${normalizedType}`);
    }
  }

  /**
   * Get configuration schema
   */
  getConfigSchema() {
    return {
      tallyHost: {
        type: 'string',
        default: 'localhost',
        description: 'Tally server hostname'
      },
      tallyPort: {
        type: 'number',
        default: 9000,
        min: 1,
        max: 65535,
        description: 'Tally XML API port'
      },
      tallyCompany: {
        type: 'string',
        default: null,
        description: 'Tally company name (optional)'
      },
      autoDetectVersion: {
        type: 'boolean',
        default: true,
        description: 'Auto-detect Tally version'
      },
      timeout: {
        type: 'number',
        default: 10000,
        min: 1000,
        max: 60000,
        description: 'Request timeout in milliseconds'
      },
      selectedCompany: {
        type: 'string',
        default: null,
        description: 'Selected Tally company for inventory sync'
      },
      syncGroups: {
        type: 'array',
        default: [],
        description: 'Stock groups to sync (empty = all groups)'
      },
      excludedItems: {
        type: 'array',
        default: [],
        description: 'Stock item names to exclude from sync'
      },
      syncIntervalMinutes: {
        type: 'number',
        default: 30,
        min: 5,
        max: 1440,
        description: 'Delta sync interval during business hours (minutes)'
      },
      offHoursIntervalMinutes: {
        type: 'number',
        default: 120,
        min: 30,
        max: 1440,
        description: 'Delta sync interval during off-hours (minutes)'
      },
      offHoursStart: {
        type: 'string',
        default: '20:00',
        description: 'Off-hours start time (HH:MM)'
      },
      offHoursEnd: {
        type: 'string',
        default: '09:00',
        description: 'Off-hours end time (HH:MM)'
      },
      fullSyncTime: {
        type: 'string',
        default: '02:00',
        description: 'Daily full sync time (HH:MM)'
      },
      dryRun: {
        type: 'boolean',
        default: true,
        description: 'Dry run mode — read from Tally but skip uploads'
      }
    };
  }

  /**
   * Module has UI for Tally-specific settings
   */
  hasUI() {
    return true;
  }

  getUIComponent() {
    return 'modules/tally/settings.html';
  }

  /**
   * Get module capabilities
   */
  getCapabilities() {
    return [
      'tally.voucher.create',
      'tally.voucher.read',
      'tally.ledger.create',
      'tally.ledger.read',
      'tally.stock.create',
      'tally.stock.read',
      'tally.stock.sync.delta',
      'tally.stock.sync.full',
      'tally.stock.sync.partial',
      'tally.company.detect',
      'tally.groups.fetch',
      'tally.report.generate',
      // Backward compatibility
      'voucher.create',
      'voucher.read',
      'ledger.create',
      'ledger.read',
      'stock.create',
      'stock.read',
      'report.generate'
    ];
  }

  /**
   * Health check - verify Tally connection
   */
  async healthCheck() {
    try {
      const isRunning = await this.tallyService.isRunning();

      return {
        healthy: isRunning,
        message: isRunning ? 'Tally is running' : 'Tally is not running',
        details: {
          version: this.tallyService.tallyVersion,
          company: this.tallyService.companyName,
          connected: isRunning
        }
      };
    } catch (error) {
      return {
        healthy: false,
        message: error.message,
        details: null
      };
    }
  }
}

module.exports = TallyModule;
