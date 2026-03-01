/**
 * CBP Hash Utilities
 *
 * Shared hashing functions used by both promotion-service and gut-agent.
 */

import { createHash, createHmac } from 'crypto';

/**
 * HMAC-hash a profile UUID for k-anonymity tracking.
 * Uses a keyed hash so raw UUIDs never appear in the collective pool.
 *
 * WARNING: Rotating CBP_HASH_SECRET (or the NEXTAUTH_SECRET fallback) will
 * invalidate all existing profile_hash values in collective_contributions.
 * The unique constraint (pattern_uuid, profile_hash) would fail to detect
 * prior contributions from the same profile, inflating unique_profile_count
 * and potentially defeating k-anonymity.  If rotation is required, run a
 * migration to re-hash all profile_hash values with the new secret.
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
