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
import { generateEmbedding, estimateTokenCount } from './embedding-service';
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
    const tokenCount = estimateTokenCount(params.content);

    // Generate embedding for semantic search
    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(params.content);
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
        content: params.content,
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
 * Get observation by UUID
 */
export async function getObservationByUuid(uuid: string) {
  const [observation] = await db
    .select()
    .from(freshMemoryTable)
    .where(eq(freshMemoryTable.uuid, uuid))
    .limit(1);

  return observation ?? null;
}

/**
 * Cleanup expired fresh memories
 */
export async function cleanupExpiredFreshMemory(): Promise<number> {
  const result = await db
    .delete(freshMemoryTable)
    .where(
      and(
        sql`${freshMemoryTable.expires_at} IS NOT NULL`,
        sql`${freshMemoryTable.expires_at} < NOW()`
      )
    )
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
  const [stats] = await db
    .select({
      total: sql<number>`count(*)`,
      unclassified: sql<number>`count(*) filter (where ${freshMemoryTable.classified} = false)`,
      byType: sql<Record<string, number>>`jsonb_object_agg(
        ${freshMemoryTable.observation_type},
        type_count
      ) FROM (
        SELECT ${freshMemoryTable.observation_type}, count(*) as type_count
        FROM ${freshMemoryTable}
        WHERE ${freshMemoryTable.profile_uuid} = ${profileUuid}
        GROUP BY ${freshMemoryTable.observation_type}
      ) sub`,
    })
    .from(freshMemoryTable)
    .where(eq(freshMemoryTable.profile_uuid, profileUuid));

  return stats;
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
