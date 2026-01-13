/**
 * ScannerService - Core directory scanning logic
 *
 * Recursively scans directories and builds a tree structure
 * with file metadata.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ScannerService {
  constructor(config) {
    this.config = config;
    this.canceled = false;
    this.paused = false;
    this.pauseResolve = null;
    this.stats = {
      totalFiles: 0,
      totalFolders: 0,
      totalSize: 0,
      scannedDepth: 0,
      errors: 0,
      skipped: 0
    };
  }

  /**
   * Scan directory recursively
   *
   * @param {string} dirPath - Path to scan
   * @param {object} options - Scan options
   * @param {number} depth - Current depth
   * @returns {Promise<object>} - Directory tree
   */
  async scan(dirPath, options = {}, depth = 0) {
    // Check if scan was canceled
    if (this.canceled) {
      throw new Error('Scan canceled');
    }

    // Check if scan is paused and wait
    if (this.paused) {
      await this.waitForResume();
    }

    const maxDepth = options.maxDepth || this.config.maxDepth;
    const includeHidden = options.includeHidden || this.config.includeHidden;
    const calculateHashes = options.calculateHashes || this.config.calculateHashes;
    const onProgress = options.onProgress || (() => {});

    // Check depth limit
    if (depth > maxDepth) {
      this.stats.skipped++;
      return null;
    }

    this.stats.scannedDepth = Math.max(this.stats.scannedDepth, depth);

    try {
      const stat = await fs.stat(dirPath);
      const name = path.basename(dirPath);

      // Skip hidden files/folders if not included
      if (!includeHidden && name.startsWith('.')) {
        this.stats.skipped++;
        return null;
      }

      // Skip excluded patterns
      if (this.isExcluded(name)) {
        this.stats.skipped++;
        return null;
      }

      const node = {
        name: name,
        path: dirPath,
        type: stat.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modified: stat.mtime.toISOString(),
        created: stat.birthtime.toISOString(),
        depth: depth
      };

      // Handle directories
      if (stat.isDirectory()) {
        this.stats.totalFolders++;

        try {
          const entries = await fs.readdir(dirPath);
          const children = [];

          for (const entry of entries) {
            const childPath = path.join(dirPath, entry);

            try {
              const childNode = await this.scan(childPath, options, depth + 1);

              if (childNode) {
                children.push(childNode);
              }
            } catch (error) {
              // Log error but continue scanning
              console.error(`[SCANNER] Error scanning ${childPath}:`, error.message);
              this.stats.errors++;
            }
          }

          node.children = children;
          node.childCount = children.length;

          // Calculate total size of directory
          node.totalSize = children.reduce((sum, child) => {
            return sum + (child.totalSize || child.size || 0);
          }, 0);

        } catch (error) {
          // Permission denied or other error reading directory
          console.error(`[SCANNER] Cannot read directory ${dirPath}:`, error.message);
          node.error = error.message;
          node.children = [];
          node.childCount = 0;
          this.stats.errors++;
        }

      }
      // Handle files
      else {
        this.stats.totalFiles++;
        this.stats.totalSize += stat.size;

        // Add file extension
        const ext = path.extname(name).toLowerCase();
        node.extension = ext || null;

        // Categorize file type
        node.fileType = this.getFileType(ext);

        // Calculate hash if requested
        if (calculateHashes && stat.size > 0 && stat.size < this.config.maxFileSize) {
          try {
            node.hash = await this.calculateFileHash(dirPath);
          } catch (error) {
            console.error(`[SCANNER] Error calculating hash for ${dirPath}:`, error.message);
          }
        }
      }

      // Report progress
      if (this.stats.totalFiles % 100 === 0) {
        onProgress({
          filesScanned: this.stats.totalFiles,
          foldersScanned: this.stats.totalFolders,
          totalSize: this.stats.totalSize,
          currentPath: dirPath
        });
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
   *
   * @param {string} name - File or folder name
   * @returns {boolean} - True if excluded
   */
  isExcluded(name) {
    const excludePatterns = this.config.excludePatterns || [];

    return excludePatterns.some(pattern => {
      if (pattern.includes('*')) {
        // Simple wildcard matching
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(name);
      } else {
        return name.includes(pattern);
      }
    });
  }

  /**
   * Get file type category based on extension
   *
   * @param {string} ext - File extension
   * @returns {string} - File type category
   */
  getFileType(ext) {
    const typeMap = {
      // Images
      '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image',
      '.bmp': 'image', '.svg': 'image', '.webp': 'image', '.ico': 'image',

      // Videos
      '.mp4': 'video', '.avi': 'video', '.mov': 'video', '.wmv': 'video',
      '.flv': 'video', '.mkv': 'video', '.webm': 'video',

      // Audio
      '.mp3': 'audio', '.wav': 'audio', '.flac': 'audio', '.aac': 'audio',
      '.ogg': 'audio', '.wma': 'audio', '.m4a': 'audio',

      // Documents
      '.pdf': 'document', '.doc': 'document', '.docx': 'document',
      '.xls': 'document', '.xlsx': 'document', '.ppt': 'document',
      '.pptx': 'document', '.txt': 'document', '.rtf': 'document',

      // Archives
      '.zip': 'archive', '.rar': 'archive', '.7z': 'archive',
      '.tar': 'archive', '.gz': 'archive', '.bz2': 'archive',

      // Code
      '.js': 'code', '.py': 'code', '.java': 'code', '.cpp': 'code',
      '.c': 'code', '.html': 'code', '.css': 'code', '.json': 'code',
      '.xml': 'code', '.php': 'code', '.rb': 'code', '.go': 'code'
    };

    return typeMap[ext] || 'other';
  }

  /**
   * Calculate SHA-256 hash of file
   *
   * @param {string} filePath - Path to file
   * @returns {Promise<string>} - File hash
   */
  async calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = require('fs').createReadStream(filePath);

      stream.on('data', (data) => {
        hash.update(data);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Cancel ongoing scan
   */
  cancelScan() {
    console.log('[SCANNER] Canceling scan...');
    this.canceled = true;
    // If paused, resume first to allow cancel to propagate
    if (this.paused) {
      this.resumeScan();
    }
  }

  /**
   * Pause ongoing scan
   */
  pauseScan() {
    console.log('[SCANNER] Pausing scan...');
    this.paused = true;
  }

  /**
   * Resume paused scan
   */
  resumeScan() {
    console.log('[SCANNER] Resuming scan...');
    this.paused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  /**
   * Wait for scan to be resumed
   */
  waitForResume() {
    return new Promise((resolve) => {
      this.pauseResolve = resolve;
    });
  }

  /**
   * Check if scan is paused
   */
  isPaused() {
    return this.paused;
  }

  /**
   * Get scan statistics
   *
   * @returns {object} - Statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      totalSizeFormatted: this.formatBytes(this.stats.totalSize)
    };
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
      errors: 0,
      skipped: 0
    };
    this.canceled = false;
    this.paused = false;
    this.pauseResolve = null;
  }

  /**
   * Format bytes to human-readable string
   *
   * @param {number} bytes - Size in bytes
   * @returns {string} - Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = ScannerService;
