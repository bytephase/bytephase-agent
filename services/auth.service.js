const Store = require('electron-store');
const { machineId } = require('node-machine-id');
const { v4: uuidv4 } = require('uuid');

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
}

module.exports = new AuthService();
