/**
 * CBP Hash Utilities
 *
 * Shared hashing functions used by both promotion-service and gut-agent.
 */

import { createHash, createHmac } from 'crypto';

/**
 * HMAC-hash a profile UUID for k-anonymity tracking.
 * Uses a keyed hash so raw UUIDs never appear in the collective pool.
 */
export function hashProfileUuid(profileUuid: string): string {
  const secret = process.env.CBP_HASH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('CBP_HASH_SECRET or NEXTAUTH_SECRET must be configured for profile anonymization');
  }
  return createHmac('sha256', secret).update(profileUuid).digest('hex');
}

/**
 * SHA-256 hash a normalized pattern for deduplication.
 */
export function hashPattern(text: string): string {
  return createHash('sha256').update(text.toLowerCase().trim()).digest('hex');
}
