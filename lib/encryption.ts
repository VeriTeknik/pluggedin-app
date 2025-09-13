import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// Legacy encryption has been removed after successful production migration

// Field mapping for encryption/decryption
const FIELD_MAP = [
  { prop: 'command', encryptedProp: 'command_encrypted' },
  { prop: 'args', encryptedProp: 'args_encrypted' },
  { prop: 'env', encryptedProp: 'env_encrypted' },
  { prop: 'url', encryptedProp: 'url_encrypted' },
  { prop: 'transport', encryptedProp: 'transport_encrypted' },
  { prop: 'streamableHTTPOptions', encryptedProp: 'streamable_http_options_encrypted' },
] as const;

/**
 * Validates encryption key configuration on startup
 */
export function validateEncryptionKey(): void {
  const key = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;

  if (!key) {
    console.error('❌ CRITICAL: NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is not configured');
    console.error('Generate a key with: openssl rand -base64 32');
    throw new Error('Encryption key not configured. Server cannot start without encryption key.');
  }

  // Validate key is base64 and has appropriate length (32 bytes = ~44 chars in base64)
  try {
    const decoded = Buffer.from(key, 'base64');
    if (decoded.length < 32) {
      throw new Error('Encryption key must be at least 32 bytes (256 bits)');
    }
  } catch (error) {
    console.error('❌ CRITICAL: Invalid encryption key format');
    throw new Error('Encryption key must be valid base64. Generate with: openssl rand -base64 32');
  }
}

/**
 * Derives an encryption key using scrypt with a provided salt
 */
function deriveKey(baseKey: string, salt: Buffer): Buffer {
  // Use scrypt for proper key derivation (CPU-intensive, resistant to brute force)
  // N=16384, r=8, p=1 are recommended parameters for good security/performance balance
  // TODO: To upgrade to N=65536 for stronger security, we need to:
  // 1. Implement versioning in encrypted data format
  // 2. Support multiple scrypt parameters for backward compatibility
  // 3. Gradually migrate existing encrypted data
  // 4. Increase Node.js memory limit with --max-old-space-size flag
  return scryptSync(baseKey, salt, 32, { N: 16384, r: 8, p: 1 });
}

/**
 * Encrypts a field value using AES-256-GCM with RANDOM salt (secure)
 * NEVER uses predictable salts - always generates cryptographically random salt
 */
export function encryptField(data: any): string {
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
 * Helper function for decryption with modern key derivation
 */
function decryptWithModernKey(
  encrypted: string,
  baseKey: string
): any {
  const combined = Buffer.from(encrypted, 'base64');
  
  // New format: salt(16) + IV(16) + tag(16) + data
  const salt = combined.subarray(0, 16);
  const iv = combined.subarray(16, 16 + IV_LENGTH);
  const tag = combined.subarray(16 + IV_LENGTH, 16 + IV_LENGTH + TAG_LENGTH);
  const encryptedData = combined.subarray(16 + IV_LENGTH + TAG_LENGTH);
  const key = deriveKey(baseKey, salt);
  
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
 * Decrypts a field value using AES-256-GCM
 */
export function decryptField(encrypted: string): any {
  const baseKey = process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;
  if (!baseKey) {
    throw new Error('Encryption key not configured');
  }

  try {
    return decryptWithModernKey(encrypted, baseKey);
  } catch (error) {
    // Sanitize error message to avoid leaking sensitive information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Decryption failed:', errorMessage.replace(/[A-Za-z0-9]{20,}/g, '[REDACTED]'));
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
  transport?: string | null;
  streamableHTTPOptions?: {
    sessionId?: string;
    headers?: Record<string, string>;
  } | null;
}>(server: T): T & {
  command_encrypted?: string;
  args_encrypted?: string;
  env_encrypted?: string;
  url_encrypted?: string;
  transport_encrypted?: string;
  streamable_http_options_encrypted?: string;
  encryption_version?: number;
} {
  const encrypted: any = { ...server };

  // Encrypt each field using the field map
  FIELD_MAP.forEach(({ prop, encryptedProp }) => {
    const value = (server as any)[prop];

    // Check if field has content (arrays need length check, objects need keys check)
    const hasContent = value != null && (
      Array.isArray(value) ? value.length > 0 :
      typeof value === 'object' ? Object.keys(value).length > 0 :
      true
    );

    if (hasContent) {
      encrypted[encryptedProp] = encryptField(value);
      delete encrypted[prop];
    }
  });

  // Mark as using new encryption (v2)
  encrypted.encryption_version = 2;

  return encrypted;
}

/**
 * Apply legacy transforms for backward compatibility
 * Handles old data that might have transport/streamableHTTPOptions stored in env
 */
function applyLegacyTransforms(decrypted: any, original: any): void {
  // Only process if we have env_encrypted but not the new dedicated fields
  if (!original.transport_encrypted && !original.streamable_http_options_encrypted && original.env_encrypted) {
    try {
      const envData = decryptField(original.env_encrypted);

      // Extract transport from env if present
      if (envData.__transport && !decrypted.transport) {
        decrypted.transport = envData.__transport;
        delete envData.__transport;
      }

      // Extract streamableHTTPOptions from env if present
      if (envData.__streamableHTTPOptions && !decrypted.streamableHTTPOptions) {
        try {
          decrypted.streamableHTTPOptions = JSON.parse(envData.__streamableHTTPOptions);
        } catch (e) {
          console.error('Failed to parse streamableHTTPOptions from env:', e);
        }
        delete envData.__streamableHTTPOptions;
      }

      // Update env with cleaned data
      decrypted.env = envData;
    } catch (error) {
      console.error('Failed to process legacy env data:', error);
      if (!decrypted.env) {
        decrypted.env = {};
      }
    }
  }
}

/**
 * Decrypts sensitive fields in an MCP server object
 */
export function decryptServerData<T extends {
  command_encrypted?: string | null;
  args_encrypted?: string | null;
  env_encrypted?: string | null;
  url_encrypted?: string | null;
  transport_encrypted?: string | null;
  streamable_http_options_encrypted?: string | null;
}>(server: T): T & {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  transport?: string;
  streamableHTTPOptions?: {
    sessionId?: string;
    headers?: Record<string, string>;
  };
} {
  const decrypted: any = { ...server };

  // Decrypt each field using the field map
  FIELD_MAP.forEach(({ prop, encryptedProp }) => {
    const encryptedValue = (server as any)[encryptedProp];

    if (encryptedValue != null) {
      try {
        decrypted[prop] = decryptField(encryptedValue);

        // Special handling for env field to support legacy transforms
        if (prop === 'env') {
          applyLegacyTransforms(decrypted, server);
        }
      } catch (error) {
        console.error(`Failed to decrypt ${prop}:`, error);
        // Set appropriate default values for failed decryptions
        decrypted[prop] = prop === 'args' ? [] : prop === 'env' ? {} : null;
      }
      delete decrypted[encryptedProp];
    }
  });

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