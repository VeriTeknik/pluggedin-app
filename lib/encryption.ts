import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * LEGACY ONLY: Derives a key using SHA-256 with a predictable salt.
 * For backward compatibility DECRYPTION ONLY — do NOT use for ENCRYPTION of new data.
 * (Predictable salt: SHA256(profileUuid)) — insecure for new data!
 * 
 * @deprecated This function uses predictable salts and should only be used for legacy decryption
 */
function deriveKeyLegacy(baseKey: string, profileUuid: string): Buffer {
  // Runtime protection: Only allow in production or when explicitly enabled for legacy decryption
  if (process.env.NODE_ENV !== 'production' && !(deriveKeyLegacy as any)._allowLegacy) {
    throw new Error('deriveKeyLegacy must only be used for decrypting legacy data!');
  }
  
  // Only log warning if explicitly requested via environment variable
  if (process.env.LOG_LEGACY_ENCRYPTION === 'true') {
    console.warn('[SECURITY] Using legacy key derivation with predictable salt - this should only be for decrypting existing data');
  }
  
  const salt = createHash('sha256').update(profileUuid).digest();
  return createHash('sha256').update(baseKey + salt.toString('hex')).digest();
}

/**
 * LEGACY ONLY: Derives a key using scrypt with a predictable salt.
 * For backward compatibility DECRYPTION ONLY — do NOT use for ENCRYPTION of new data.
 * (Salt: first 16 bytes of SHA256(profileUuid)) — insecure for new data!
 * 
 * @deprecated This function uses predictable salts and should only be used for legacy decryption
 */
function deriveKeyLegacyScrypt(baseKey: string, profileUuid: string): Buffer {
  // Runtime protection: Only allow in production or when explicitly enabled for legacy decryption
  if (process.env.NODE_ENV !== 'production' && !(deriveKeyLegacyScrypt as any)._allowLegacy) {
    throw new Error('deriveKeyLegacyScrypt must only be used for decrypting legacy data!');
  }
  
  // Only log warning if explicitly requested via environment variable
  if (process.env.LOG_LEGACY_ENCRYPTION === 'true') {
    console.warn('[SECURITY] Using legacy scrypt derivation with predictable salt - this should only be for decrypting existing data');
  }
  
  const salt = createHash('sha256').update(profileUuid).digest().subarray(0, 16);
  return scryptSync(baseKey, salt, 32, { N: 16384, r: 8, p: 1 });
}

/**
 * Derives an encryption key using scrypt with a provided salt
 */
function deriveKey(baseKey: string, salt: Buffer): Buffer {
  // Use scrypt for proper key derivation (CPU-intensive, resistant to brute force)
  // N=16384, r=8, p=1 are recommended parameters for good security/performance balance
  return scryptSync(baseKey, salt, 32, { N: 16384, r: 8, p: 1 });
}

/**
 * Encrypts a field value using AES-256-GCM with RANDOM salt (secure)
 * NEVER uses predictable salts - always generates cryptographically random salt
 */
export function encryptField(data: any, _profileUuid: string): string {
  const baseKey = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
  if (!baseKey) {
    throw new Error('Encryption key not configured');
  }

  // Convert data to string
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
  
  // Generate random salt for this encryption (16 bytes)
  const salt = randomBytes(16);
  
  // Derive key using the random salt
  const key = deriveKey(baseKey, salt);
  
  // Generate random IV
  const iv = randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt data
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  // Get auth tag
  const tag = cipher.getAuthTag();
  
  // Combine salt + IV + tag + encrypted data
  const combined = Buffer.concat([salt, iv, tag, encrypted]);
  
  // Return base64 encoded
  return combined.toString('base64');
}

/**
 * Helper function for decryption with specific key derivation function
 * Handles common decrypt/slice/parse logic
 */
function decryptWithDerivation(
  encrypted: string,
  baseKey: string,
  profileUuid: string,
  deriveFn: ((key: string, salt: Buffer) => Buffer) | ((key: string, profileUuid: string) => Buffer),
  isNewFormat: boolean = false
): any {
  const combined = Buffer.from(encrypted, 'base64');
  
  let iv: Buffer, tag: Buffer, encryptedData: Buffer, key: Buffer;
  
  if (isNewFormat) {
    // New format: salt(16) + IV(16) + tag(16) + data
    const salt = combined.subarray(0, 16);
    iv = combined.subarray(16, 16 + IV_LENGTH);
    tag = combined.subarray(16 + IV_LENGTH, 16 + IV_LENGTH + TAG_LENGTH);
    encryptedData = combined.subarray(16 + IV_LENGTH + TAG_LENGTH);
    key = (deriveFn as (key: string, salt: Buffer) => Buffer)(baseKey, salt);
  } else {
    // Legacy format: IV(16) + tag(16) + data
    iv = combined.subarray(0, IV_LENGTH);
    tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    encryptedData = combined.subarray(IV_LENGTH + TAG_LENGTH);
    key = (deriveFn as (key: string, profileUuid: string) => Buffer)(baseKey, profileUuid);
  }
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  const text = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final()
  ]).toString('utf8');
  
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Decrypts a field value using AES-256-GCM with backward compatibility
 */
