const axios = require('axios');
const { app } = require('electron');
const config = require('../config/default.json');
const authService = require('./auth.service');
const tallyService = require('./tally.service');
const queueService = require('./queue.service');

class PollingService {
  constructor() {
    this.interval = config.pollInterval;
    this.minInterval = config.pollIntervalMin;
    this.maxInterval = config.pollIntervalMax;
    this.maxRetries = config.maxRetries;
    this.backoffMultiplier = config.backoffMultiplier;
    this.isRunning = false;
    this.timeoutId = null;
    this.stats = {
      totalPolls: 0,
      successfulPolls: 0,
      failedPolls: 0,
      jobsProcessed: 0,
      jobsFailed: 0,
      lastPollTime: null,
      lastSuccessTime: null,
      consecutiveFailures: 0
    };
  }

  /**
   * Start polling the cloud service
   */
  async start() {
    if (this.isRunning) {
      console.log('[POLLING] Already running');
      return;
    }

    if (!authService.isRegistered()) {
      console.error('[POLLING] Agent not registered. Cannot start polling.');
      return;
    }

    this.isRunning = true;
    console.log('[POLLING] Service started');
    await this.poll();
  }

  /**
   * Stop polling
   */
  stop() {
    this.isRunning = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    console.log('[POLLING] Service stopped');
  }

  /**
   * Main polling function
   */
  async poll() {
    if (!this.isRunning) return;

    this.stats.totalPolls++;
    this.stats.lastPollTime = new Date();

    try {
      const agentInfo = authService.getAgentInfo();
      const cloudUrl = agentInfo.cloudUrl || config.cloudUrl;

      // Get Tally status
      const tallyRunning = await tallyService.isRunning();
      const tallyVersion = tallyRunning ? await tallyService.getVersion() : null;
      const tallyCompany = tallyRunning ? await tallyService.getCompanyName() : null;

      // Prepare poll request
      const pollData = {
        agent_id: agentInfo.agentId,
        shop_id: agentInfo.shopId,
        status: tallyRunning ? 'idle' : 'tally_offline',
        tally_version: tallyVersion,
        tally_company: tallyCompany,
        agent_version: app.getVersion(),
        queue_stats: queueService.getStats()
      };

      // Poll the cloud
      const response = await axios.post(
        `${cloudUrl}/api/agent/poll`,
        pollData,
        {
          headers: {
            ...authService.getAuthHeader(),
            'User-Agent': `TallyAgent/${app.getVersion()}`,
            'Content-Type': 'application/json'
          },
          timeout: config.requestTimeout
        }
      );

      // Handle successful poll
      this.stats.successfulPolls++;
      this.stats.lastSuccessTime = new Date();
      this.stats.consecutiveFailures = 0;

      // Update interval from server if provided
      if (response.data.poll_interval) {
        this.interval = response.data.poll_interval * 1000;
        this.interval = Math.max(this.minInterval, Math.min(this.maxInterval, this.interval));
      }

      // Process jobs if any
      if (response.data.jobs && response.data.jobs.length > 0) {
        console.log(`[POLLING] Received ${response.data.jobs.length} job(s)`);
        await this.processJobs(response.data.jobs);
      }

      // Sync unreported jobs
      await this.syncUnreportedJobs();

      // Reset interval to normal after successful poll
      if (this.interval > config.pollInterval) {
        this.interval = config.pollInterval;
      }

    } catch (error) {
      this.stats.failedPolls++;
      this.stats.consecutiveFailures++;

      console.error('[POLLING] Error:', error.message);

      // Handle specific errors
      if (error.response?.status === 401) {
        console.error('[POLLING] Authentication failed. Please check API key.');
        this.stop();
        return;
      }

      if (error.response?.status === 429) {
        console.warn('[POLLING] Rate limit exceeded. Backing off...');
        this.interval = Math.min(this.interval * 2, this.maxInterval);
      }

      // Exponential backoff on consecutive failures
      if (this.stats.consecutiveFailures >= 3) {
        this.interval = Math.min(
          this.interval * this.backoffMultiplier,
          this.maxInterval
        );
        console.log(`[POLLING] Backing off to ${this.interval / 1000}s interval`);
      }
    }

    // Schedule next poll
    this.timeoutId = setTimeout(() => this.poll(), this.interval);
  }

  /**
   * Process jobs from cloud
   */
  async processJobs(jobs) {
    for (const job of jobs) {
      try {
        // Check if job was already processed
        if (queueService.isJobProcessed(job.id)) {
          console.log(`[POLLING] Job ${job.id} already processed, skipping`);

          // Send result again (idempotent)
          const completedJobs = queueService.getUnreportedJobs();
          const existingJob = completedJobs.find(j => j.jobId === job.id);
          if (existingJob) {
            await this.reportResult(job.id, existingJob.result);
          }
          continue;
        }

        console.log(`[POLLING] Processing job ${job.id} (${job.type})`);

        // Execute job on Tally
        const result = await tallyService.executeJob(job);

        // Save locally first
        queueService.saveCompletedJob(job.id, result);

        // Report result to cloud
        await this.reportResult(job.id, result);

        this.stats.jobsProcessed++;
        console.log(`[POLLING] Job ${job.id} completed successfully`);

      } catch (error) {
        this.stats.jobsFailed++;
        console.error(`[POLLING] Job ${job.id} failed:`, error.message);

        // Report error to cloud
        await this.reportError(job.id, error);
      }
    }
  }

  /**
   * Report job result to cloud
   */
  async reportResult(jobId, result) {
    try {
      const agentInfo = authService.getAgentInfo();
      const cloudUrl = agentInfo.cloudUrl || config.cloudUrl;

      await axios.post(
        `${cloudUrl}/api/agent/result`,
        {
          agent_id: agentInfo.agentId,
          job_id: jobId,
          status: result.success ? 'completed' : 'failed',
          result: result.data || null,
          error: result.error || null,
          error_type: result.errorType || null,
          completed_at: new Date().toISOString()
        },
        {
          headers: {
            ...authService.getAuthHeader(),
            'Content-Type': 'application/json'
          },
          timeout: config.requestTimeout
        }
      );

      // Mark as reported
      queueService.markReported(jobId);
      console.log(`[POLLING] Result reported for job ${jobId}`);

    } catch (error) {
      console.error(`[POLLING] Failed to report result for job ${jobId}:`, error.message);
      // Will retry on next poll
    }
  }

  /**
   * Report job error to cloud
   */
  async reportError(jobId, error) {
    await this.reportResult(jobId, {
      success: false,
      error: error.message,
      errorType: 'agent_error'
    });
  }

  /**
   * Sync unreported jobs
   */
  async syncUnreportedJobs() {
    const unreportedJobs = queueService.getUnreportedJobs();

    if (unreportedJobs.length === 0) {
      return;
    }

    console.log(`[POLLING] Syncing ${unreportedJobs.length} unreported job(s)`);

    for (const job of unreportedJobs) {
      await this.reportResult(job.jobId, job.result);
    }
  }

  /**
   * Get polling statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      currentInterval: this.interval,
      uptime: this.stats.lastPollTime
        ? Date.now() - this.stats.lastPollTime.getTime()
        : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalPolls: 0,
      successfulPolls: 0,
      failedPolls: 0,
      jobsProcessed: 0,
      jobsFailed: 0,
      lastPollTime: null,
      lastSuccessTime: null,
      consecutiveFailures: 0
    };
  }
}

module.exports = new PollingService();
