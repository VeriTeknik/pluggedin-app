/**
 * Serialization utilities for converting database records to API-friendly formats
 */

import type { ApiKey } from '@/types/api-key';

/**
 * Serializes an API key record from database format to API format
 * Converts Date objects to ISO strings for JSON compatibility
 *
 * @param raw Raw API key record from database
 * @returns Serialized API key with ISO string dates
 */
export function serializeApiKey(raw: any): ApiKey {
  return {
    ...raw,
    created_at: raw.created_at.toISOString(),
    last_used_at: raw.last_used_at?.toISOString() ?? null,
  };
}
