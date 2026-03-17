/**
 * SyncScheduler - Timer-based scheduler for Tally inventory sync
 *
 * Manages delta sync intervals (business vs off-hours) and daily full sync.
 * Only runs when a company is selected and the module is active.
 */

class SyncScheduler {
  constructor(syncService, config = {}) {
    this.syncService = syncService;
    this.config = config;
    this._deltaTimer = null;
    this._fullSyncCheckTimer = null;
    this._running = false;
    this._lastFullSyncDate = null; // Track date string "YYYY-MM-DD" to avoid repeat
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this._running) return;

    console.log('[SCHEDULER] Starting sync scheduler');
    this._running = true;

    // Schedule first delta sync
    this._scheduleDeltaSync();

    // Check for full sync every minute
    this._fullSyncCheckTimer = setInterval(() => {
      this._checkFullSync();
    }, 60 * 1000);

    console.log(`[SCHEDULER] Delta interval: ${this.getEffectiveInterval()}min, Full sync at: ${this.config.fullSyncTime || '02:00'}`);
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this._running) return;

    console.log('[SCHEDULER] Stopping sync scheduler');
    this._running = false;

    if (this._deltaTimer) {
      clearTimeout(this._deltaTimer);
      this._deltaTimer = null;
    }

    if (this._fullSyncCheckTimer) {
      clearInterval(this._fullSyncCheckTimer);
      this._fullSyncCheckTimer = null;
    }
  }

  /**
   * Trigger an immediate sync, bypassing the timer
   */
  async triggerImmediateSync(syncType = 'delta') {
    const companyName = this.config.selectedCompany;
    if (!companyName) {
      return { success: false, error: 'No company selected' };
    }

    console.log(`[SCHEDULER] Immediate ${syncType} sync triggered`);

    if (syncType === 'full') {
      return await this.syncService.executeFullSync(companyName, this.config.syncGroups || []);
    }

    return await this.syncService.executeDeltaSync(companyName, this.config.syncGroups || []);
  }

  /**
   * Get effective interval based on current time (business vs off-hours)
   */
  getEffectiveInterval() {
    if (this._isOffHours()) {
      return this.config.offHoursIntervalMinutes || 120;
    }
    return this.config.syncIntervalMinutes || 30;
  }

  /**
   * Update config and reschedule
   */
  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);

    if (this._running) {
      // Reschedule delta sync with new interval
      if (this._deltaTimer) {
        clearTimeout(this._deltaTimer);
        this._deltaTimer = null;
      }
      this._scheduleDeltaSync();
      console.log(`[SCHEDULER] Rescheduled with interval: ${this.getEffectiveInterval()}min`);
    }
  }

  // ==========================================
  // Private methods
  // ==========================================

  /**
   * Schedule the next delta sync
   */
  _scheduleDeltaSync() {
    if (!this._running) return;

    const intervalMs = this.getEffectiveInterval() * 60 * 1000;

    this._deltaTimer = setTimeout(async () => {
      await this._executeDeltaSync();
      this._scheduleDeltaSync(); // Schedule next
    }, intervalMs);
  }

  /**
   * Execute a scheduled delta sync
   */
  async _executeDeltaSync() {
    const companyName = this.config.selectedCompany;
    if (!companyName) return;

    try {
      await this.syncService.executeDeltaSync(companyName, this.config.syncGroups || []);
    } catch (error) {
      console.error('[SCHEDULER] Delta sync failed:', error.message);
    }
  }

  /**
   * Check if it's time for a daily full sync
   */
  async _checkFullSync() {
    if (!this._running || !this.config.selectedCompany) return;

    const fullSyncTime = this.config.fullSyncTime || '02:00';
    const [targetHour, targetMin] = fullSyncTime.split(':').map(Number);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Skip if already ran today
    if (this._lastFullSyncDate === todayStr) return;

    // Check if current time matches (within the minute window)
    if (now.getHours() === targetHour && now.getMinutes() === targetMin) {
      console.log(`[SCHEDULER] Daily full sync triggered at ${fullSyncTime}`);
      this._lastFullSyncDate = todayStr;

      try {
        await this.syncService.executeFullSync(
          this.config.selectedCompany,
          this.config.syncGroups || []
        );
      } catch (error) {
        console.error('[SCHEDULER] Full sync failed:', error.message);
      }
    }
  }

  /**
   * Check if current time is within off-hours window
   */
  _isOffHours() {
    const start = this.config.offHoursStart || '20:00';
    const end = this.config.offHoursEnd || '09:00';

    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes > endMinutes) {
      // Overnight window (e.g., 20:00 - 09:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    // Same-day window
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
}

module.exports = SyncScheduler;
