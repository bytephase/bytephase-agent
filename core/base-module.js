/**
 * BaseModule - Base class for all agent modules
 *
 * All modules must extend this class and implement required methods.
 * This provides a standard interface for the module system.
 */

class BaseModule {
  constructor() {
    // Module metadata
    this.name = '';
    this.version = '1.0.0';
    this.description = '';
    this.enabled = false;

    // Module configuration
    this.config = {};

    // Module state
    this.initialized = false;
    this.active = false;
  }

  /**
   * Lifecycle: Initialize module
   * Called once when module is first loaded
   * Use this to set up resources, connections, etc.
   */
  async initialize() {
    console.log(`[${this.name.toUpperCase()}] Initializing...`);
    this.initialized = true;
  }

  /**
   * Lifecycle: Activate module
   * Called when module is enabled
   * Use this to start services, listeners, etc.
   */
  async activate() {
    console.log(`[${this.name.toUpperCase()}] Activating...`);
    this.active = true;
  }

  /**
   * Lifecycle: Deactivate module
   * Called when module is disabled
   * Use this to stop services, clean up, etc.
   */
  async deactivate() {
    console.log(`[${this.name.toUpperCase()}] Deactivating...`);
    this.active = false;
  }

  /**
   * Lifecycle: Destroy module
   * Called when module is removed
   * Use this to clean up all resources
   */
  async destroy() {
    console.log(`[${this.name.toUpperCase()}] Destroying...`);
    this.initialized = false;
    this.active = false;
  }

  /**
   * Check if this module can handle a specific job type
   *
   * @param {string} jobType - Job type (e.g., 'tally.voucher.create')
   * @returns {boolean} - True if module can handle this job
   */
  canHandle(jobType) {
    throw new Error(`${this.name}: canHandle() must be implemented`);
  }

  /**
   * Execute a job
   *
   * @param {object} job - Job object with type, payload, etc.
   * @returns {Promise<object>} - Job result
   */
  async execute(job) {
    throw new Error(`${this.name}: execute() must be implemented`);
  }

  /**
   * Get module configuration schema
   * Defines what configuration options are available
   *
   * @returns {object} - Configuration schema
   */
  getConfigSchema() {
    return {};
  }

  /**
   * Validate module configuration
   *
   * @param {object} config - Configuration to validate
   * @returns {boolean} - True if valid
   */
  validateConfig(config) {
    return true;
  }

  /**
   * Update module configuration
   *
   * @param {object} config - New configuration
   */
  updateConfig(config) {
    if (this.validateConfig(config)) {
      this.config = { ...this.config, ...config };
      console.log(`[${this.name.toUpperCase()}] Configuration updated`);
      return true;
    }
    return false;
  }

  /**
   * Check if module has UI components
   *
   * @returns {boolean} - True if module has UI
   */
  hasUI() {
    return false;
  }

  /**
   * Get UI component path (if any)
   *
   * @returns {string|null} - Path to UI HTML file
   */
  getUIComponent() {
    return null;
  }

  /**
   * Get module status for display
   *
   * @returns {object} - Module status
   */
  getStatus() {
    return {
      name: this.name,
      version: this.version,
      description: this.description,
      enabled: this.enabled,
      initialized: this.initialized,
      active: this.active,
      config: this.config
    };
  }

  /**
   * Get module capabilities
   * What job types can this module handle?
   *
   * @returns {array} - Array of job type patterns
   */
  getCapabilities() {
    return [];
  }

  /**
   * Health check
   * Override this to implement module-specific health checks
   *
   * @returns {Promise<object>} - Health status
   */
  async healthCheck() {
    return {
      healthy: this.active && this.initialized,
      message: 'OK'
    };
  }
}

module.exports = BaseModule;
