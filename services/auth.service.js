const Store = require('electron-store');
const { machineId } = require('node-machine-id');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { app } = require('electron');

class AuthService {
  constructor() {
    this.store = new Store({
      name: 'agent-credentials',
      encryptionKey: 'bytephase-tally-agent-secure-key'
    });
  }

  /**
   * Initialize agent with API credentials
   * @param {Object} credentials - { apiKey, agentId, shopId, cloudUrl }
   */
  async setCredentials(credentials) {
    this.store.set('apiKey', credentials.apiKey);
    this.store.set('agentId', credentials.agentId);
    this.store.set('shopId', credentials.shopId);
    this.store.set('cloudUrl', credentials.cloudUrl);
    this.store.set('registeredAt', new Date().toISOString());

    console.log('[AUTH] Credentials saved successfully');
  }

  /**
   * Get stored API key
   */
  getApiKey() {
    return this.store.get('apiKey');
  }

  /**
   * Get agent ID
   */
  getAgentId() {
    return this.store.get('agentId');
  }

  /**
   * Get shop ID
   */
  getShopId() {
    return this.store.get('shopId');
  }

  /**
   * Get cloud URL
   */
  getCloudUrl() {
    return this.store.get('cloudUrl');
  }

  /**
   * Get all agent info
   */
  getAgentInfo() {
    return {
      agentId: this.getAgentId(),
      shopId: this.getShopId(),
      apiKey: this.getApiKey(),
      cloudUrl: this.getCloudUrl()
    };
  }

  /**
   * Check if agent is registered
   */
  isRegistered() {
    return !!(this.getApiKey() && this.getAgentId());
  }

  /**
   * Get machine ID (unique to this computer)
   */
  async getMachineId() {
    try {
      return await machineId();
    } catch (error) {
      console.error('[AUTH] Error getting machine ID:', error);
      // Fallback: generate and store a UUID
      let fallbackId = this.store.get('machineId');
      if (!fallbackId) {
        fallbackId = uuidv4();
        this.store.set('machineId', fallbackId);
      }
      return fallbackId;
    }
  }

  /**
   * Clear all credentials (logout)
   */
  clearCredentials() {
    this.store.clear();
    console.log('[AUTH] Credentials cleared');
  }

  /**
   * Get authorization header
   */
  getAuthHeader() {
    const apiKey = this.getApiKey();
    return apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {};
  }

  /**
   * Verify API key and fetch configuration from cloud
   * @param {string} apiKey - The API key to verify
   * @param {string} cloudUrl - Optional cloud URL (defaults to production)
   * @returns {Promise<Object>} - Configuration from cloud
   */
  async verifyAndConfigureWithApiKey(apiKey, cloudUrl = null) {
    try {
      // Get machine ID for registration
      const deviceId = await this.getMachineId();
      const deviceName = require('os').hostname();

      // Default cloud URLs to try
      const urlsToTry = cloudUrl
        ? [cloudUrl]
        : [
            'https://api.bytephase.com',
            'https://bytephase.com',
            'http://localhost:8000'  // For local development
          ];

      let lastError = null;

      // Try each URL
      for (const url of urlsToTry) {
        try {
          console.log(`[AUTH] Trying to verify API key with: ${url}`);

          const response = await axios.post(
            `${url}/api/agent/verify-key`,
            {
              api_key: apiKey,
              device_id: deviceId,
              device_name: deviceName,
              agent_version: app.getVersion(),
              platform: process.platform
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': `BytePhaseAgent/${app.getVersion()}`
              },
              timeout: 10000 // 10 second timeout
            }
          );

          // Success! Return the configuration
          const config = response.data;

          console.log('[AUTH] API key verified successfully');

          // Validate required fields
          if (!config.agent_id || !config.shop_id) {
            throw new Error('Invalid response from server: missing agent_id or shop_id');
          }

          return {
            success: true,
            cloudUrl: url,
            agentId: config.agent_id,
            shopId: config.shop_id,
            modules: config.modules || {},
            metadata: config.metadata || {}
          };

        } catch (error) {
          lastError = error;

          // If it's a 401/403, API key is invalid - no point trying other URLs
          if (error.response?.status === 401 || error.response?.status === 403) {
            throw new Error('Invalid API key. Please check your API key from BytePhase CRM.');
          }

          // Otherwise, try next URL
          console.log(`[AUTH] Failed with ${url}: ${error.message}`);
          continue;
        }
      }

      // All URLs failed
      throw new Error(lastError?.message || 'Could not connect to BytePhase cloud. Please check your internet connection.');

    } catch (error) {
      console.error('[AUTH] Verification failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new AuthService();
