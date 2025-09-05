/**
 * LEGACY ENCRYPTION MODULE - FOR DECRYPTION ONLY
 * 
 * ⚠️ SECURITY WARNING: This module contains legacy encryption functions
 * with known security limitations. It exists ONLY to decrypt data that
 * was encrypted with the old system during migration.
 * 
 * DO NOT USE FOR NEW ENCRYPTION - Use lib/encryption.ts instead
 * 
 * This file will be removed in v3.0.0 after all data is migrated.
 */

import { createHash, scryptSync, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * LEGACY ONLY: Derives a key using SHA-256 with a predictable salt.
 * @deprecated Only for decrypting legacy data - DO NOT USE FOR ENCRYPTION
 * @internal
 */
export function deriveKeyLegacy(baseKey: string, profileUuid: string): Buffer {
  // This uses a predictable salt (SHA256 of profileUuid) which is insecure
  // Only kept for backward compatibility to decrypt existing data
  const salt = createHash('sha256').update(profileUuid).digest();
  return createHash('sha256').update(baseKey + salt.toString('hex')).digest();
}

/**
 * LEGACY ONLY: Derives a key using scrypt with a predictable salt.
 * @deprecated Only for decrypting legacy data - DO NOT USE FOR ENCRYPTION
 * @internal
 */
export function deriveKeyLegacyScrypt(baseKey: string, profileUuid: string): Buffer {
  // This uses a predictable salt which is insecure
  // Only kept for backward compatibility to decrypt existing data
  // CodeQL: This is intentionally using weak key derivation for backward compatibility only
  // nosemgrep: javascript.lang.security.audit.crypto.weak-crypto
  const salt = createHash('sha256').update(profileUuid).digest().subarray(0, 16);
  return scryptSync(baseKey, salt, 32, { N: 16384, r: 8, p: 1 });
}

/**
 * Attempts to decrypt data using legacy encryption methods
 * This should ONLY be called when modern decryption fails
 * @internal
 */
export function decryptLegacyData(encrypted: string, baseKey: string, profileUuid: string): any {
  const combined = Buffer.from(encrypted, 'base64');
  
  // Try legacy format with scrypt derivation first
  try {
    return decryptWithLegacyMethod(encrypted, baseKey, profileUuid, deriveKeyLegacyScrypt);
  } catch (_scryptError) {
    // If scrypt fails, try original SHA256 method
    console.warn('Legacy scrypt derivation failed, trying original legacy method for backward compatibility');
    return decryptWithLegacyMethod(encrypted, baseKey, profileUuid, deriveKeyLegacy);
  }
}

function decryptWithLegacyMethod(
  encrypted: string,
  baseKey: string,
  profileUuid: string,
  deriveFn: (key: string, profileUuid: string) => Buffer
): any {
  const combined = Buffer.from(encrypted, 'base64');
  
  // Legacy format: IV(16) + tag(16) + data
  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encryptedData = combined.subarray(IV_LENGTH + TAG_LENGTH);
  
  const key = deriveFn(baseKey, profileUuid);
  
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