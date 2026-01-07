/**
 * Directory Scanner Module - Scan directory structures for data recovery
 *
 * Features:
 * - Scan directory trees (like Snap2HTML)
 * - Generate HTML snapshots
 * - Export to JSON
 * - File metadata collection
 * - Support for large directories (1M+ files)
 */

const BaseModule = require('../../core/base-module');
const ScannerService = require('./scanner.service');
const HtmlGenerator = require('./html-generator');
const DevExtremeFormatter = require('./devextreme-formatter');
const { dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

class DirectoryScannerModule extends BaseModule {
  constructor() {
    super();

    this.name = 'directory-scanner';
    this.version = '1.0.0';
    this.description = 'Scan directory structures for data recovery verification';

    this.config = {
      maxDepth: 10,
      includeHidden: false,
      maxFileSize: 1024 * 1024 * 100, // 100MB max per file to include
      excludePatterns: [
        'node_modules',
        '.git',
        'Thumbs.db',
        '.DS_Store',
        '$RECYCLE.BIN',
        'System Volume Information'
      ],
      calculateHashes: false, // Optional: calculate file hashes
      followSymlinks: false
    };

    this.scanner = null;
    this.currentScan = null; // Track ongoing scan
  }

  async initialize() {
    await super.initialize();

    console.log('[SCANNER] Initializing directory scanner module...');

    this.scanner = new ScannerService(this.config);

    this.initialized = true;
  }

  async activate() {
    await super.activate();

    console.log('[SCANNER] Directory scanner module activated');
    this.active = true;
  }

  async deactivate() {
    await super.deactivate();

    // Cancel any ongoing scan
    if (this.currentScan) {
      console.log('[SCANNER] Canceling ongoing scan...');
      this.scanner.cancelScan();
      this.currentScan = null;
    }

    this.active = false;
  }

  /**
   * Check if this module can handle the job
   */
  canHandle(jobType) {
    return jobType.startsWith('scanner.');
  }

  /**
   * Execute a scanner job
   */
  async execute(job) {
    console.log(`[SCANNER] Executing job: ${job.type}`);

    switch (job.type) {
      case 'scanner.directory.select':
        return await this.selectDirectory(job);

      case 'scanner.directory.scan':
        return await this.scanDirectory(job);

      case 'scanner.export.html':
        return await this.exportToHtml(job);

      case 'scanner.export.json':
        return await this.exportToJson(job);

      case 'scanner.export.devextreme':
        return await this.exportToDevExtreme(job);

      case 'scanner.cancel':
        return await this.cancelScan(job);

      default:
        throw new Error(`Unknown scanner job type: ${job.type}`);
    }
  }

  /**
   * Show directory picker dialog
   */
  async selectDirectory(job) {
    console.log('[SCANNER] Opening directory picker...');

    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: job.payload?.title || 'Select Directory to Scan',
      message: job.payload?.message || 'Choose a directory for data recovery scanning',
      buttonLabel: job.payload?.buttonLabel || 'Select'
    });

    if (result.canceled) {
      return {
        canceled: true,
        path: null
      };
    }

    const selectedPath = result.filePaths[0];

    // Get basic info about the directory
    try {
      const stat = await fs.stat(selectedPath);

      return {
        canceled: false,
        path: selectedPath,
        name: path.basename(selectedPath),
        exists: true,
        isDirectory: stat.isDirectory(),
        modified: stat.mtime,
        created: stat.birthtime
      };
    } catch (error) {
      return {
        canceled: false,
        path: selectedPath,
        name: path.basename(selectedPath),
        exists: false,
        error: error.message
      };
    }
  }

  /**
   * Scan directory structure
   */
  async scanDirectory(job) {
    const { directoryPath, options = {} } = job.payload;

    if (!directoryPath) {
      throw new Error('directoryPath is required');
    }

    console.log(`[SCANNER] Scanning directory: ${directoryPath}`);

    const scanOptions = {
      ...this.config,
      ...options,
      onProgress: (progress) => {
        // Emit progress events for UI updates
        this.emitProgress(job.id, progress);
      }
    };

    try {
      // Mark scan as in progress
      this.currentScan = {
        jobId: job.id,
        path: directoryPath,
        startTime: Date.now()
      };

      // Build directory tree
      const tree = await this.scanner.scan(directoryPath, scanOptions);

      // Get statistics
      const stats = this.scanner.getStatistics();

      this.currentScan = null;

      console.log('[SCANNER] Scan completed:', stats);

      return {
        success: true,
        path: directoryPath,
        scannedAt: new Date().toISOString(),
        tree: tree,
        statistics: stats,
        options: scanOptions,
        duration: Date.now() - this.currentScan?.startTime || 0
      };

    } catch (error) {
      this.currentScan = null;

      console.error('[SCANNER] Scan failed:', error.message);

      throw error;
    }
  }

  /**
   * Export scan result to HTML (Snap2HTML-like)
   */
  async exportToHtml(job) {
    const { tree, outputPath, title } = job.payload;

    if (!tree) {
      throw new Error('tree data is required');
    }

    console.log('[SCANNER] Generating HTML snapshot...');

    const html = await HtmlGenerator.generate(tree, {
      title: title || `Directory Snapshot - ${tree.name}`
    });

    // If outputPath specified, save to file
    if (outputPath) {
      await fs.writeFile(outputPath, html, 'utf8');

      return {
        success: true,
        htmlPath: outputPath,
        size: Buffer.byteLength(html, 'utf8'),
        html: null // Don't return HTML if saved to file
      };
    }

    // Otherwise return HTML content
    return {
      success: true,
      html: html,
      size: Buffer.byteLength(html, 'utf8'),
      htmlPath: null
    };
  }

  /**
   * Export scan result to JSON
   */
  async exportToJson(job) {
    const { tree, outputPath, pretty = true } = job.payload;

    if (!tree) {
      throw new Error('tree data is required');
    }

    console.log('[SCANNER] Exporting to JSON...');

    const json = pretty
      ? JSON.stringify(tree, null, 2)
      : JSON.stringify(tree);

    // If outputPath specified, save to file
    if (outputPath) {
      await fs.writeFile(outputPath, json, 'utf8');

      return {
        success: true,
        jsonPath: outputPath,
        size: Buffer.byteLength(json, 'utf8'),
        json: null // Don't return JSON if saved to file
      };
    }

    // Otherwise return JSON data
    return {
      success: true,
      json: tree,
      size: Buffer.byteLength(json, 'utf8'),
      jsonPath: null
    };
  }

  /**
   * Export scan result to DevExtreme FileManager format
   */
  async exportToDevExtreme(job) {
    const {
      tree,
      outputPath,
      format = 'hierarchical', // 'hierarchical', 'flat', or 'datasource'
      includeRoot = false,
      pretty = true
    } = job.payload;

    if (!tree) {
      throw new Error('tree data is required');
    }

    console.log('[SCANNER] Exporting to DevExtreme format...');

    let data;
    let formatType;

    // Choose format type
    switch (format) {
      case 'flat':
        data = DevExtremeFormatter.flatten(tree, { includeRoot });
        formatType = 'flat array with parentKey references';
        break;

      case 'datasource':
        data = DevExtremeFormatter.createDataSource(tree, {
          hierarchical: true,
          includeRoot
        });
        formatType = 'DevExtreme data source configuration';
        break;

      case 'hierarchical':
      default:
        data = DevExtremeFormatter.transform(tree, { includeRoot });
        formatType = 'hierarchical tree structure';
        break;
    }

    // Get statistics
    const statistics = DevExtremeFormatter.getStatistics(tree);

    const result = {
      format: format,
      formatType: formatType,
      data: data,
      statistics: statistics,
      generatedAt: new Date().toISOString()
    };

    const json = pretty
      ? JSON.stringify(result, null, 2)
      : JSON.stringify(result);

    // If outputPath specified, save to file
    if (outputPath) {
      await fs.writeFile(outputPath, json, 'utf8');

      return {
        success: true,
        format: format,
        formatType: formatType,
        outputPath: outputPath,
        size: Buffer.byteLength(json, 'utf8'),
        statistics: statistics,
        data: null // Don't return data if saved to file
      };
    }

    // Otherwise return data
    return {
      success: true,
      format: format,
      formatType: formatType,
      data: result.data,
      statistics: statistics,
      size: Buffer.byteLength(json, 'utf8'),
      outputPath: null
    };
  }

  /**
   * Cancel ongoing scan
   */
  async cancelScan(job) {
    if (!this.currentScan) {
      return {
        success: false,
        message: 'No scan in progress'
      };
    }

    console.log('[SCANNER] Canceling scan...');

    this.scanner.cancelScan();
    this.currentScan = null;

    return {
      success: true,
      message: 'Scan canceled'
    };
  }

  /**
   * Emit scan progress
   */
  emitProgress(jobId, progress) {
    // This would typically send progress to the UI or cloud
    console.log(`[SCANNER] Progress: ${progress.filesScanned} files, ${progress.foldersScanned} folders`);

    // You can emit events here for real-time updates
    // eventBus.publish('scanner:progress', { jobId, progress });
  }

  /**
   * Get configuration schema
   */
  getConfigSchema() {
    return {
      maxDepth: {
        type: 'number',
        default: 10,
        min: 1,
        max: 50,
        description: 'Maximum directory depth to scan'
      },
      includeHidden: {
        type: 'boolean',
        default: false,
        description: 'Include hidden files and folders'
      },
      maxFileSize: {
        type: 'number',
        default: 104857600,
        description: 'Maximum file size to include (bytes)'
      },
      excludePatterns: {
        type: 'array',
        default: ['node_modules', '.git'],
        description: 'Patterns to exclude from scan'
      },
      calculateHashes: {
        type: 'boolean',
        default: false,
        description: 'Calculate file hashes (SHA-256)'
      },
      followSymlinks: {
        type: 'boolean',
        default: false,
        description: 'Follow symbolic links'
      }
    };
  }

  /**
   * Module has UI for scanner settings
   */
  hasUI() {
    return true;
  }

  getUIComponent() {
    return 'modules/directory-scanner/settings.html';
  }

  /**
   * Get module capabilities
   */
  getCapabilities() {
    return [
      'scanner.directory.select',
      'scanner.directory.scan',
      'scanner.export.html',
      'scanner.export.json',
      'scanner.export.devextreme',
      'scanner.cancel'
    ];
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      healthy: this.active && this.initialized,
      message: this.currentScan
        ? `Scanning: ${this.currentScan.path}`
        : 'Ready',
      details: {
        scanInProgress: !!this.currentScan,
        currentScan: this.currentScan
      }
    };
  }
}

module.exports = DirectoryScannerModule;
