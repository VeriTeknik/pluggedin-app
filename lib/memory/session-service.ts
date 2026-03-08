/**
 * Session Service
 *
 * Manages memory session lifecycle: start, end, focus management.
 * Each session tracks observations and generates Z-reports on completion.
 */

import { nanoid } from 'nanoid';
import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { memorySessionsTable } from '@/db/schema';

import { saveIndividuationSnapshot } from './jungian/individuation-service';
import type {
  FocusItem,
  MemoryResult,
  MemorySessionStatus,
  StartSessionParams,
  ZReport,
} from './types';
import { MAX_FOCUS_ITEMS } from './constants';

/**
 * Start a new memory session
 */
export async function startSession(
  params: StartSessionParams
): Promise<MemoryResult<{ uuid: string; memorySessionId: string }>> {
  try {
    // Auto-abandon stale sessions (2+ hours old) for this profile before starting a new one
    await abandonStaleSessions(params.profileUuid, 2).catch(() => {});

    const memorySessionId = `ms_${nanoid(21)}`;

    const [session] = await db
      .insert(memorySessionsTable)
      .values({
        profile_uuid: params.profileUuid,
        agent_uuid: params.agentUuid ?? null,
        content_session_id: params.contentSessionId,
        memory_session_id: memorySessionId,
        status: 'active',
        started_at: new Date(),
      })
      .returning({ uuid: memorySessionsTable.uuid });

    // Save daily individuation snapshot (fire-and-forget, non-fatal)
    saveIndividuationSnapshot(params.profileUuid).catch((err) =>
      console.warn('[session-service] individuation snapshot failed:', err)
    );

    return {
      success: true,
      data: { uuid: session.uuid, memorySessionId },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start session',
    };
  }
}

/**
 * End a memory session (triggers Z-report generation externally).
 * When profileUuid is provided, ownership is verified atomically with the
 * status update to prevent TOCTOU race conditions.
 */
export async function endSession(
  memorySessionId: string,
  profileUuid?: string
): Promise<MemoryResult<{ uuid: string }>> {
  try {
    const conditions = [
      eq(memorySessionsTable.memory_session_id, memorySessionId),
      eq(memorySessionsTable.status, 'active'),
    ];

    if (profileUuid) {
      conditions.push(eq(memorySessionsTable.profile_uuid, profileUuid));
    }

    const [session] = await db
      .update(memorySessionsTable)
      .set({
        status: 'completed',
        ended_at: new Date(),
      })
      .where(and(...conditions))
      .returning({ uuid: memorySessionsTable.uuid });

    if (!session) {
      return { success: false, error: 'Session not found or already ended' };
    }

    return { success: true, data: { uuid: session.uuid } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to end session',
    };
  }
}

/**
 * Get the active session for a profile/agent
 */
export async function getActiveSession(
  profileUuid: string,
  agentUuid?: string
) {
  const conditions = [
    eq(memorySessionsTable.profile_uuid, profileUuid),
    eq(memorySessionsTable.status, 'active'),
  ];

  if (agentUuid) {
    conditions.push(eq(memorySessionsTable.agent_uuid, agentUuid));
  }

  const [session] = await db
    .select()
    .from(memorySessionsTable)
    .where(and(...conditions))
    .orderBy(desc(memorySessionsTable.started_at))
    .limit(1);

  return session ?? null;
}

/**
 * Get session history for a profile
 */
export async function getSessionHistory(
  profileUuid: string,
  options?: {
    agentUuid?: string;
    limit?: number;
    offset?: number;
    status?: MemorySessionStatus;
  }
) {
  const conditions = [
    eq(memorySessionsTable.profile_uuid, profileUuid),
  ];

  if (options?.agentUuid) {
    conditions.push(eq(memorySessionsTable.agent_uuid, options.agentUuid));
  }

  if (options?.status) {
    conditions.push(eq(memorySessionsTable.status, options.status));
  }

  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  const sessions = await db
    .select()
    .from(memorySessionsTable)
    .where(and(...conditions))
    .orderBy(desc(memorySessionsTable.started_at))
    .limit(limit)
    .offset(offset);

  return sessions;
}

/**
 * Get session by UUID
 */
export async function getSessionByUuid(sessionUuid: string) {
  const [session] = await db
    .select()
    .from(memorySessionsTable)
    .where(eq(memorySessionsTable.uuid, sessionUuid))
    .limit(1);

  return session ?? null;
}

/**
 * Get session by memory_session_id (ms_xxx format)
 */
export async function getSessionByMemorySessionId(memorySessionId: string) {
  const [session] = await db
    .select()
    .from(memorySessionsTable)
    .where(eq(memorySessionsTable.memory_session_id, memorySessionId))
    .limit(1);

  return session ?? null;
}

/**
 * Store Z-report for a session
 */
export async function storeZReport(
  sessionUuid: string,
  zReport: ZReport
): Promise<MemoryResult> {
  try {
    await db
      .update(memorySessionsTable)
      .set({ z_report: zReport })
      .where(eq(memorySessionsTable.uuid, sessionUuid));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to store Z-report',
    };
  }
}

/**
 * Update focus items for a session (7±2 working set)
 */
export async function updateFocusItems(
  sessionUuid: string,
  items: FocusItem[]
): Promise<MemoryResult> {
  try {
    // Enforce maximum focus items
    const trimmed = items
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, MAX_FOCUS_ITEMS);

    await db
      .update(memorySessionsTable)
      .set({ focus_items: trimmed })
      .where(eq(memorySessionsTable.uuid, sessionUuid));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update focus items',
    };
  }
}

/**
 * Increment observation count for a session
 */
export async function incrementObservationCount(
  sessionUuid: string,
  tokenCount: number
): Promise<void> {
  await db
    .update(memorySessionsTable)
    .set({
      observation_count: sql`${memorySessionsTable.observation_count} + 1`,
      total_tokens: sql`${memorySessionsTable.total_tokens} + ${tokenCount}`,
    })
    .where(eq(memorySessionsTable.uuid, sessionUuid));
}

/**
 * Abandon stale sessions (no activity for > threshold hours)
 * @param profileUuid - When provided, only abandon sessions belonging to this profile. When omitted (cron job), processes all.
 * @param staleThresholdHours - Number of hours of inactivity before a session is considered stale (default: 24)
 */
export async function abandonStaleSessions(
  profileUuid?: string,
  staleThresholdHours: number = 24
): Promise<number> {
  const threshold = new Date();
  threshold.setHours(threshold.getHours() - staleThresholdHours);

  const conditions = [
    eq(memorySessionsTable.status, 'active'),
    sql`${memorySessionsTable.started_at} < ${threshold}`,
  ];

  if (profileUuid) {
    conditions.push(eq(memorySessionsTable.profile_uuid, profileUuid));
  }

  const result = await db
    .update(memorySessionsTable)
    .set({
      status: 'abandoned',
      ended_at: new Date(),
    })
    .where(and(...conditions))
    .returning({ uuid: memorySessionsTable.uuid });

  return result.length;
}
