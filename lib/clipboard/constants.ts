/**
 * Shared clipboard constants
 * Centralized to avoid drift between API routes, server actions, and migrations
 */

// Size limit: 256KB (encoded string size, not decoded payload)
export const MAX_CLIPBOARD_SIZE_BYTES = 262_144;

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
