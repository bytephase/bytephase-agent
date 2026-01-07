/**
 * JobRouter - Routes jobs to appropriate modules
 *
 * This is the main entry point for job execution.
 * It finds the right module and delegates the job.
 */

const moduleManager = require('./module-manager');
const eventBus = require('./event-bus');

class JobRouter {
  constructor() {
    this.jobHistory = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Route job to appropriate module
   *
   * @param {object} job - Job object
   * @returns {Promise<object>} - Result with success/error
   */
  async route(job) {
    const startTime = Date.now();

    console.log(`[ROUTER] Routing job: ${job.type} (ID: ${job.id || 'unknown'})`);

    try {
      // Find handler
      const handler = moduleManager.findHandler(job.type);

      if (!handler) {
        throw new Error(`No module can handle job type: ${job.type}`);
      }

      // Execute job
      const result = await moduleManager.executeJob(job);

      const duration = Date.now() - startTime;

      console.log(`[ROUTER] Job completed: ${job.type} (${duration}ms)`);

      // Save to history
      this.addToHistory({
        jobId: job.id,
        type: job.type,
        module: handler.name,
        success: true,
        duration: duration,
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        result: result,
        module: handler.name,
        duration: duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      console.error(`[ROUTER] Job failed: ${job.type} (${duration}ms)`, error.message);

      // Save to history
      this.addToHistory({
        jobId: job.id,
        type: job.type,
        module: 'unknown',
        success: false,
        error: error.message,
        duration: duration,
        timestamp: new Date().toISOString()
      });

      return {
        success: false,
        error: error.message,
        duration: duration
      };
    }
  }

  /**
   * Check if any module can handle this job type
   *
   * @param {string} jobType - Job type
   * @returns {boolean} - True if can be handled
   */
  canHandle(jobType) {
    return moduleManager.findHandler(jobType) !== null;
  }

  /**
   * Get the module that would handle this job type
   *
   * @param {string} jobType - Job type
   * @returns {string|null} - Module name or null
   */
  getHandlerName(jobType) {
    const handler = moduleManager.findHandler(jobType);
    return handler ? handler.name : null;
  }

  /**
   * Add job to history
   *
   * @param {object} record - Job execution record
   */
  addToHistory(record) {
    this.jobHistory.unshift(record);

    // Keep history size limited
    if (this.jobHistory.length > this.maxHistorySize) {
      this.jobHistory = this.jobHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Get job history
   *
   * @param {number} limit - Max records to return
   * @returns {Array} - Job history
   */
  getHistory(limit = 100) {
    return this.jobHistory.slice(0, limit);
  }

  /**
   * Get job statistics
   *
   * @returns {object} - Statistics
   */
  getStats() {
    const total = this.jobHistory.length;
    const successful = this.jobHistory.filter(j => j.success).length;
    const failed = total - successful;

    const avgDuration = total > 0
      ? this.jobHistory.reduce((sum, j) => sum + j.duration, 0) / total
      : 0;

    return {
      total: total,
      successful: successful,
      failed: failed,
      successRate: total > 0 ? (successful / total * 100).toFixed(2) + '%' : '0%',
      avgDuration: Math.round(avgDuration) + 'ms'
    };
  }

  /**
   * Clear job history
   */
  clearHistory() {
    this.jobHistory = [];
    console.log('[ROUTER] Job history cleared');
  }
}

// Export singleton instance
module.exports = new JobRouter();
