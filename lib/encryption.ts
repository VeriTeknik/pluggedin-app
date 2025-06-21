import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Derives an encryption key from the base key and profile UUID
 */
function deriveKey(baseKey: string, profileUuid: string): Buffer {
  const salt = createHash('sha256').update(profileUuid).digest();
  return createHash('sha256').update(baseKey + salt.toString('hex')).digest();
}

/**
 * Encrypts a field value using AES-256-GCM
 */
export function encryptField(data: any, profileUuid: string): string {
  const baseKey = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
  if (!baseKey) {
    throw new Error('Encryption key not configured');
  }

  // Convert data to string
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
  
  // Derive key for this profile
  const key = deriveKey(baseKey, profileUuid);
  
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
  
  // Combine IV + tag + encrypted data
  const combined = Buffer.concat([iv, tag, encrypted]);
  
  // Return base64 encoded
  return combined.toString('base64');
}

/**
 * Decrypts a field value using AES-256-GCM
 */
export function decryptField(encrypted: string, profileUuid: string): any {
  const baseKey = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
  if (!baseKey) {
    throw new Error('Encryption key not configured');
  }

  try {
    // Decode from base64
    const combined = Buffer.from(encrypted, 'base64');
    
    // Extract components
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encryptedData = combined.subarray(IV_LENGTH + TAG_LENGTH);
    
    // Derive key for this profile
    const key = deriveKey(baseKey, profileUuid);
    
    // Create decipher
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Decrypt data
    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]).toString('utf8');
    
    // Try to parse as JSON, otherwise return as string
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
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