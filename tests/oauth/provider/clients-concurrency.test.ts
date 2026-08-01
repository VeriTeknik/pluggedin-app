import { describe, expect, it } from 'vitest';

import { getTableConfig } from 'drizzle-orm/pg-core';

import { oauthClientsTable } from '@/db/schema';

/**
 * (issuer, client_id) is the natural key and must be enforced as one.
 *
 * resolveClient reads then inserts, so two concurrent first-time requests for
 * the same client both found nothing and both inserted. The schema comment
 * already called this pair the natural key, but the index was not unique, so
 * that was a statement of intent rather than a constraint.
 *
 * Duplicates cost far more than a wasted row. The token endpoint selects by
 * (client_id, issuer) with LIMIT 1 while an authorization code carries the uuid
 * of whichever row was written first. Pick the other one and the client_uuid
 * comparison fails — which rotation now reads as a token presented by the wrong
 * client, and revokes the entire family of a client that did nothing wrong.
 *
 * The unique index makes the duplicate impossible; onConflictDoUpdate in
 * resolveClient makes losing the race a no-op instead of a 500.
 */

describe('oauth_clients natural key', () => {
  it('is enforced by a unique index, not merely indexed', () => {
    const index = getTableConfig(oauthClientsTable).indexes.find((candidate) => {
      const columns = (candidate.config.columns ?? []).map(
        (column) => (column as { name?: string }).name
      );
      return columns.includes('issuer') && columns.includes('client_id');
    });

    expect(index).toBeDefined();
    expect(index?.config.unique).toBe(true);
  });
});
