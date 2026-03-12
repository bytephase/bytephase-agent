/**
 * TallySyncService - Orchestrates inventory sync between Tally and cloud
 *
 * Supports delta (changed items), full (all items), and partial (specific items) syncs.
 * Chunks large datasets for upload. Tracks state in SQLite. Emits progress events.
 */

const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const eventBus = require('../../core/event-bus');
const queueService = require('../../services/queue.service');
const authService = require('../../services/auth.service');

const CHUNK_SIZE = 500;
const MAX_CHUNK_RETRIES = 3;
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
const TALLY_LOAD_DELAY_MS = 2000; // delay between reads if > 500 items

class TallySyncService {
  constructor(tallyService, config = {}) {
    this.tallyService = tallyService;
    this.config = config;
    this.isSyncing = false;
    this._abortRequested = false;
  }

  /**
   * Execute a delta sync — only items changed since last sync
   */
  async executeDeltaSync(companyName, syncGroups = []) {
    if (this.isSyncing) {
      console.log('[SYNC] Sync already in progress, skipping delta sync');
      return { success: false, error: 'Sync already in progress' };
    }

    this.isSyncing = true;
    this._abortRequested = false;

    const sessionId = uuidv4();
    const startTime = Date.now();

    try {
      eventBus.publish('tally:sync:start', { sessionId, syncType: 'delta', companyName });

      const state = queueService.getSyncState();
      const lastDeltaSync = state?.last_delta_sync_at;

      // If no baseline exists, escalate to full sync
      if (!lastDeltaSync) {
        console.log('[SYNC] No previous delta sync baseline, escalating to full sync');
        this.isSyncing = false;
        return await this.executeFullSync(companyName, syncGroups);
      }

      // Clock skew detection: if last sync is in the future, reset to 24h ago
      let sinceDate = new Date(lastDeltaSync);
      if (sinceDate.getTime() > Date.now()) {
        console.warn('[SYNC] Clock skew detected, resetting to 24h ago');
        sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      }

      queueService.updateSyncState({ sync_status: 'syncing' });

      this._emitProgress(sessionId, 'delta', 'reading', 0, 0, 'Reading changed items from Tally...');

      const items = await this.tallyService.readChangedStockItems(companyName, sinceDate);

      // Filter by sync groups if specified
      const filtered = syncGroups.length > 0
        ? items.filter(item => syncGroups.includes(item.parent))
        : items;

      if (this._abortRequested) {
        return this._handleAbort(sessionId, 'delta', startTime);
      }

      if (filtered.length === 0) {
        console.log('[SYNC] No changed items found');
        queueService.updateSyncState({
          last_delta_sync_at: Date.now(),
          sync_status: 'idle',
          consecutive_failures: 0
        });
        this._emitComplete(sessionId, 'delta', 0, startTime);
        return { success: true, itemCount: 0, syncType: 'delta' };
      }

      // Chunk and upload
      const chunks = this._chunkArray(filtered, CHUNK_SIZE);
      const result = await this._processChunks(sessionId, 'delta', chunks, filtered.length);

      if (result.success) {
        queueService.updateSyncState({
          last_delta_sync_at: Date.now(),
          sync_status: 'idle',
          consecutive_failures: 0
        });
      }

      return result;

    } catch (error) {
      return this._handleError(sessionId, 'delta', error, startTime);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Execute a full sync — read ALL stock items
   */
  async executeFullSync(companyName, syncGroups = []) {
    if (this.isSyncing) {
      console.log('[SYNC] Sync already in progress, skipping full sync');
      return { success: false, error: 'Sync already in progress' };
    }

    this.isSyncing = true;
    this._abortRequested = false;

    const sessionId = uuidv4();
    const startTime = Date.now();

    try {
      eventBus.publish('tally:sync:start', { sessionId, syncType: 'full', companyName });
      queueService.updateSyncState({ sync_status: 'syncing' });

      this._emitProgress(sessionId, 'full', 'reading', 0, 0, 'Reading all items from Tally...');

      const items = await this.tallyService.readStockItems({
        companyName,
        syncGroups
      });

      if (this._abortRequested) {
        return this._handleAbort(sessionId, 'full', startTime);
      }

      if (items.length === 0) {
        console.log('[SYNC] No stock items found');
        queueService.updateSyncState({
          last_full_sync_at: Date.now(),
          last_delta_sync_at: Date.now(),
          sync_status: 'idle',
          consecutive_failures: 0
        });
        this._emitComplete(sessionId, 'full', 0, startTime);
        return { success: true, itemCount: 0, syncType: 'full' };
      }

      // Add delay for large reads to reduce Tally load
      if (items.length > 500) {
        console.log(`[SYNC] Large dataset (${items.length} items), adding read delay`);
        await this._delay(TALLY_LOAD_DELAY_MS);
      }

      const chunks = this._chunkArray(items, CHUNK_SIZE);
      const result = await this._processChunks(sessionId, 'full', chunks, items.length);

      if (result.success) {
        queueService.updateSyncState({
          last_full_sync_at: Date.now(),
          last_delta_sync_at: Date.now(),
          sync_status: 'idle',
          consecutive_failures: 0
        });
      }

      return result;

    } catch (error) {
      return this._handleError(sessionId, 'full', error, startTime);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Execute a partial sync — read specific items by name
   */
  async executePartialSync(companyName, itemNames = []) {
    if (this.isSyncing) {
      return { success: false, error: 'Sync already in progress' };
    }

    if (itemNames.length === 0) {
      return { success: false, error: 'No item names provided' };
    }

    this.isSyncing = true;
    this._abortRequested = false;

    const sessionId = uuidv4();
    const startTime = Date.now();

    try {
      eventBus.publish('tally:sync:start', { sessionId, syncType: 'partial', companyName });
      queueService.updateSyncState({ sync_status: 'syncing' });

      this._emitProgress(sessionId, 'partial', 'reading', 0, itemNames.length, 'Reading specific items...');

      const items = [];
      for (const name of itemNames) {
        if (this._abortRequested) {
          return this._handleAbort(sessionId, 'partial', startTime);
        }
        try {
          const item = await this.tallyService.readSingleStockItem(companyName, name);
          if (item) items.push(item);
        } catch (err) {
          console.warn(`[SYNC] Failed to read item "${name}":`, err.message);
        }
      }

      if (items.length === 0) {
        queueService.updateSyncState({ sync_status: 'idle' });
        this._emitComplete(sessionId, 'partial', 0, startTime);
        return { success: true, itemCount: 0, syncType: 'partial' };
      }

      // Partial sync: single upload, no session machinery
      const result = await this._uploadDirect(sessionId, 'partial', items);

      if (result.success) {
        queueService.updateSyncState({ sync_status: 'idle' });
      }

      this._emitComplete(sessionId, 'partial', items.length, startTime);
      return { success: true, itemCount: items.length, syncType: 'partial' };

    } catch (error) {
      return this._handleError(sessionId, 'partial', error, startTime);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Resume incomplete sessions from a previous run
   */
  async resumeIncompleteSession() {
    const sessions = queueService.getInProgressSessions();
    if (sessions.length === 0) return;

    for (const session of sessions) {
      const age = Date.now() - session.started_at;

      if (age > SESSION_MAX_AGE_MS) {
        console.log(`[SYNC] Abandoning stale session ${session.id} (${Math.round(age / 60000)}min old)`);
        queueService.updateSyncSession(session.id, {
          status: 'abandoned',
          completed_at: Date.now(),
          error: 'Session too old, abandoned on restart'
        });
        continue;
      }

      console.log(`[SYNC] Resuming session ${session.id} (${session.sync_type})`);
      const pendingChunks = queueService.getPendingChunks(session.id);

      if (pendingChunks.length === 0) {
        // All chunks completed, just finalize
        await this._completeSession(session.id, session.sync_type);
        continue;
      }

      // Re-uploading pending chunks would require re-reading data from Tally,
      // which we can't do without context. Mark as abandoned and let next cycle handle it.
      console.log(`[SYNC] Cannot resume without data context, marking as abandoned`);
      queueService.updateSyncSession(session.id, {
        status: 'abandoned',
        completed_at: Date.now(),
        error: 'Cannot resume after restart, will sync in next cycle'
      });
    }
  }

  /**
   * Cancel a running sync
   */
  abort() {
    if (this.isSyncing) {
      console.log('[SYNC] Abort requested');
      this._abortRequested = true;
    }
  }

  /**
   * Get current sync status summary
   */
  getStatus() {
    const state = queueService.getSyncState();
    return {
      isSyncing: this.isSyncing,
      syncStatus: state?.sync_status || 'idle',
      lastDeltaSyncAt: state?.last_delta_sync_at || null,
      lastFullSyncAt: state?.last_full_sync_at || null,
      consecutiveFailures: state?.consecutive_failures || 0
    };
  }

  // ==========================================
  // Private methods
  // ==========================================

  /**
   * Process chunks: create session, upload each chunk, complete session
   */
  async _processChunks(sessionId, syncType, chunks, totalItems) {
    const dryRun = this.config.dryRun !== false; // default true

    queueService.createSyncSession(sessionId, syncType, totalItems, chunks.length);
    queueService.createSyncChunks(sessionId, chunks);

    if (dryRun) {
      console.log(`[SYNC] DRY RUN — ${syncType} sync: ${totalItems} items in ${chunks.length} chunks`);
      if (totalItems > 0) {
        console.log('[SYNC] Sample items:', JSON.stringify(chunks[0].slice(0, 3), null, 2));
      }

      queueService.updateSyncSession(sessionId, {
        status: 'completed',
        items_synced: totalItems,
        completed_at: Date.now()
      });

      this._emitComplete(sessionId, syncType, totalItems, Date.now());
      return { success: true, itemCount: totalItems, syncType, dryRun: true };
    }

    // Upload each chunk
    let itemsSynced = 0;
    for (let i = 0; i < chunks.length; i++) {
      if (this._abortRequested) {
        queueService.updateSyncSession(sessionId, {
          status: 'cancelled',
          items_synced: itemsSynced,
          completed_at: Date.now()
        });
        return { success: false, error: 'Sync cancelled', itemCount: itemsSynced };
      }

      const chunk = chunks[i];
      const success = await this._uploadChunkWithRetry(sessionId, i, chunk, syncType);

      if (!success) {
        // Stop on failure, resume next cycle
        console.error(`[SYNC] Chunk ${i + 1}/${chunks.length} failed, stopping sync`);
        queueService.updateSyncSession(sessionId, {
          status: 'failed',
          items_synced: itemsSynced,
          completed_at: Date.now(),
          error: `Failed at chunk ${i + 1}`
        });
        return { success: false, error: `Upload failed at chunk ${i + 1}`, itemCount: itemsSynced };
      }

      itemsSynced += chunk.length;
      queueService.updateSyncSession(sessionId, { items_synced: itemsSynced });

      this._emitProgress(sessionId, syncType, 'uploading', itemsSynced, totalItems,
        `Uploading chunk ${i + 1}/${chunks.length}...`);
    }

    // Complete the session
    await this._completeSession(sessionId, syncType);

    queueService.updateSyncSession(sessionId, {
      status: 'completed',
      items_synced: itemsSynced,
      completed_at: Date.now()
    });

    this._emitComplete(sessionId, syncType, itemsSynced, Date.now());
    return { success: true, itemCount: itemsSynced, syncType };
  }

  /**
   * Upload a single chunk with retry logic
   */
  async _uploadChunkWithRetry(sessionId, chunkIndex, items, syncType) {
    for (let attempt = 1; attempt <= MAX_CHUNK_RETRIES; attempt++) {
      try {
        queueService.updateSyncChunk(sessionId, chunkIndex, { attempts: attempt });

        await this._uploadChunk(items, syncType, sessionId, chunkIndex);

        queueService.updateSyncChunk(sessionId, chunkIndex, { status: 'completed' });
        return true;
      } catch (error) {
        console.warn(`[SYNC] Chunk ${chunkIndex} attempt ${attempt} failed:`, error.message);
        queueService.updateSyncChunk(sessionId, chunkIndex, {
          error: error.message,
          status: attempt >= MAX_CHUNK_RETRIES ? 'failed' : 'pending'
        });

        if (attempt < MAX_CHUNK_RETRIES) {
          await this._delay(1000 * attempt); // backoff
        }
      }
    }
    return false;
  }

  /**
   * POST a chunk of items to the cloud API
   */
  async _uploadChunk(items, syncType, sessionId, chunkIndex) {
    const credentials = authService.getAgentInfo();
    const cloudUrl = credentials?.cloudUrl;
    const apiKey = credentials?.apiKey;

    if (!cloudUrl || !apiKey) {
      throw new Error('Agent not registered, cannot upload');
    }

    await axios.post(
      `${cloudUrl}/api/partner/inventory/sync`,
      {
        session_id: sessionId,
        sync_type: syncType,
        chunk_index: chunkIndex,
        items
      },
      {
        headers: {
          'X-Agent-API-Key': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
  }

  /**
   * Direct upload for partial sync (no chunking)
   */
  async _uploadDirect(sessionId, syncType, items) {
    const dryRun = this.config.dryRun !== false;

    if (dryRun) {
      console.log(`[SYNC] DRY RUN — partial sync: ${items.length} items`);
      console.log('[SYNC] Items:', JSON.stringify(items.slice(0, 3), null, 2));
      return { success: true, dryRun: true };
    }

    await this._uploadChunk(items, syncType, sessionId, 0);
    return { success: true };
  }

  /**
   * Notify cloud that a sync session is complete
   */
  async _completeSession(sessionId, syncType) {
    const dryRun = this.config.dryRun !== false;
    if (dryRun) return;

    try {
      const credentials = authService.getAgentInfo();
      const cloudUrl = credentials?.cloudUrl;
      const apiKey = credentials?.apiKey;

      if (!cloudUrl || !apiKey) return;

      await axios.post(
        `${cloudUrl}/api/partner/inventory/sync/complete`,
        { session_id: sessionId, sync_type: syncType },
        {
          headers: {
            'X-Agent-API-Key': apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
    } catch (error) {
      console.warn('[SYNC] Failed to notify session completion:', error.message);
    }
  }

  /**
   * Handle sync error
   */
  _handleError(sessionId, syncType, error, startTime) {
    console.error(`[SYNC] ${syncType} sync failed:`, error.message);

    const state = queueService.getSyncState();
    const failures = (state?.consecutive_failures || 0) + 1;

    queueService.updateSyncState({
      sync_status: 'error',
      consecutive_failures: failures
    });

    eventBus.publish('tally:sync:error', {
      sessionId, syncType, error: error.message,
      duration: Date.now() - startTime
    });

    return { success: false, error: error.message, syncType };
  }

  /**
   * Handle abort
   */
  _handleAbort(sessionId, syncType, startTime) {
    console.log(`[SYNC] ${syncType} sync aborted`);
    queueService.updateSyncState({ sync_status: 'idle' });

    eventBus.publish('tally:sync:complete', {
      sessionId, syncType, itemCount: 0, aborted: true,
      duration: Date.now() - startTime
    });

    return { success: false, error: 'Sync aborted', syncType };
  }

  /**
   * Emit progress event
   */
  _emitProgress(sessionId, syncType, phase, current, total, message) {
    eventBus.publish('tally:sync:progress', {
      sessionId, syncType, phase, current, total, message
    });
  }

  /**
   * Emit completion event
   */
  _emitComplete(sessionId, syncType, itemCount, startTime) {
    eventBus.publish('tally:sync:complete', {
      sessionId, syncType, itemCount,
      duration: Date.now() - startTime
    });
  }

  /**
   * Split array into chunks
   */
  _chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Promise-based delay
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TallySyncService;
