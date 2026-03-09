/**
 * Observation Service
 *
 * Captures observations into fresh memory buffer.
 * Observations are the raw input to the memory system - tool calls,
 * decisions, errors, insights, etc. that get classified by the Analytics Agent.
 */

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { freshMemoryTable } from '@/db/schema';

import { FRESH_MEMORY_TTL_HOURS } from './constants';
import { stripPII } from './cbp/anonymizer';
import { generateEmbedding, estimateTokenCount } from './embedding-service';
import { recordTemporalEvent } from './jungian/temporal-event-service';
import { incrementObservationCount } from './session-service';
import { upsertFreshMemoryVector, deleteFreshMemoryVector } from './vector-service';
import type { AddObservationParams, MemoryResult, RingType } from './types';

/**
 * Record a new observation in fresh memory
 */
export async function addObservation(
  params: AddObservationParams
): Promise<MemoryResult<{ uuid: string }>> {
  try {
    // Server-side PII scrub — defence-in-depth layer.
    // Hook-side pci-scrub.py is Layer 1 (before sending over the wire).
    // This is Layer 2 (on receipt, before writing to DB).
    // Catches anything missed by the hook or submitted directly via the API.
    const { sanitized: content } = stripPII(params.content);

    const tokenCount = estimateTokenCount(content);

    // Generate embedding for semantic search
    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(content);
    } catch {
      // Non-fatal: observation is still stored without embedding
      console.warn('Failed to generate embedding for observation, storing without vector');
    }

    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + FRESH_MEMORY_TTL_HOURS);

    const [observation] = await db
      .insert(freshMemoryTable)
      .values({
        profile_uuid: params.profileUuid,
        session_uuid: params.sessionUuid,
        agent_uuid: params.agentUuid ?? null,
        observation_type: params.type,
        content,
        token_count: tokenCount,
        outcome: params.outcome ?? null,
        metadata: params.metadata ?? null,
        expires_at: expiresAt,
      })
      .returning({ uuid: freshMemoryTable.uuid });

    // Store embedding in zvec (separate from PostgreSQL)
    if (embedding) {
      try {
        upsertFreshMemoryVector(
          observation.uuid,
          embedding,
          params.profileUuid,
          params.agentUuid
        );
      } catch {
        console.warn('Failed to store embedding in zvec, continuing without vector');
      }
    }

    // Update session counters
    await incrementObservationCount(params.sessionUuid, tokenCount);

    // Fire-and-forget: record temporal event for synchronicity detection
    if (params.type === 'tool_call' || params.type === 'tool_result') {
      recordTemporalEvent(
        params.profileUuid,
        params.metadata?.tool_name ?? 'unknown',
        params.type,
        params.outcome,
        params.metadata?.context_hash as string | undefined
      ).catch((err) => console.error('[temporal-event] failed — synchronicity data may be incomplete:', err));
    }

    return { success: true, data: { uuid: observation.uuid } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add observation',
    };
  }
}

/**
 * Get unclassified observations for the Analytics Agent
 */
export async function getUnclassifiedObservations(
  profileUuid: string,
  limit: number = 50
) {
  return db
    .select()
    .from(freshMemoryTable)
    .where(
      and(
        eq(freshMemoryTable.profile_uuid, profileUuid),
        eq(freshMemoryTable.classified, false)
      )
    )
    .orderBy(freshMemoryTable.created_at)
    .limit(limit);
}

/**
 * Mark an observation as classified
 */
export async function markClassified(
  uuid: string,
  ringType: RingType,
  confidence: number
): Promise<void> {
  await db
    .update(freshMemoryTable)
    .set({
      classified: true,
      classified_ring: ringType,
      classified_at: new Date(),
      classification_confidence: confidence,
    })
    .where(eq(freshMemoryTable.uuid, uuid));
}

/**
 * Get observations for a specific session
 */
export async function getSessionObservations(
  sessionUuid: string,
  options?: { limit?: number; offset?: number }
) {
  return db
    .select()
    .from(freshMemoryTable)
    .where(eq(freshMemoryTable.session_uuid, sessionUuid))
    .orderBy(freshMemoryTable.created_at)
    .limit(options?.limit ?? 100)
    .offset(options?.offset ?? 0);
}

/**
 * Get observation by UUID.
 * When profileUuid is provided, it acts as an ownership guard.
 */
export async function getObservationByUuid(uuid: string, profileUuid?: string) {
  const conditions = [eq(freshMemoryTable.uuid, uuid)];
  if (profileUuid) {
    conditions.push(eq(freshMemoryTable.profile_uuid, profileUuid));
  }

  const [observation] = await db
    .select()
    .from(freshMemoryTable)
    .where(and(...conditions))
    .limit(1);

  return observation ?? null;
}

/**
 * Cleanup expired fresh memories
 * @param profileUuid - When provided, only clean up memories belonging to this profile. When omitted (cron job), cleans all.
 */
export async function cleanupExpiredFreshMemory(profileUuid?: string): Promise<number> {
  const conditions = [
    sql`${freshMemoryTable.expires_at} IS NOT NULL`,
    sql`${freshMemoryTable.expires_at} < NOW()`,
  ];

  if (profileUuid) {
    conditions.push(eq(freshMemoryTable.profile_uuid, profileUuid));
  }

  const result = await db
    .delete(freshMemoryTable)
    .where(and(...conditions))
    .returning({ uuid: freshMemoryTable.uuid });

  // Clean up corresponding zvec vectors
  for (const row of result) {
    deleteFreshMemoryVector(row.uuid);
  }

  return result.length;
}

/**
 * Get fresh memory stats for a profile
 */
export async function getFreshMemoryStats(profileUuid: string) {
  const [counts] = await db
    .select({
      total: sql<number>`count(*)`,
      unclassified: sql<number>`count(*) filter (where ${freshMemoryTable.classified} = false)`,
    })
    .from(freshMemoryTable)
    .where(eq(freshMemoryTable.profile_uuid, profileUuid));

  // Separate query for type breakdown
  const typeCounts = await db
    .select({
      type: freshMemoryTable.observation_type,
      count: sql<number>`count(*)`,
    })
    .from(freshMemoryTable)
    .where(eq(freshMemoryTable.profile_uuid, profileUuid))
    .groupBy(freshMemoryTable.observation_type);

  const byType: Record<string, number> = {};
  for (const row of typeCounts) {
    byType[row.type] = row.count;
  }

  return {
    total: counts?.total ?? 0,
    unclassified: counts?.unclassified ?? 0,
    byType,
  };
}

/**
 * Update the outcome of an observation
 */
export async function updateObservationOutcome(
  uuid: string,
  outcome: 'success' | 'failure' | 'neutral'
): Promise<void> {
  await db
    .update(freshMemoryTable)
    .set({ outcome })
    .where(eq(freshMemoryTable.uuid, uuid));
}

/**
 * Count unclassified observations for a profile
 */
export async function countUnclassified(profileUuid: string): Promise<number> {
  const [result] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(freshMemoryTable)
    .where(
      and(
        eq(freshMemoryTable.profile_uuid, profileUuid),
        eq(freshMemoryTable.classified, false)
      )
    );

  return result?.count ?? 0;
}
