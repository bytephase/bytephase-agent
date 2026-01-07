/**
 * ModuleManager - Manages module lifecycle and execution
 *
 * Responsibilities:
 * - Load modules from /modules directory
 * - Enable/disable modules
 * - Route jobs to appropriate modules
 * - Manage module configuration
 */

const fs = require('fs');
const path = require('path');
const eventBus = require('./event-bus');

class ModuleManager {
  constructor() {
    this.modules = new Map();
    this.enabledModules = new Set();
    this.modulesDir = path.join(__dirname, '../modules');
  }

  /**
   * Register a module instance
   *
   * @param {BaseModule} moduleInstance - Module instance
   */
  register(moduleInstance) {
    if (!moduleInstance.name) {
      throw new Error('Module must have a name');
    }

    if (this.modules.has(moduleInstance.name)) {
      console.warn(`[MODULE] Module already registered: ${moduleInstance.name}`);
      return;
    }

    console.log(`[MODULE] Registering: ${moduleInstance.name} v${moduleInstance.version}`);

    this.modules.set(moduleInstance.name, moduleInstance);

    eventBus.publish('module:registered', {
      name: moduleInstance.name,
      version: moduleInstance.version
    });
  }

  /**
   * Load all modules from /modules directory
   */
  async loadAll() {
    console.log('[MODULE] Loading all modules...');

    if (!fs.existsSync(this.modulesDir)) {
      console.log('[MODULE] No modules directory found, creating...');
      fs.mkdirSync(this.modulesDir, { recursive: true });
      return;
    }

    const moduleDirs = fs.readdirSync(this.modulesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    console.log(`[MODULE] Found ${moduleDirs.length} module(s): ${moduleDirs.join(', ')}`);

    for (const dir of moduleDirs) {
      try {
        await this.loadModule(dir);
      } catch (error) {
        console.error(`[MODULE] Failed to load module ${dir}:`, error.message);
      }
    }

    console.log(`[MODULE] Loaded ${this.modules.size} module(s)`);
  }

  /**
   * Load a specific module
   *
   * @param {string} moduleName - Module directory name
   */
  async loadModule(moduleName) {
    const modulePath = path.join(this.modulesDir, moduleName, 'index.js');

    if (!fs.existsSync(modulePath)) {
      throw new Error(`Module entry point not found: ${modulePath}`);
    }

    console.log(`[MODULE] Loading: ${moduleName}`);

    const ModuleClass = require(modulePath);
    const moduleInstance = new ModuleClass();

    this.register(moduleInstance);
  }

  /**
   * Enable a module
   *
   * @param {string} moduleName - Module name
   * @param {object} config - Module configuration
   */
  async enable(moduleName, config = {}) {
    const module = this.modules.get(moduleName);

    if (!module) {
      throw new Error(`Module not found: ${moduleName}`);
    }

    if (this.enabledModules.has(moduleName)) {
      console.log(`[MODULE] Already enabled: ${moduleName}`);
      return module;
    }

    console.log(`[MODULE] Enabling: ${moduleName}`);

    // Update configuration
    if (config && Object.keys(config).length > 0) {
      module.updateConfig(config);
    }

    // Initialize if not already initialized
    if (!module.initialized) {
      await module.initialize();
    }

    // Activate module
    await module.activate();

    this.enabledModules.add(moduleName);
    module.enabled = true;

    eventBus.publish('module:enabled', {
      name: moduleName,
      config: module.config
    });

    return module;
  }

  /**
   * Disable a module
   *
   * @param {string} moduleName - Module name
   */
  async disable(moduleName) {
    const module = this.modules.get(moduleName);

    if (!module) {
      console.warn(`[MODULE] Module not found: ${moduleName}`);
      return;
    }

    if (!this.enabledModules.has(moduleName)) {
      console.log(`[MODULE] Already disabled: ${moduleName}`);
      return;
    }

    console.log(`[MODULE] Disabling: ${moduleName}`);

    await module.deactivate();

    this.enabledModules.delete(moduleName);
    module.enabled = false;

    eventBus.publish('module:disabled', {
      name: moduleName
    });
  }

  /**
   * Find module that can handle a job type
   *
   * @param {string} jobType - Job type (e.g., 'tally.voucher.create')
   * @returns {BaseModule|null} - Module that can handle this job
   */
  findHandler(jobType) {
    for (const [name, module] of this.modules) {
      if (module.enabled && module.canHandle(jobType)) {
        return module;
      }
    }
    return null;
  }

  /**
   * Execute a job
   *
   * @param {object} job - Job object
   * @returns {Promise<object>} - Job result
   */
  async executeJob(job) {
    const handler = this.findHandler(job.type);

    if (!handler) {
      throw new Error(`No module can handle job type: ${job.type}`);
    }

    console.log(`[MODULE] Executing ${job.type} with ${handler.name}`);

    eventBus.publish('job:start', {
      jobId: job.id,
      type: job.type,
      module: handler.name
    });

    try {
      const result = await handler.execute(job);

      eventBus.publish('job:complete', {
        jobId: job.id,
        type: job.type,
        module: handler.name,
        result: result
      });

      return result;

    } catch (error) {
      eventBus.publish('job:error', {
        jobId: job.id,
        type: job.type,
        module: handler.name,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Get a specific module
   *
   * @param {string} moduleName - Module name
   * @returns {BaseModule|null} - Module instance
   */
  getModule(moduleName) {
    return this.modules.get(moduleName) || null;
  }

  /**
   * Get all modules
   *
   * @returns {Array} - Array of module status objects
   */
  getAll() {
    return Array.from(this.modules.values()).map(m => m.getStatus());
  }

  /**
   * Get enabled modules
   *
   * @returns {Array} - Array of enabled module names
   */
  getEnabled() {
    return Array.from(this.enabledModules);
  }

  /**
   * Check if module is enabled
   *
   * @param {string} moduleName - Module name
   * @returns {boolean} - True if enabled
   */
  isEnabled(moduleName) {
    return this.enabledModules.has(moduleName);
  }

  /**
   * Get module count
   *
   * @returns {object} - Module counts
   */
  getCount() {
    return {
      total: this.modules.size,
      enabled: this.enabledModules.size,
      disabled: this.modules.size - this.enabledModules.size
    };
  }

  /**
   * Health check all enabled modules
   *
   * @returns {Promise<object>} - Health status
   */
  async healthCheck() {
    const results = {};

    for (const [name, module] of this.modules) {
      if (module.enabled) {
        try {
          results[name] = await module.healthCheck();
        } catch (error) {
          results[name] = {
            healthy: false,
            message: error.message
          };
        }
      }
    }

    return results;
  }
}

// Export singleton instance
module.exports = new ModuleManager();
