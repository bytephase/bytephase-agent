const tokenService = require('./token.service');
const authService = require('./auth.service');

/**
 * Deep Link Service
 * Handles URL parsing and orchestrates the deep link connection flow
 */
class DeepLinkService {
  constructor() {
    this.isProcessing = false; // Prevent concurrent processing
  }

  /**
   * Parse bytephase:// URL
   * @param {string} url - The deep link URL
   * @returns {Object} { success: true, action: 'connect', params: {...} } or error
   */
  parseDeepLink(url) {
    try {
      // Validate protocol
      if (!url.startsWith('bytephase://')) {
        return { success: false, error: 'Invalid protocol. Expected bytephase://' };
      }

      // Parse URL
      const urlObj = new URL(url);
      const action = urlObj.hostname; // e.g., 'connect'

      // Extract query parameters
      const params = {};
      for (const [key, value] of urlObj.searchParams) {
        params[key] = value;
      }

      // Validate action
      if (!action) {
        return { success: false, error: 'No action specified in deep link' };
      }

      console.log(`[DEEPLINK] Parsed: action=${action}, params=${JSON.stringify(params)}`);

      return {
        success: true,
        action: action,
        params: params
      };

    } catch (error) {
      console.error('[DEEPLINK] Parse error:', error);
      return { success: false, error: 'Invalid URL format' };
    }
  }

  /**
   * Handle deep link connection request
   * @param {string} token - The connection token from the URL
   * @returns {Object} { success: true/false, error: '...', agentId, shopId }
   */
  async handleConnect(token) {
    // Prevent concurrent processing
    if (this.isProcessing) {
      console.warn('[DEEPLINK] Connection already in progress');
      return { success: false, error: 'Connection already in progress. Please wait.' };
    }

    this.isProcessing = true;

    try {
      console.log('[DEEPLINK] Handling connect request...');

      // 1. Validate token
      const validation = tokenService.validateToken(token);
      if (!validation.success) {
        console.error('[DEEPLINK] Token validation failed:', validation.error);
        return { success: false, error: validation.error };
      }

      const payload = validation.payload;
      console.log('[DEEPLINK] Token validated:', {
        shop_id: payload.metadata?.shop_id,
        nonce: payload.nonce
      });

      // 2. Extract API key from payload
      const apiKey = payload.api_key;
      const metadata = payload.metadata || {};

      // 3. Mark token as used (prevent replay attacks)
      tokenService.markTokenAsUsed(payload.nonce, payload.timestamp);

      // 4. Verify API key with cloud (existing method from auth service)
      console.log('[DEEPLINK] Verifying API key with cloud...');
      const result = await authService.verifyAndConfigureWithApiKey(
        apiKey,
        metadata.cloud_url
      );

      if (!result.success) {
        console.error('[DEEPLINK] API key verification failed:', result.error);
        return { success: false, error: result.error };
      }

      console.log('[DEEPLINK] API key verified successfully');

      // 5. Save credentials (existing method from auth service)
      await authService.setCredentials({
        apiKey: apiKey,
        agentId: result.agentId,
        shopId: result.shopId,
        cloudUrl: result.cloudUrl
      });

      console.log('[DEEPLINK] Credentials saved');

      // 6. Return success with agent info
      return {
        success: true,
        agentId: result.agentId,
        shopId: result.shopId,
        modules: result.modules,
        metadata: result.metadata
      };

    } catch (error) {
      console.error('[DEEPLINK] Error handling connection:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred during connection'
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Main entry point for processing deep links
   * @param {string} url - The full deep link URL (e.g., bytephase://connect?token=xxx)
   * @returns {Object} Result of the deep link action
   */
  async processDeepLink(url) {
    console.log('[DEEPLINK] Processing:', url);

    // 1. Parse URL
    const parsed = this.parseDeepLink(url);
    if (!parsed.success) {
      console.error('[DEEPLINK] Parse failed:', parsed.error);
      return { success: false, error: parsed.error };
    }

    // 2. Route to appropriate handler based on action
    switch (parsed.action) {
      case 'connect':
        // Validate token parameter exists
        if (!parsed.params.token) {
          return { success: false, error: 'Missing token parameter in deep link' };
        }
        return await this.handleConnect(parsed.params.token);

      case 'disconnect':
        // Future: Handle disconnect action
        return { success: false, error: 'Disconnect action not yet implemented' };

      case 'configure':
        // Future: Handle configuration action
        return { success: false, error: 'Configure action not yet implemented' };

      default:
        return { success: false, error: `Unknown action: ${parsed.action}` };
    }
  }

  /**
   * Check if currently processing a deep link
   * @returns {boolean}
   */
  isCurrentlyProcessing() {
    return this.isProcessing;
  }
}

// Export singleton instance
module.exports = new DeepLinkService();
