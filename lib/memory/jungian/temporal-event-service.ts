/**
 * Temporal Event Service
 *
 * CRUD + retention for temporal_events table.
 * Privacy-first: only profile_hash stored, never raw UUID.
 * Supports retention cleanup for cron-based management.
 */

import { lt, sql } from 'drizzle-orm';

import { db } from '@/db';
import { temporalEventsTable } from '@/db/schema';
import { hashProfileUuid } from '../cbp/hash-utils';
import { SYNC_RETENTION_DAYS } from './constants';
import type { MemoryResult } from '../types';
import type { TemporalEventInput } from './types';

/**
 * Record a batch of temporal events.
 * Called from observation hook — fire-and-forget.
 */
export async function recordTemporalEvents(
  events: TemporalEventInput[]
): Promise<MemoryResult<{ inserted: number }>> {
  try {
    if (events.length === 0) {
      return { success: true, data: { inserted: 0 } };
    }

    const rows = events.map((e) => ({
      profile_hash: e.profileHash,
      tool_name: e.toolName,
      event_type: e.eventType,
      outcome: e.outcome ?? null,
      context_hash: e.contextHash ?? null,
    }));

    await db.insert(temporalEventsTable).values(rows);
    return { success: true, data: { inserted: rows.length } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record temporal events',
    };
  }
}

/**
 * Record a single temporal event from an observation.
 * Hashes profile UUID before storage — raw UUID never persisted.
 */
export async function recordTemporalEvent(
  profileUuid: string,
  toolName: string,
  eventType: string,
  outcome?: string,
  contextHash?: string
): Promise<void> {
  try {
    const profileHash = hashProfileUuid(profileUuid);
    await db.insert(temporalEventsTable).values({
      profile_hash: profileHash,
      tool_name: toolName,
      event_type: eventType,
      outcome: outcome ?? null,
      context_hash: contextHash ?? null,
    });
  } catch (error) {
    // Non-fatal for the caller, but log as error so monitoring catches persistent failures
    console.error('[temporal-event-service] Failed to record temporal event:', error);
  }
}

/**
 * Cleanup events older than retention period.
 * Called from cron endpoint.
 */
export async function cleanupTemporalEvents(): Promise<MemoryResult<{ deleted: number }>> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - SYNC_RETENTION_DAYS);

    const result = await db
      .delete(temporalEventsTable)
      .where(lt(temporalEventsTable.created_at, cutoff))
      .returning({ id: temporalEventsTable.id });

    return { success: true, data: { deleted: result.length } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cleanup temporal events',
    };
  }
}

/**
 * Get approximate row count for sampling decisions.
 * Uses pg_class.reltuples (~10% accurate) instead of COUNT(*) to avoid
 * a full sequential scan on potentially large tables. Sufficient for the
 * sampling threshold decision (SYNC_TABLESAMPLE_TRIGGER_ROWS).
 */
export async function getApproxTemporalEventCount(): Promise<number> {
  const result = await db.execute(
    sql`SELECT reltuples::bigint AS count FROM pg_class WHERE relname = 'temporal_events'`
  );
  const row = result.rows[0] as { count: number } | undefined;
  // reltuples can be -1 before first ANALYZE; fall back to 0
  return Math.max(0, row?.count ?? 0);
}
