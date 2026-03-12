const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

class QueueService {
  constructor() {
    this.db = null;
    this.dbPath = null;
    this.SQL = null;
  }

  /**
   * Initialize SQLite database
   */
  async init() {
    try {
      // Initialize sql.js
      this.SQL = await initSqlJs();

      this.dbPath = path.join(app.getPath('userData'), 'offline-queue.db');

      // Load existing database or create new one
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(buffer);
      } else {
        this.db = new this.SQL.Database();
      }

      // Create tables
      this.db.run(`
        CREATE TABLE IF NOT EXISTS offline_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT UNIQUE,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          result TEXT,
          status TEXT DEFAULT 'pending',
          retry_count INTEGER DEFAULT 0,
          created_at INTEGER,
          synced_at INTEGER
        )
      `);

      this.db.run(`CREATE INDEX IF NOT EXISTS idx_status ON offline_queue(status)`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_created ON offline_queue(created_at)`);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS completed_jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_id TEXT UNIQUE,
          result TEXT NOT NULL,
          completed_at INTEGER,
          reported INTEGER DEFAULT 0
        )
      `);

      this.db.run(`CREATE INDEX IF NOT EXISTS idx_reported ON completed_jobs(reported)`);

      // Tally sync state tables
      this.db.run(`
        CREATE TABLE IF NOT EXISTS tally_sync_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          last_delta_sync_at INTEGER,
          last_full_sync_at INTEGER,
          consecutive_failures INTEGER DEFAULT 0,
          sync_status TEXT DEFAULT 'idle',
          selected_company TEXT,
          updated_at INTEGER
        )
      `);

      // Insert default row if not exists
      this.db.run(`INSERT OR IGNORE INTO tally_sync_state (id, sync_status, consecutive_failures) VALUES (1, 'idle', 0)`);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS tally_sync_sessions (
          id TEXT PRIMARY KEY,
          sync_type TEXT NOT NULL,
          status TEXT DEFAULT 'in_progress',
          total_items INTEGER DEFAULT 0,
          total_chunks INTEGER DEFAULT 0,
          items_synced INTEGER DEFAULT 0,
          started_at INTEGER,
          completed_at INTEGER,
          error TEXT
        )
      `);

      this.db.run(`CREATE INDEX IF NOT EXISTS idx_session_status ON tally_sync_sessions(status)`);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS tally_sync_chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          status TEXT DEFAULT 'pending',
          attempts INTEGER DEFAULT 0,
          items_count INTEGER DEFAULT 0,
          error TEXT,
          FOREIGN KEY (session_id) REFERENCES tally_sync_sessions(id)
        )
      `);

      this.db.run(`CREATE INDEX IF NOT EXISTS idx_chunk_session ON tally_sync_chunks(session_id)`);

      // Save to disk
      this.save();

