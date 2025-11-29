/**
 * Shared clipboard constants
 * Centralized to avoid drift between API routes, server actions, and migrations
 */

// Size limit: 2MB (encoded string size, not decoded payload)
// Increased from 256KB to support larger payloads like base64-encoded images
export const MAX_CLIPBOARD_SIZE_BYTES = 2_097_152;

// Default TTL: 24 hours
export const DEFAULT_CLIPBOARD_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Calculate the actual size of clipboard content
 * For base64/hex encoded content, this returns the encoded string size
 * (not the decoded payload size) to be consistent with storage limits
 */
export function calculateClipboardSize(
  value: string,
  encoding: 'utf-8' | 'base64' | 'hex' = 'utf-8'
): number {
  // We measure the UTF-8 encoded string size, which represents
  // the actual storage cost regardless of the content encoding
  return Buffer.byteLength(value, 'utf-8');
}

/**
 * Validate clipboard size against the limit
 * Returns error message if too large, null if valid
 */
export function validateClipboardSize(value: string): string | null {
  const sizeBytes = calculateClipboardSize(value);
  if (sizeBytes > MAX_CLIPBOARD_SIZE_BYTES) {
    return `Value exceeds maximum size of ${MAX_CLIPBOARD_SIZE_BYTES} bytes (${Math.round(MAX_CLIPBOARD_SIZE_BYTES / 1024)}KB)`;
  }
  return null;
}

/**
 * Calculate expiration date from TTL
 */
export function calculateExpirationDate(ttlSeconds?: number): Date {
  const ttlMs = ttlSeconds ? ttlSeconds * 1000 : DEFAULT_CLIPBOARD_TTL_MS;
  return new Date(Date.now() + ttlMs);
}

// Regex patterns for content validation
// Base64: standard alphabet with optional padding
const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;
// Hex: case-insensitive hexadecimal, even length
const HEX_REGEX = /^[0-9A-Fa-f]*$/;

/**
 * Validate that content matches its declared encoding
 * Returns error message if invalid, null if valid
 *
 * Security: Validates both format AND decodability to prevent
 * storing malformed data that could cause issues downstream
 */
export function validateContentEncoding(
  value: string,
  encoding: 'utf-8' | 'base64' | 'hex'
): string | null {
  switch (encoding) {
    case 'base64': {
      // Check basic format (must be valid base64 characters)
      if (!BASE64_REGEX.test(value)) {
        return 'Invalid base64 encoding: contains invalid characters';
      }
      // Check length is multiple of 4 (with padding) for valid base64
      if (value.length > 0 && value.length % 4 !== 0) {
        return 'Invalid base64 encoding: incorrect padding';
      }
      // Actually attempt to decode to catch subtle encoding issues
      // (e.g., invalid padding that passes regex, corrupted data)
      try {
        const decoded = Buffer.from(value, 'base64');
        // Re-encode and compare to detect non-canonical base64
        const reencoded = decoded.toString('base64');
        // Remove padding for comparison (some inputs may have different padding)
        const normalizedValue = value.replace(/=+$/, '');
        const normalizedReencoded = reencoded.replace(/=+$/, '');
        if (normalizedValue !== normalizedReencoded) {
          return 'Invalid base64 encoding: non-canonical or corrupted data';
        }
      } catch {
        return 'Invalid base64 encoding: failed to decode';
      }
      break;
    }
    case 'hex': {
      if (!HEX_REGEX.test(value)) {
        return 'Invalid hex encoding: contains non-hexadecimal characters';
      }
      // Hex strings should have even length (each byte = 2 hex chars)
      if (value.length % 2 !== 0) {
        return 'Invalid hex encoding: odd number of characters';
      }
      // Verify actual decoding works
      try {
        Buffer.from(value, 'hex');
      } catch {
        return 'Invalid hex encoding: failed to decode';
      }
      break;
    }
    case 'utf-8':
      // UTF-8 string content - no special validation needed
      // JavaScript strings are already valid UTF-16, which can represent all UTF-8
      break;
  }
  return null;
}
