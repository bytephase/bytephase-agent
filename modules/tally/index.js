/**
 * Tally Module - Integrates with Tally ERP software
 *
 * Handles all Tally-related operations:
 * - Vouchers (create, read)
 * - Ledgers (create, read)
 * - Stock items (create, read)
 * - Reports (generate)
 */

const BaseModule = require('../../core/base-module');
const TallyService = require('./tally.service');

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
      timeout: 10000
    };

    this.tallyService = null;
  }

  async initialize() {
    await super.initialize();

    console.log('[TALLY] Initializing Tally module...');

    // Create Tally service instance with config
    this.tallyService = new TallyService(this.config);

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

    this.active = true;
  }

  async deactivate() {
    await super.deactivate();

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