export function decryptField(encrypted: string, profileUuid: string): any {
  const baseKey = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
  if (!baseKey) {
    throw new Error('Encryption key not configured');
  }

  try {
    const combined = Buffer.from(encrypted, 'base64');
    const hasRandomSalt = combined.length >= (16 + IV_LENGTH + TAG_LENGTH);
    
    if (hasRandomSalt) {
      // Try new format with random salt (SECURE)
      try {
        return decryptWithDerivation(encrypted, baseKey, profileUuid, deriveKey, true);
      } catch (_newFormatError) {
        // If new format fails, fall through to legacy formats
      }
    }
    
    // Fall back to legacy decryption (WITH EXPLICIT SECURITY WARNING)
    return decryptLegacyData(encrypted, baseKey, profileUuid);
  } catch (error) {
    console.error('Decryption failed with all methods:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * SECURITY WARNING: This function handles legacy encrypted data with predictable salts.
 * It should ONLY be used for decrypting existing data, never for new encryptions.
 * 
 * @param encrypted - The encrypted data to decrypt
 * @param baseKey - The encryption key
 * @param profileUuid - The profile UUID (used as predictable salt in legacy format)
 * @returns The decrypted data
 */
function decryptLegacyData(encrypted: string, baseKey: string, profileUuid: string): any {
  // Try legacy format with scrypt derivation
  try {
    (deriveKeyLegacyScrypt as any)._allowLegacy = true;
    const result = decryptWithDerivation(encrypted, baseKey, profileUuid, deriveKeyLegacyScrypt, false);
    delete (deriveKeyLegacyScrypt as any)._allowLegacy;
    return result;
  } catch (_legacyScryptError) {
    // If legacy scrypt fails, try original legacy SHA256 method
    console.warn('Legacy scrypt derivation failed, trying original legacy method for backward compatibility');
    (deriveKeyLegacy as any)._allowLegacy = true;
    const result = decryptWithDerivation(encrypted, baseKey, profileUuid, deriveKeyLegacy, false);
    delete (deriveKeyLegacy as any)._allowLegacy;
    return result;
  }
}

/**
 * Encrypts sensitive fields in an MCP server object
 */
export function encryptServerData<T extends {
  command?: string | null;
  args?: string[] | null;
  env?: Record<string, string> | null;
  url?: string | null;
}>(server: T, profileUuid: string): T & {
  command_encrypted?: string;
  args_encrypted?: string;
  env_encrypted?: string;
  url_encrypted?: string;
} {
  const encrypted: any = { ...server };
  
  // Encrypt each sensitive field if present
  if (server.command) {
    encrypted.command_encrypted = encryptField(server.command, profileUuid);
    delete encrypted.command;
  }
  
  if (server.args && server.args.length > 0) {
    encrypted.args_encrypted = encryptField(server.args, profileUuid);
    delete encrypted.args;
  }
  
  if (server.env && Object.keys(server.env).length > 0) {
    encrypted.env_encrypted = encryptField(server.env, profileUuid);
    delete encrypted.env;
  }
  
  if (server.url) {
    encrypted.url_encrypted = encryptField(server.url, profileUuid);
    delete encrypted.url;
  }
  
  return encrypted;
}

/**
 * Decrypts sensitive fields in an MCP server object
 */
export function decryptServerData<T extends {
  command_encrypted?: string | null;
  args_encrypted?: string | null;
  env_encrypted?: string | null;
  url_encrypted?: string | null;
}>(server: T, profileUuid: string): T & {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
} {
  const decrypted: any = { ...server };
  
  // Decrypt each field if present
  if (server.command_encrypted) {
    try {
      decrypted.command = decryptField(server.command_encrypted, profileUuid);
    } catch (error) {
      console.error('Failed to decrypt command:', error);
      decrypted.command = null;
    }
    delete decrypted.command_encrypted;
  }
  
  if (server.args_encrypted) {
    try {
      decrypted.args = decryptField(server.args_encrypted, profileUuid);
    } catch (error) {
      console.error('Failed to decrypt args:', error);
      decrypted.args = [];
    }
    delete decrypted.args_encrypted;
  }
  
  if (server.env_encrypted) {
    try {
      decrypted.env = decryptField(server.env_encrypted, profileUuid);
    } catch (error) {
      console.error('Failed to decrypt env:', error);
      decrypted.env = {};
    }
    delete decrypted.env_encrypted;
  }
  
  if (server.url_encrypted) {
    try {
      decrypted.url = decryptField(server.url_encrypted, profileUuid);
    } catch (error) {
      console.error('Failed to decrypt url:', error);
      decrypted.url = null;
    }
    delete decrypted.url_encrypted;
  }
  
  return decrypted;
}

/**
 * Creates a sanitized template for sharing (removes sensitive data)
 */
export function createSanitizedTemplate(server: any): any {
  const template = { ...server };
  
  // Remove all sensitive fields
  delete template.command;
  delete template.args;
  delete template.env;
  delete template.url;
  delete template.command_encrypted;
  delete template.args_encrypted;
  delete template.env_encrypted;
  delete template.url_encrypted;
  
  // Add placeholder information
  template.requires_credentials = true;
  template.credential_fields = [];
  
  if (server.type === 'STDIO') {
    template.credential_fields.push('command', 'args', 'env');
  } else if (server.type === 'SSE') {
    template.credential_fields.push('url');
  }
  
  return template;
}