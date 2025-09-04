import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

// Scrypt parameters for secure key derivation
const SCRYPT_PARAMS = {
  N: 16384,  // CPU/memory cost parameter (must be power of 2)
  r: 8,      // Block size parameter
  p: 1,      // Parallelization parameter
};

/**
 * Derives a key from a base key and salt using scrypt
 * Uses secure random salts, not predictable ones
 */
function deriveKeySecure(baseKey: string, salt: Buffer): Buffer {
  return scryptSync(baseKey, salt, KEY_LENGTH, SCRYPT_PARAMS);
}

/**
 * Generates a cryptographically secure random salt
 */
export function generateSalt(): Buffer {
  return randomBytes(SALT_LENGTH);
}

/**
 * Encrypts data with a secure, random salt
 * Returns base64 encoded string containing salt, iv, tag, and encrypted data
 */
export function encryptSecure(text: string, baseKey: string): string {
  // Generate random salt for this encryption
  const salt = generateSalt();
  
  // Derive key from base key and salt
  const key = deriveKeySecure(baseKey, salt);
  
  // Generate random IV
  const iv = randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt the text
  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  
  // Get the authentication tag
  const tag = cipher.getAuthTag();
  
  // Combine salt, iv, tag, and encrypted data
  const combined = Buffer.concat([
    salt,      // 32 bytes
    iv,        // 16 bytes
    tag,       // 16 bytes
    encrypted, // variable length
  ]);
  
  // Return as base64
  return combined.toString('base64');
}

/**
 * Decrypts data encrypted with encryptSecure
 */
export function decryptSecure(encryptedData: string, baseKey: string): string {
  // Decode from base64
  const combined = Buffer.from(encryptedData, 'base64');
  
  // Extract components
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  
  // Derive key from base key and extracted salt
  const key = deriveKeySecure(baseKey, salt);
  
  // Create decipher
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  // Decrypt the data
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * Checks if data is encrypted with the legacy format
 */
export function isLegacyEncrypted(data: string): boolean {
  try {
    const decoded = Buffer.from(data, 'base64');
    // Legacy format: IV (16) + TAG (16) + encrypted data
    // New format: SALT (32) + IV (16) + TAG (16) + encrypted data
    // If length suggests it doesn't have a salt, it's likely legacy
    return decoded.length >= 32 && decoded.length < 64;
  } catch {
    return false;
  }
}

/**
 * Migration helper to re-encrypt data from legacy to secure format
 * This should be used in a migration script, not in production code
 */
export async function migrateLegacyEncryption(
  encryptedData: string,
  baseKey: string,
  profileUuid: string,
  decryptLegacy: (data: string, key: string, uuid: string) => string
): Promise<string> {
  try {
    // Decrypt using legacy method
    const decrypted = decryptLegacy(encryptedData, baseKey, profileUuid);
    
    // Re-encrypt using secure method
    return encryptSecure(decrypted, baseKey);
  } catch (error) {
    throw new Error(`Failed to migrate encryption: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates a secure base key for encryption
 * This should be stored securely (e.g., in environment variables)
 */
export function generateBaseKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Validates that a base key meets security requirements
 */
export function validateBaseKey(baseKey: string): boolean {
  // Base key should be at least 32 characters (256 bits when hex encoded)
  if (!baseKey || baseKey.length < 32) {
    return false;
  }
  
  // Check for obvious weak patterns
  const weakPatterns = [
    /^0+$/,           // All zeros
    /^1+$/,           // All ones
    /^(.)\1+$/,       // Repeating character
    /^1234/,          // Sequential numbers
    /password/i,      // Contains "password"
    /secret/i,        // Contains "secret"
    /admin/i,         // Contains "admin"
  ];
  
  return !weakPatterns.some(pattern => pattern.test(baseKey));
}

/**
 * Error class for encryption-related errors
 */
export class EncryptionError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'EncryptionError';
  }
}

/**
 * Encrypt with error handling
 */
export function encrypt(text: string, baseKey: string): string {
  if (!text) {
    throw new EncryptionError('Text to encrypt cannot be empty', 'EMPTY_TEXT');
  }
  
  if (!validateBaseKey(baseKey)) {
    throw new EncryptionError('Invalid or weak base key', 'INVALID_KEY');
  }
  
  try {
    return encryptSecure(text, baseKey);
  } catch (error) {
    throw new EncryptionError(
      `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'ENCRYPTION_FAILED'
    );
  }
}

/**
 * Decrypt with error handling
 */
export function decrypt(encryptedData: string, baseKey: string): string {
  if (!encryptedData) {
    throw new EncryptionError('Encrypted data cannot be empty', 'EMPTY_DATA');
  }
  
  if (!validateBaseKey(baseKey)) {
    throw new EncryptionError('Invalid or weak base key', 'INVALID_KEY');
  }
  
  try {
    return decryptSecure(encryptedData, baseKey);
  } catch (error) {
    throw new EncryptionError(
      `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'DECRYPTION_FAILED'
    );
  }
}

// Export main functions for use
export default {
  encrypt,
  decrypt,
  generateBaseKey,
  validateBaseKey,
  generateSalt,
  isLegacyEncrypted,
  migrateLegacyEncryption,
  EncryptionError,
};