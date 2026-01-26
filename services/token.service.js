const crypto = require('crypto');
const Store = require('electron-store');
const { v4: uuidv4 } = require('uuid');

/**
 * Token Service
 * Handles token generation, validation, HMAC verification, and replay attack prevention
 */
class TokenService {
  constructor() {
    // Use electron-store for persistent nonce tracking
    this.store = new Store({
      name: 'token-nonces',
      encryptionKey: 'bytephase-token-nonce-store-secure'
    });

    // Shared secret for HMAC verification (MUST match Laravel backend)
    // TODO: Change this in production and match with backend .env AGENT_TOKEN_SECRET
    this.SHARED_SECRET = 'bytephase-token-secret-256bit-change-in-prod';

    // Token expiry: 10 minutes (increased from 5 to handle slow systems and browser delays)
    this.TOKEN_EXPIRY_MS = 10 * 60 * 1000;
  }

  /**
   * Validate and decode incoming token from deep link
   * @param {string} tokenString - The token string from the URL
   * @returns {Object} { success: true, payload: {...} } or { success: false, error: '...' }
   */
  validateToken(tokenString) {
    try {
      // 1. Split token into payload and signature
      const parts = tokenString.split('.');
      if (parts.length !== 2) {
        return { success: false, error: 'Invalid token format' };
      }

      const [payloadB64, signatureB64] = parts;

      // 2. Decode payload
      const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
      const payload = JSON.parse(payloadJson);

      // 3. Verify HMAC signature
      const hmac = crypto.createHmac('sha256', this.SHARED_SECRET);
      hmac.update(payloadJson);
      const expectedSignature = hmac.digest('base64url');

      if (signatureB64 !== expectedSignature) {
        console.error('[TOKEN] Invalid signature');
        return {
          success: false,
          error: 'Invalid connection link. Security verification failed.'
        };
      }

      // 4. Validate required fields
      if (!payload.api_key || !payload.timestamp || !payload.nonce) {
        return {
          success: false,
          error: 'Invalid token: missing required fields'
        };
      }

      // 5. Check expiry
      const now = Date.now();
      const age = now - payload.timestamp;
      if (age > this.TOKEN_EXPIRY_MS) {
        console.error('[TOKEN] Token expired:', { age, limit: this.TOKEN_EXPIRY_MS });
        return {
          success: false,
          error: 'Connection link has expired. Please request a new link from BytePhase CRM.'
        };
      }

      // Also check if timestamp is in the future (clock skew protection)
      if (age < -60000) { // More than 1 minute in future
        console.error('[TOKEN] Token timestamp in future:', { age });
        return {
          success: false,
          error: 'Invalid connection link. Please check your system time.'
        };
      }

      // 6. Check if already used
      if (this.isNonceUsed(payload.nonce)) {
        console.error('[TOKEN] Nonce already used:', payload.nonce);
        return {
          success: false,
          error: 'This connection link has already been used. Please request a new link.'
        };
      }

      // Token is valid!
      console.log('[TOKEN] Token validated successfully');
      return { success: true, payload };

    } catch (error) {
      console.error('[TOKEN] Validation error:', error);
      return { success: false, error: 'Invalid token format' };
    }
  }

  /**
   * Mark token as used (store nonce)
   * @param {string} nonce - The nonce from the token
   * @param {number} timestamp - The timestamp from the token
   */
  markTokenAsUsed(nonce, timestamp) {
    this.store.set(`nonce:${nonce}`, {
      usedAt: new Date().toISOString(),
      expiresAt: timestamp + this.TOKEN_EXPIRY_MS
    });
    console.log('[TOKEN] Nonce marked as used:', nonce);
  }

  /**
   * Check if nonce was already used
   * @param {string} nonce - The nonce to check
   * @returns {boolean} - True if nonce was already used
   */
  isNonceUsed(nonce) {
    return this.store.has(`nonce:${nonce}`);
  }

  /**
   * Cleanup expired nonces (called periodically)
   */
  cleanupExpiredNonces() {
    const now = Date.now();
    const store = this.store.store;
    let cleanedCount = 0;

    for (const key in store) {
      if (key.startsWith('nonce:')) {
        const data = store[key];
        if (data.expiresAt < now) {
          this.store.delete(key);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`[TOKEN] Cleaned up ${cleanedCount} expired nonces`);
    }
  }

  /**
   * Generate token (for testing/future backend reference)
   * This will be implemented in Laravel, but useful for testing
   * @param {string} apiKey - The API key to encode
   * @param {Object} metadata - Metadata (shop_id, cloud_url, etc.)
   * @returns {string} - Full token string: payload.signature
   */
  generateToken(apiKey, metadata = {}) {
    const payload = {
      api_key: apiKey,
      timestamp: Date.now(),
      nonce: uuidv4(),
      metadata: {
        shop_id: metadata.shop_id || 'test_shop',
        cloud_url: metadata.cloud_url || 'http://localhost:8000',
        ...metadata
      }
    };

    // Convert payload to JSON string
    const payloadJson = JSON.stringify(payload);

    // Encode payload as Base64URL
    const payloadB64 = Buffer.from(payloadJson).toString('base64url');

    // Create HMAC signature
    const hmac = crypto.createHmac('sha256', this.SHARED_SECRET);
    hmac.update(payloadJson);
    const signature = hmac.digest('base64url');

    // Combine payload and signature
    const token = `${payloadB64}.${signature}`;

    console.log('[TOKEN] Generated token for testing');
    return token;
  }

  /**
   * Get token statistics (for debugging)
   * @returns {Object} - Statistics about stored nonces
   */
  getStats() {
    const store = this.store.store;
    const keys = Object.keys(store).filter(k => k.startsWith('nonce:'));
    const now = Date.now();

    const expired = keys.filter(k => store[k].expiresAt < now).length;
    const active = keys.length - expired;

    return {
      total: keys.length,
      active: active,
      expired: expired
    };
  }
}

// Export singleton instance
module.exports = new TokenService();