      console.log('[QUEUE] Database initialized at:', this.dbPath);
    } catch (error) {
      console.error('[QUEUE] Failed to initialize database:', error);
    }
  }

  /**
   * Save database to disk
   */
  save() {
    if (this.db && this.dbPath) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    }
  }

  /**
   * Add job to offline queue
   */
  enqueue(job) {
    if (!this.db) return;

    this.db.run(
      `INSERT OR REPLACE INTO offline_queue (job_id, type, payload, created_at, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [job.id, job.type, JSON.stringify(job.payload), Date.now()]
    );

    this.save();
    console.log('[QUEUE] Job enqueued:', job.id);
  }

  /**
   * Get all pending jobs
   */
  getPendingJobs() {
    if (!this.db) return [];

    const result = this.db.exec(`
      SELECT * FROM offline_queue
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `);

    if (!result.length || !result[0].values) return [];

    return result[0].values.map(row => ({
      id: row[1], // job_id
      type: row[2],
      payload: JSON.parse(row[3]),
      retryCount: row[6],
      createdAt: row[7]
    }));
  }

  /**
   * Mark job as synced
   */
  markSynced(jobId) {
    if (!this.db) return;

    this.db.run(
      `UPDATE offline_queue SET status = 'synced', synced_at = ? WHERE job_id = ?`,
      [Date.now(), jobId]
    );
    this.save();
    console.log('[QUEUE] Job marked as synced:', jobId);
  }

  /**
   * Mark job as failed
   */
  markFailed(jobId) {
    if (!this.db) return;

    this.db.run(
      `UPDATE offline_queue SET status = 'failed', retry_count = retry_count + 1 WHERE job_id = ?`,
      [jobId]
    );
    this.save();
    console.log('[QUEUE] Job marked as failed:', jobId);
  }

  /**
   * Check if job was already processed
   */
  isJobProcessed(jobId) {
    if (!this.db) return false;

    const result = this.db.exec(`SELECT 1 FROM completed_jobs WHERE job_id = ?`, [jobId]);
    return result.length > 0 && result[0].values.length > 0;
  }

  /**
   * Save completed job
   */
  saveCompletedJob(jobId, result) {
    if (!this.db) return;

    this.db.run(
      `INSERT OR REPLACE INTO completed_jobs (job_id, result, completed_at, reported) VALUES (?, ?, ?, 0)`,
      [jobId, JSON.stringify(result), Date.now()]
    );
    this.save();
    console.log('[QUEUE] Completed job saved:', jobId);
  }

  /**
   * Mark completed job as reported to cloud
   */
  markReported(jobId) {
    if (!this.db) return;

    this.db.run(`UPDATE completed_jobs SET reported = 1 WHERE job_id = ?`, [jobId]);
    this.save();
  }

  /**
   * Get unreported completed jobs
   */
  getUnreportedJobs() {
    if (!this.db) return [];

    const result = this.db.exec(`
      SELECT * FROM completed_jobs
      WHERE reported = 0
      ORDER BY completed_at ASC
      LIMIT 50
    `);

    if (!result.length || !result[0].values) return [];

    return result[0].values.map(row => ({
      jobId: row[1],
      result: JSON.parse(row[2]),
      completedAt: row[3]
    }));
  }

  /**
   * Get queue statistics
   */
  getStats() {
    if (!this.db) return { pending: 0, synced: 0, failed: 0, unreported: 0 };

    const getCount = (query) => {
      const result = this.db.exec(query);
      return result.length && result[0].values.length ? result[0].values[0][0] : 0;
    };

    return {
      pending: getCount('SELECT COUNT(*) FROM offline_queue WHERE status = "pending"'),
      synced: getCount('SELECT COUNT(*) FROM offline_queue WHERE status = "synced"'),
      failed: getCount('SELECT COUNT(*) FROM offline_queue WHERE status = "failed"'),
      unreported: getCount('SELECT COUNT(*) FROM completed_jobs WHERE reported = 0')
    };
  }

  /**
   * Clean old synced jobs (older than 7 days)
   */
  cleanup() {
    if (!this.db) return;

    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    this.db.run(
      `DELETE FROM offline_queue WHERE status = 'synced' AND synced_at < ?`,
      [sevenDaysAgo]
    );
    this.save();
    console.log('[QUEUE] Cleaned up old jobs');
  }

  // ==========================================
  // Tally Sync State Methods
  // ==========================================

  /**
   * Get current sync state
   */
  getSyncState() {
    if (!this.db) return null;

    const result = this.db.exec('SELECT * FROM tally_sync_state WHERE id = 1');
    if (!result.length || !result[0].values.length) return null;

    const row = result[0].values[0];
    const cols = result[0].columns;
    const state = {};
    cols.forEach((col, i) => { state[col] = row[i]; });
    return state;
  }

  /**
   * Update sync state fields
   */
  updateSyncState(fields) {
    if (!this.db) return;

    const allowed = ['last_delta_sync_at', 'last_full_sync_at', 'consecutive_failures', 'sync_status', 'selected_company', 'updated_at'];
    const updates = [];
    const values = [];

    for (const [key, value] of Object.entries(fields)) {
      if (allowed.includes(key)) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (updates.length === 0) return;

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(1); // WHERE id = 1

    this.db.run(`UPDATE tally_sync_state SET ${updates.join(', ')} WHERE id = ?`, values);
    this.save();
  }

  /**
   * Create a new sync session
   */
  createSyncSession(sessionId, syncType, totalItems, totalChunks) {
    if (!this.db) return;

    this.db.run(
      `INSERT INTO tally_sync_sessions (id, sync_type, status, total_items, total_chunks, started_at)
       VALUES (?, ?, 'in_progress', ?, ?, ?)`,
      [sessionId, syncType, totalItems, totalChunks, Date.now()]
    );
    this.save();
  }

  /**
   * Update sync session
   */
  updateSyncSession(sessionId, fields) {
    if (!this.db) return;

    const allowed = ['status', 'total_items', 'total_chunks', 'items_synced', 'completed_at', 'error'];
    const updates = [];
    const values = [];

    for (const [key, value] of Object.entries(fields)) {
      if (allowed.includes(key)) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (updates.length === 0) return;
    values.push(sessionId);

    this.db.run(`UPDATE tally_sync_sessions SET ${updates.join(', ')} WHERE id = ?`, values);
    this.save();
  }

  /**
   * Get a sync session by ID
   */
  getSyncSession(sessionId) {
    if (!this.db) return null;

    const result = this.db.exec('SELECT * FROM tally_sync_sessions WHERE id = ?', [sessionId]);
    if (!result.length || !result[0].values.length) return null;

    const row = result[0].values[0];
    const cols = result[0].columns;
    const session = {};
    cols.forEach((col, i) => { session[col] = row[i]; });
    return session;
  }

  /**
   * Get in-progress sync sessions
   */
  getInProgressSessions() {
    if (!this.db) return [];

    const result = this.db.exec(`SELECT * FROM tally_sync_sessions WHERE status = 'in_progress' ORDER BY started_at DESC`);
    if (!result.length || !result[0].values.length) return [];

    return result[0].values.map(row => {
      const cols = result[0].columns;
      const session = {};
      cols.forEach((col, i) => { session[col] = row[i]; });
      return session;
    });
  }

  /**
   * Create chunks for a sync session
   */
  createSyncChunks(sessionId, chunks) {
    if (!this.db) return;

    for (let i = 0; i < chunks.length; i++) {
      this.db.run(
        `INSERT INTO tally_sync_chunks (session_id, chunk_index, status, items_count)
         VALUES (?, ?, 'pending', ?)`,
        [sessionId, i, chunks[i].length]
      );
    }
    this.save();
  }

  /**
   * Update a sync chunk
   */
  updateSyncChunk(sessionId, chunkIndex, fields) {
    if (!this.db) return;

    const allowed = ['status', 'attempts', 'error'];
    const updates = [];
    const values = [];

    for (const [key, value] of Object.entries(fields)) {
      if (allowed.includes(key)) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (updates.length === 0) return;
    values.push(sessionId, chunkIndex);

    this.db.run(`UPDATE tally_sync_chunks SET ${updates.join(', ')} WHERE session_id = ? AND chunk_index = ?`, values);
    this.save();
  }

  /**
   * Get pending chunks for a session
   */
  getPendingChunks(sessionId) {
    if (!this.db) return [];

    const result = this.db.exec(
      `SELECT * FROM tally_sync_chunks WHERE session_id = ? AND status != 'completed' ORDER BY chunk_index ASC`,
      [sessionId]
    );
    if (!result.length || !result[0].values.length) return [];

    return result[0].values.map(row => {
      const cols = result[0].columns;
      const chunk = {};
      cols.forEach((col, i) => { chunk[col] = row[i]; });
      return chunk;
    });
  }

  /**
   * Get sync history (recent sessions)
   */
  getSyncHistory(limit = 20) {
    if (!this.db) return [];

    const result = this.db.exec(
      `SELECT * FROM tally_sync_sessions ORDER BY started_at DESC LIMIT ?`,
      [limit]
    );
    if (!result.length || !result[0].values.length) return [];

    return result[0].values.map(row => {
      const cols = result[0].columns;
      const session = {};
      cols.forEach((col, i) => { session[col] = row[i]; });
      return session;
    });
  }

  /**
   * Clean up old sync data (sessions older than 30 days)
   */
  cleanupOldSyncData() {
    if (!this.db) return;

    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    // Get old session IDs
    const result = this.db.exec(
      `SELECT id FROM tally_sync_sessions WHERE started_at < ? AND status != 'in_progress'`,
      [thirtyDaysAgo]
    );

    if (result.length && result[0].values.length) {
      for (const row of result[0].values) {
        const sessionId = row[0];
        this.db.run(`DELETE FROM tally_sync_chunks WHERE session_id = ?`, [sessionId]);
      }
    }

    this.db.run(`DELETE FROM tally_sync_sessions WHERE started_at < ? AND status != 'in_progress'`, [thirtyDaysAgo]);
    this.save();
    console.log('[QUEUE] Cleaned up old sync data');
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.save();
      this.db.close();
      console.log('[QUEUE] Database closed');
    }
  }
}

module.exports = new QueueService();
