/**
 * ID utilities for the memory system
 * Handles both authenticated user UUIDs and visitor ID strings
 */

import { createHash } from 'crypto';

/**
 * UUID v4 regex pattern for validation
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * UUID v5 regex pattern (includes v4 pattern)
 */
const UUID_REGEX_ALL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Visitor ID pattern
 */
const VISITOR_ID_PATTERN = /^visitor_\d+_\w+$/;

/**
 * Check if a string is a valid UUID
 */
export function isValidUuid(id: string): boolean {
  return UUID_REGEX_ALL.test(id);
}

/**
 * Check if a string is a visitor ID
 */
export function isVisitorId(id: string): boolean {
  return VISITOR_ID_PATTERN.test(id);
}

/**
 * Convert a visitor ID to a deterministic UUID v5
 * Uses the same approach as sanitizeUserIdForFileSystem
 */
export function visitorIdToUuid(visitorId: string): string {
  // Use a namespace UUID for visitor IDs
  const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  
  // Create a deterministic UUID v5 from the visitor ID
  const hash = createHash('sha256').update(NAMESPACE + visitorId).digest('hex');
  
  // Format as UUID v5 (8-4-4-4-12 format)
  const uuid = [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '5' + hash.substring(13, 16), // Version 5
    ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.substring(18, 20), // Variant
    hash.substring(20, 32)
  ].join('-');
  
  return uuid;
}

/**
 * Normalize a user ID to a valid UUID
 * - If already a UUID, return as-is
 * - If a visitor ID, convert to UUID v5
 * - Otherwise, convert any string to UUID v5
 */
export function normalizeUserId(userId: string): string {
  // Already a valid UUID
  if (isValidUuid(userId)) {
    return userId;
  }
  
  // Visitor ID - convert to UUID
  if (isVisitorId(userId)) {
    return visitorIdToUuid(userId);
  }
  
  // Any other string - convert to UUID
  // This handles edge cases and ensures we always return a valid UUID
  return visitorIdToUuid(userId);
}

/**
 * Get the type of user ID
 */
export function getUserIdType(userId: string): 'uuid' | 'visitor' | 'other' {
  if (isValidUuid(userId)) {
    return 'uuid';
  }
  if (isVisitorId(userId)) {
    return 'visitor';
  }
  return 'other';
}

/**
 * Create a display-friendly version of the user ID
 */
export function formatUserIdForDisplay(userId: string): string {
  const type = getUserIdType(userId);
  
  switch (type) {
    case 'uuid':
      // Show first 8 chars of UUID
      return userId.substring(0, 8);
    case 'visitor':
      // Extract the short random part
      const parts = userId.split('_');
      return `Guest ${(parts[2] || 'Unknown').substring(0, 4).toUpperCase()}`;
    default:
      return 'Unknown User';
  }
}