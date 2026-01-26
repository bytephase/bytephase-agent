const { app } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Instance Lock Helper
 * Provides additional safeguards for single-instance management
 * Handles cases where Electron's built-in lock might not be sufficient
 */
class InstanceLockHelper {
  constructor() {
    this.lockFilePath = path.join(app.getPath('userData'), 'bytephase-agent.lock');
    this.heartbeatFilePath = path.join(app.getPath('userData'), 'bytephase-agent.heartbeat');
    this.heartbeatInterval = null;
    // If heartbeat is older than this, consider the instance stale
    this.staleThresholdMs = 30000; // 30 seconds
  }

  /**
   * Check if there's a stale lock from a crashed instance
   * @returns {boolean} true if a stale lock was detected and cleaned up
   */
  checkAndCleanStaleLock() {
    try {
      // Check if heartbeat file exists
      if (!fs.existsSync(this.heartbeatFilePath)) {
        console.log('[LOCK] No heartbeat file found - no stale instance');
        return false;
      }

      // Read heartbeat timestamp
      const heartbeatContent = fs.readFileSync(this.heartbeatFilePath, 'utf8');
      const lastHeartbeat = parseInt(heartbeatContent, 10);

      if (isNaN(lastHeartbeat)) {
        console.log('[LOCK] Invalid heartbeat file content - cleaning up');
        this.cleanup();
        return true;
      }

      const now = Date.now();
      const age = now - lastHeartbeat;

      if (age > this.staleThresholdMs) {
        console.log(`[LOCK] Stale instance detected (heartbeat ${age}ms old) - cleaning up`);
        this.cleanup();
        return true;
      }

      console.log(`[LOCK] Active instance detected (heartbeat ${age}ms old)`);
      return false;

    } catch (error) {
      console.warn('[LOCK] Error checking stale lock:', error.message);
      return false;
    }
  }

  /**
   * Start heartbeat updates
   * Call this after successfully acquiring the lock
   */
  startHeartbeat() {
    // Write initial heartbeat
    this.writeHeartbeat();

    // Update heartbeat every 10 seconds
    this.heartbeatInterval = setInterval(() => {
      this.writeHeartbeat();
    }, 10000);

    console.log('[LOCK] Heartbeat started');
  }

  /**
   * Write current timestamp to heartbeat file
   */
  writeHeartbeat() {
    try {
      fs.writeFileSync(this.heartbeatFilePath, Date.now().toString(), 'utf8');
    } catch (error) {
      console.warn('[LOCK] Error writing heartbeat:', error.message);
    }
  }

  /**
   * Stop heartbeat and cleanup lock files
   * Call this on app quit
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.cleanup();
    console.log('[LOCK] Heartbeat stopped and cleaned up');
  }

  /**
   * Remove lock and heartbeat files
   */
  cleanup() {
    try {
      if (fs.existsSync(this.lockFilePath)) {
        fs.unlinkSync(this.lockFilePath);
      }
      if (fs.existsSync(this.heartbeatFilePath)) {
        fs.unlinkSync(this.heartbeatFilePath);
      }
    } catch (error) {
      console.warn('[LOCK] Error during cleanup:', error.message);
    }
  }

  /**
   * Save deep link URL for later processing
   * Used when we can't acquire the lock but want to pass the URL to the running instance
   * @param {string} deeplink - The deep link URL
   */
  saveDeepLinkForLater(deeplink) {
    try {
      const deeplinkFilePath = path.join(app.getPath('userData'), 'pending-deeplink.txt');
      fs.writeFileSync(deeplinkFilePath, deeplink, 'utf8');
      console.log('[LOCK] Saved deep link for later:', deeplink);
      return deeplinkFilePath;
    } catch (error) {
      console.error('[LOCK] Error saving deep link:', error.message);
      return null;
    }
  }

  /**
   * Check for and retrieve a pending deep link
   * @returns {string|null} The pending deep link URL or null
   */
  getPendingDeepLink() {
    try {
      const deeplinkFilePath = path.join(app.getPath('userData'), 'pending-deeplink.txt');

      if (!fs.existsSync(deeplinkFilePath)) {
        return null;
      }

      const deeplink = fs.readFileSync(deeplinkFilePath, 'utf8').trim();

      // Delete the file after reading
      fs.unlinkSync(deeplinkFilePath);

      if (deeplink && deeplink.startsWith('bytephase://')) {
        console.log('[LOCK] Found pending deep link:', deeplink);
        return deeplink;
      }

      return null;
    } catch (error) {
      console.warn('[LOCK] Error reading pending deep link:', error.message);
      return null;
    }
  }

  /**
   * Get status info for debugging
   */
  getStatus() {
    let heartbeatAge = null;

    try {
      if (fs.existsSync(this.heartbeatFilePath)) {
        const content = fs.readFileSync(this.heartbeatFilePath, 'utf8');
        const lastHeartbeat = parseInt(content, 10);
        if (!isNaN(lastHeartbeat)) {
          heartbeatAge = Date.now() - lastHeartbeat;
        }
      }
    } catch (error) {
      // Ignore
    }

    return {
      heartbeatActive: this.heartbeatInterval !== null,
      heartbeatAgeMs: heartbeatAge,
      staleThresholdMs: this.staleThresholdMs,
      lockFilePath: this.lockFilePath,
      heartbeatFilePath: this.heartbeatFilePath
    };
  }
}

module.exports = new InstanceLockHelper();
