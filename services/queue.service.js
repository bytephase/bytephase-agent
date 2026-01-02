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
