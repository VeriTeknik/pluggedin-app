const crypto = require('crypto');

/**
 * Generate a cryptographically secure random secret
 * @param {number} bytes - Number of random bytes to generate (default: 32)
 * @returns {string} Base64-encoded secret
 */
function generateSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64');
}

/**
 * Generate all required secrets for the application
 * @returns {Object} Object containing all generated secrets
 */
function generateAllSecrets() {
  return {
    NEXTAUTH_SECRET: generateSecret(48), // 384 bits
    NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: generateSecret(32), // 256 bits
    UNSUBSCRIBE_TOKEN_SECRET: generateSecret(32), // 256 bits
    API_KEY_ENCRYPTION_SECRET: generateSecret(32), // 256 bits
    REGISTRY_INTERNAL_API_KEY: generateSecret(24), // 192 bits
    ADMIN_MIGRATION_SECRET: generateSecret(32), // 256 bits
  };
}

/**
 * Generate a random database password
 * @returns {string} Random password (alphanumeric, 32 chars)
 */
function generateDatabasePassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  const randomBytes = crypto.randomBytes(32);

  for (let i = 0; i < 32; i++) {
    password += chars[randomBytes[i] % chars.length];
  }

  return password;
}

/**
 * Mask a secret for display (show first 4 and last 4 characters)
 * @param {string} secret - Secret to mask
 * @returns {string} Masked secret (e.g., "oX7k...2k2A")
 */
function maskSecret(secret) {
  if (!secret || secret.length < 12) {
    return '****';
  }
  return `${secret.substring(0, 4)}...${secret.substring(secret.length - 4)}`;
}

/**
 * Validate secret strength
 * @param {string} secret - Secret to validate
 * @returns {Object} Validation result with isValid and message
 */
function validateSecret(secret) {
  if (!secret) {
    return { isValid: false, message: 'Secret is required' };
  }

  if (secret.length < 32) {
    return { isValid: false, message: 'Secret must be at least 32 characters' };
  }

  // Check for base64 format
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  if (!base64Regex.test(secret)) {
    return { isValid: false, message: 'Secret must be base64 encoded' };
  }

  return { isValid: true, message: 'Secret is valid' };
}

module.exports = {
  generateSecret,
  generateAllSecrets,
  generateDatabasePassword,
  maskSecret,
  validateSecret,
};
