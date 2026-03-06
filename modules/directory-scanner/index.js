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

      case 'scanner.directory.scan-with-upload':
        return await this.scanAndUpload(job);

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
   * Pause ongoing scan
   */
  pauseScan() {
    if (!this.currentScan) {
      return {
        success: false,
        message: 'No scan in progress'
      };
    }

    console.log('[SCANNER] Pausing scan...');
    this.scanner.pauseScan();

    return {
      success: true,
      message: 'Scan paused'
    };
  }

  /**
   * Resume paused scan
   */
  resumeScan() {
    if (!this.currentScan) {
      return {
        success: false,
        message: 'No scan in progress'
      };
    }

    console.log('[SCANNER] Resuming scan...');
    this.scanner.resumeScan();

    return {
      success: true,
      message: 'Scan resumed'
    };
  }

  /**
   * Check if scan is paused
   */
  isScanPaused() {
    return this.scanner?.isPaused() || false;
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
   * Scan directory and upload results to cloud
   * Used by deep link flow
   */
  async scanAndUpload(job) {
    const { jobId, shopId, userId, cloudUrl, apiKey, scanId } = job.payload;
    const axios = require('axios');

    try {
      console.log('[SCANNER] Starting scan-and-upload flow...');

      // 1. Show directory picker
      const selectResult = await this.selectDirectory({
        payload: {
          title: 'Select Directory to Scan',
          message: 'Choose the directory containing recovery data to scan'
        }
      });

      if (selectResult.canceled) {
        console.log('[SCANNER] User canceled directory selection');
        return {
          success: false,
          canceled: true,
          message: 'Directory selection canceled by user'
        };
      }

      if (!selectResult.exists || !selectResult.isDirectory) {
        return {
          success: false,
          error: 'Selected path is not a valid directory'
        };
      }

      const directoryPath = selectResult.path;
      console.log(`[SCANNER] User selected: ${directoryPath}`);

      // 2. Perform scan
      console.log('[SCANNER] Starting directory scan...');
      const scanResult = await this.scanDirectory({
        id: job.id || 'scan-upload',
        payload: {
          directoryPath,
          options: {
            maxDepth: 10,
            includeHidden: false
          }
        }
      });

      if (!scanResult.success) {
        return {
          success: false,
          error: 'Directory scan failed'
        };
      }

      console.log('[SCANNER] Scan completed successfully');

      // 3. Transform to DevExtreme format
      console.log('[SCANNER] Transforming to DevExtreme format...');
      const formatted = DevExtremeFormatter.transform(scanResult.tree, {
        includeRoot: false,
        includePath: true,
        includeExtension: true,
        includeFileType: true
      });

      const statistics = DevExtremeFormatter.getStatistics(scanResult.tree);

      // 4. Upload to cloud
      console.log('[SCANNER] Uploading results to cloud...');
      const uploadUrl = `${cloudUrl}/api/agent/directory-scans/results`;

      const uploadResponse = await axios.post(
        uploadUrl,
        {
          job_id: jobId,
          scan_id: scanId,
          directory_path: directoryPath,
          scan_data: formatted,
          statistics: statistics,
          agent_id: job.payload.agentId || null
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 60000 // 60 second timeout
        }
      );

      console.log('[SCANNER] Upload successful');

      return {
        success: true,
        message: 'Directory scan completed and uploaded successfully',
        scanId: uploadResponse.data.data?.id,
        statistics: statistics,
        directoryPath: directoryPath
      };

    } catch (error) {
      console.error('[SCANNER] Error in scan-and-upload:', error);

      // Check if it's an axios error
      if (error.response) {
        return {
          success: false,
          error: `Upload failed: ${error.response.data?.message || error.response.statusText}`,
          statusCode: error.response.status
        };
      }

      return {
        success: false,
        error: error.message || 'Scan and upload failed'
      };
    }
  }

  /**
   * Scan and upload with real-time progress updates
   * Used by scan UI
   */
  async scanAndUploadWithProgress(scanData, progressCallback) {
    const { jobId, shopId, userId, cloudUrl, apiKey, directoryPath, scanId } = scanData;
    const axios = require('axios');

    try {
      console.log('[SCANNER] ===== STARTING SCAN WITH PROGRESS =====');
      console.log('[SCANNER] Job ID:', jobId);
      console.log('[SCANNER] Shop ID:', shopId);
      console.log('[SCANNER] Cloud URL:', cloudUrl);
      console.log('[SCANNER] Directory:', directoryPath);
      console.log('[SCANNER] API Key (first 10 chars):', apiKey ? apiKey.substring(0, 10) + '...' : 'MISSING');

      let totalFilesScanned = 0;
      let totalFoldersScanned = 0;
      let totalBytesScanned = 0;
      let lastProgressUpdate = Date.now();
      const PROGRESS_UPDATE_INTERVAL = 1000; // Send progress every 1 second

      // Create scanner with progress callback
      const scanOptions = {
        ...this.config,
        maxDepth: 10,
        includeHidden: false,
        onProgress: (progress) => {
          totalFilesScanned = progress.filesScanned || 0;
          totalFoldersScanned = progress.foldersScanned || 0;
          totalBytesScanned = progress.totalSize || 0;

          // Send progress to UI
          const now = Date.now();
          if (now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
            const progressData = {
              filesScanned: totalFilesScanned,
              foldersScanned: totalFoldersScanned,
              totalSize: totalBytesScanned,
              currentPath: progress.currentPath || '',
              percentage: this.calculatePercentage(progress),
              directoryPath: directoryPath
            };

            progressCallback(progressData);

            // Send progress to backend
            this.sendProgressToBackend(cloudUrl, apiKey, shopId, jobId, scanId, progressData);

            lastProgressUpdate = now;
          }
        }
      };

      // Mark scan as in progress
      this.currentScan = {
        jobId: jobId,
        path: directoryPath,
        startTime: Date.now()
      };

      console.log('[SCANNER] Starting directory tree scan...');

      // Build directory tree
      const tree = await this.scanner.scan(directoryPath, scanOptions);

      console.log('[SCANNER] Directory tree scan completed successfully');

      const stats = this.scanner.getStatistics();

      this.currentScan = null;

      console.log('[SCANNER] Scan statistics:', JSON.stringify(stats, null, 2));

      // Flatten tree for upload (flat array = reliable chunking for large scans)
      console.log('[SCANNER] Flattening tree for upload...');
      const formatted = DevExtremeFormatter.flatten(tree, { includeRoot: false });

      console.log('[SCANNER] Flatten completed. Total items:', formatted.length);

      const statistics = DevExtremeFormatter.getStatistics(tree);

      console.log('[SCANNER] Final statistics:', JSON.stringify(statistics, null, 2));

      // Final progress update (95%)
      console.log('[SCANNER] Sending final progress update (95%)...');
      progressCallback({
        filesScanned: statistics.totalFiles,
        foldersScanned: statistics.totalFolders,
        totalSize: statistics.totalSize,
        currentPath: 'Uploading to cloud...',
        percentage: 95
      });

      // Upload to cloud using chunked upload for large datasets
      console.log('[SCANNER] ===== UPLOADING RESULTS TO CLOUD =====');
      console.log('[SCANNER] Total items to upload:', formatted.length);

      const uploadResult = await this.uploadInChunks({
        cloudUrl,
        apiKey,
        shopId,
        jobId,
        scanId,
        directoryPath,
        formatted,
        statistics,
        agentId: scanData.agentId,
        progressCallback
      });

      if (!uploadResult.success) {
        return uploadResult;
      }

      console.log('[SCANNER] ===== UPLOAD SUCCESSFUL =====');

      return {
        success: true,
        message: 'Directory scan completed and uploaded successfully',
        scanId: uploadResult.scanId,
        statistics: statistics,
        directoryPath: directoryPath
      };

    } catch (error) {
      console.error('[SCANNER] ===== ERROR IN SCAN-AND-UPLOAD =====');
      console.error('[SCANNER] Error type:', error.constructor.name);
      console.error('[SCANNER] Error message:', error.message);

      if (error.response) {
        console.error('[SCANNER] HTTP Response Error:');
        console.error('[SCANNER] - Status:', error.response.status);
        console.error('[SCANNER] - Status Text:', error.response.statusText);
        console.error('[SCANNER] - Headers:', JSON.stringify(error.response.headers, null, 2));
        console.error('[SCANNER] - Data:', JSON.stringify(error.response.data, null, 2));
      } else if (error.request) {
        console.error('[SCANNER] No response received from server');
        console.error('[SCANNER] Request details:', error.request);
      } else {
        console.error('[SCANNER] Error setting up request:', error.message);
      }

      console.error('[SCANNER] Full error stack:', error.stack);

      this.currentScan = null;

      if (error.response) {
        return {
          success: false,
          error: `Upload failed (${error.response.status}): ${error.response.data?.message || error.response.statusText}`
        };
      }

      return {
        success: false,
        error: error.message || 'Scan failed'
      };
    }
  }

  /**
   * Upload scan results in chunks to handle large datasets
   * Splits data into manageable chunks to avoid 413 errors
   */
  async uploadInChunks(params) {
    const {
      cloudUrl,
      apiKey,
      shopId,
      jobId,
      scanId,
      directoryPath,
      formatted,
      statistics,
      agentId,
      progressCallback
    } = params;

    const axios = require('axios');

    // Chunk size: 1000 items per chunk (safe for nginx default limits on staging/prod)
    const CHUNK_SIZE = 1000;
    const totalItems = formatted.length;
    const totalChunks = Math.ceil(totalItems / CHUNK_SIZE);

    console.log(`[SCANNER] Uploading in ${totalChunks} chunk(s), ${CHUNK_SIZE} items per chunk`);

    // If small enough, upload in single request (backward compatible)
    if (totalChunks === 1) {
      return await this.uploadSingleChunk({
        cloudUrl, apiKey, shopId, jobId, scanId, directoryPath,
        scanData: formatted, statistics, agentId, isChunked: false
      });
    }

    // Upload chunks
    let uploadedScanId = null;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalItems);
      const chunk = formatted.slice(start, end);

      const isFirstChunk = chunkIndex === 0;
      const isLastChunk = chunkIndex === totalChunks - 1;

      console.log(`[SCANNER] Uploading chunk ${chunkIndex + 1}/${totalChunks} (items ${start + 1}-${end})`);

      // Update progress
      const uploadProgress = 95 + ((chunkIndex + 1) / totalChunks) * 4; // 95-99%
      progressCallback({
        filesScanned: statistics.totalFiles,
        foldersScanned: statistics.totalFolders,
        totalSize: statistics.totalSize,
        currentPath: `Uploading chunk ${chunkIndex + 1} of ${totalChunks}...`,
        percentage: Math.round(uploadProgress)
      });

      try {
        const uploadUrl = `${cloudUrl}/api/agent/directory-scans/results`;

        const response = await axios.post(
          uploadUrl,
          {
            job_id: jobId,
            scan_id: scanId,
            directory_path: directoryPath,
            scan_data: chunk,
            statistics: isLastChunk ? statistics : null, // Only send stats with last chunk
            agent_id: agentId || null,
            data_format: 'flat',
            // Chunking metadata
            is_chunked: true,
            chunk_index: chunkIndex,
            total_chunks: totalChunks,
            is_first_chunk: isFirstChunk,
            is_last_chunk: isLastChunk,
            total_items: totalItems
          },
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-Tenant': shopId.toString()
            },
            timeout: 120000, // 2 minute timeout per chunk
            maxContentLength: Infinity,
            maxBodyLength: Infinity
          }
        );

        console.log(`[SCANNER] Chunk ${chunkIndex + 1} uploaded successfully`);

        // Get scan ID from first chunk response
        if (isFirstChunk && response.data?.data?.id) {
          uploadedScanId = response.data.data.id;
        }

      } catch (error) {
        console.error(`[SCANNER] Failed to upload chunk ${chunkIndex + 1}:`, error.message);

        if (error.response) {
          console.error('[SCANNER] Error status:', error.response.status);
          console.error('[SCANNER] Error data:', error.response.data);

          return {
            success: false,
            error: `Upload failed at chunk ${chunkIndex + 1}/${totalChunks} (${error.response.status}): ${error.response.data?.message || error.response.statusText}`
          };
        }

        return {
          success: false,
          error: `Upload failed at chunk ${chunkIndex + 1}/${totalChunks}: ${error.message}`
        };
      }

      // Small delay between chunks to avoid overwhelming the server
      if (!isLastChunk) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      success: true,
      scanId: uploadedScanId
    };
  }

  /**
   * Upload a single chunk or small dataset
   */
  async uploadSingleChunk(params) {
    const {
      cloudUrl, apiKey, shopId, jobId, scanId, directoryPath,
      scanData, statistics, agentId, isChunked
    } = params;

    const axios = require('axios');
    const uploadUrl = `${cloudUrl}/api/agent/directory-scans/results`;

    console.log('[SCANNER] Upload URL:', uploadUrl);
    console.log('[SCANNER] Upload payload size:', scanData.length, 'items');

    try {
      const response = await axios.post(
        uploadUrl,
        {
          job_id: jobId,
          scan_id: scanId,
          directory_path: directoryPath,
          scan_data: scanData,
          statistics: statistics,
          agent_id: agentId || null,
          data_format: 'flat',
          is_chunked: isChunked,
          chunk_index: 0,
          total_chunks: 1,
          is_first_chunk: true,
          is_last_chunk: true,
          total_items: scanData.length
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Tenant': shopId.toString()
          },
          timeout: 120000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      console.log('[SCANNER] Upload successful, status:', response.status);

      return {
        success: true,
        scanId: response.data?.data?.id
      };

    } catch (error) {
      console.error('[SCANNER] Upload failed:', error.message);

      if (error.response) {
        return {
          success: false,
          error: `Upload failed (${error.response.status}): ${error.response.data?.message || error.response.statusText}`
        };
      }

      return {
        success: false,
        error: `Upload failed: ${error.message}`
      };
    }
  }

  /**
   * Calculate estimated scan percentage
   */
  calculatePercentage(progress) {
    // Simple heuristic: assume scanning takes 90% of time, upload 10%
    // This is a rough estimate and can be improved
    if (!this.currentScan) return 0;

    const elapsed = Date.now() - this.currentScan.startTime;
    const filesPerSecond = progress.filesScanned / (elapsed / 1000);

    // Estimate based on typical scan speeds (very rough)
    const estimatedProgress = Math.min(90, (progress.filesScanned / 1000) * 10);

    return Math.round(estimatedProgress);
  }

  /**
   * Send progress update to backend
   */
  async sendProgressToBackend(cloudUrl, apiKey, shopId, jobId, scanId, progress) {
    const axios = require('axios');

    try {
      const progressUrl = `${cloudUrl}/api/agent/directory-scans/${jobId}/progress`;
      console.log('[SCANNER] Sending progress to:', progressUrl, '- Files:', progress.filesScanned, 'Percentage:', progress.percentage);

      await axios.post(
        progressUrl,
        {
          scan_id: scanId,
          status: 'scanning',
          files_scanned: progress.filesScanned,
          folders_scanned: progress.foldersScanned,
          total_size: progress.totalSize,
          current_path: progress.currentPath,
          percentage: progress.percentage,
          directory_path: progress.directoryPath || ''
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-Tenant': shopId.toString()
          },
          timeout: 5000
        }
      );

      console.log('[SCANNER] Progress update sent successfully');
    } catch (error) {
      // Log the error but don't fail the scan
      console.warn('[SCANNER] Failed to send progress update:', error.message);
      if (error.response) {
        console.warn('[SCANNER] Progress error status:', error.response.status);
        console.warn('[SCANNER] Progress error data:', error.response.data);
      }
    }
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
      'scanner.directory.scan-with-upload',
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
