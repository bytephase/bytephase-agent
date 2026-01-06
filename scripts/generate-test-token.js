#!/usr/bin/env node

/**
 * Test Token Generator
 * Generates valid deep link tokens for testing without backend
 *
 * Usage:
 *   node scripts/generate-test-token.js <api_key> [shop_id] [cloud_url]
 *
 * Examples:
 *   node scripts/generate-test-token.js bp_test_key_123
 *   node scripts/generate-test-token.js bp_test_key_123 shop_456
 *   node scripts/generate-test-token.js bp_test_key_123 shop_456 https://api.bytephase.com
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// MUST match the secret in services/token.service.js
const SHARED_SECRET = 'bytephase-token-secret-256bit-change-in-prod';

/**
 * Generate a test token
 * @param {string} apiKey - The API key to encode
 * @param {string} shopId - Shop ID (optional)
 * @param {string} cloudUrl - Cloud URL (optional)
 * @returns {string} - Full deep link URL
 */
function generateTestToken(apiKey, shopId = 'shop_test_123', cloudUrl = 'http://localhost:8000') {
  const payload = {
    api_key: apiKey,
    timestamp: Date.now(),
    nonce: uuidv4(),
    metadata: {
      shop_id: shopId,
      cloud_url: cloudUrl
    }
  };

  const payloadString = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadString).toString('base64url');

  // Create HMAC signature
  const hmac = crypto.createHmac('sha256', SHARED_SECRET);
  hmac.update(payloadString);
  const signature = hmac.digest('base64url');

  const token = `${payloadB64}.${signature}`;
  const deeplink = `bytephase://connect?token=${token}`;

  return {
    deeplink,
    payload,
    token
  };
}

/**
 * Generate an expired token (for testing expiry validation)
 */
function generateExpiredToken(apiKey, shopId = 'shop_test_123') {
  const payload = {
    api_key: apiKey,
    timestamp: Date.now() - (10 * 60 * 1000), // 10 minutes ago (expired)
    nonce: uuidv4(),
    metadata: {
      shop_id: shopId,
      cloud_url: 'http://localhost:8000'
    }
  };

  const payloadString = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadString).toString('base64url');

  const hmac = crypto.createHmac('sha256', SHARED_SECRET);
  hmac.update(payloadString);
  const signature = hmac.digest('base64url');

  const token = `${payloadB64}.${signature}`;
  return `bytephase://connect?token=${token}`;
}

/**
 * Generate an invalid token (for testing signature validation)
 */
function generateInvalidToken(apiKey) {
  const payload = {
    api_key: apiKey,
    timestamp: Date.now(),
    nonce: uuidv4(),
    metadata: {
      shop_id: 'shop_test_123',
      cloud_url: 'http://localhost:8000'
    }
  };

  const payloadString = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadString).toString('base64url');

  // Use wrong secret to create invalid signature
  const hmac = crypto.createHmac('sha256', 'wrong-secret');
  hmac.update(payloadString);
  const signature = hmac.digest('base64url');

  const token = `${payloadB64}.${signature}`;
  return `bytephase://connect?token=${token}`;
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('BytePhase Test Token Generator\n');
    console.log('Usage:');
    console.log('  node scripts/generate-test-token.js <api_key> [shop_id] [cloud_url]\n');
    console.log('Options:');
    console.log('  --expired    Generate an expired token (for testing)');
    console.log('  --invalid    Generate a token with invalid signature (for testing)\n');
    console.log('Examples:');
    console.log('  node scripts/generate-test-token.js bp_test_key_123');
    console.log('  node scripts/generate-test-token.js bp_test_key_123 shop_456');
    console.log('  node scripts/generate-test-token.js bp_test_key_123 shop_456 https://api.bytephase.com');
    console.log('  node scripts/generate-test-token.js bp_test_key_123 --expired');
    console.log('  node scripts/generate-test-token.js bp_test_key_123 --invalid\n');
    process.exit(1);
  }

  const apiKey = args[0];

  // Check for special flags
  if (args.includes('--expired')) {
    const shopId = args[1] !== '--expired' ? args[1] : 'shop_test_123';
    const deeplink = generateExpiredToken(apiKey, shopId);

    console.log('\n=== EXPIRED TOKEN (for testing) ===\n');
    console.log('This token is already expired and should be rejected.\n');
    console.log('Deep Link:');
    console.log(deeplink);
    console.log('\nTo test:');
    console.log(`  open "${deeplink}"`);
    console.log('\nExpected: Error notification "Connection link has expired"\n');
    process.exit(0);
  }

  if (args.includes('--invalid')) {
    const deeplink = generateInvalidToken(apiKey);

    console.log('\n=== INVALID TOKEN (for testing) ===\n');
    console.log('This token has an invalid signature and should be rejected.\n');
    console.log('Deep Link:');
    console.log(deeplink);
    console.log('\nTo test:');
    console.log(`  open "${deeplink}"`);
    console.log('\nExpected: Error notification "Security verification failed"\n');
    process.exit(0);
  }

  // Generate normal valid token
  const shopId = args[1] || 'shop_test_123';
  const cloudUrl = args[2] || 'http://localhost:8000';

  const result = generateTestToken(apiKey, shopId, cloudUrl);

  console.log('\n=== VALID TOKEN GENERATED ===\n');
  console.log('Deep Link:');
  console.log(result.deeplink);
  console.log('\nPayload:');
  console.log(JSON.stringify(result.payload, null, 2));
  console.log('\nToken:');
  console.log(result.token);
  console.log('\n=== HOW TO TEST ===\n');
  console.log('1. Make sure the BytePhase Agent is running (or not, to test cold start)');
  console.log('\n2. Open the deep link:');
  console.log('   macOS:   open "' + result.deeplink + '"');
  console.log('   Windows: start ' + result.deeplink);
  console.log('   Linux:   xdg-open "' + result.deeplink + '"');
  console.log('\n3. Expected behavior:');
  console.log('   - Agent launches (if not running)');
  console.log('   - Attempts to verify API key with cloud');
  console.log('   - Shows notification with result');
  console.log('\nNote: This will attempt to verify the API key with the backend.');
  console.log('      If backend is not available, you\'ll see connection errors.\n');
}

module.exports = {
  generateTestToken,
  generateExpiredToken,
  generateInvalidToken
};
