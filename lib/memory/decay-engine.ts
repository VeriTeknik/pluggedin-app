/**
 * Decay Engine
 *
 * Implements intelligent forgetting with token economics.
 * Memories progress through decay stages over time:
 * FULL (500 tokens) → COMPRESSED (250) → SUMMARY (150) → ESSENCE (50) → FORGOTTEN
 *
 * Exceptions:
 * - SHOCKS never decay
 * - High reinforcement/access counts slow decay
 * - Low success scores accelerate decay
 */

import { ChatOpenAI } from '@langchain/openai';
import { and, eq, lt, ne, sql } from 'drizzle-orm';

import { db } from '@/db';
import { memoryRingTable } from '@/db/schema';

import {
  ACCESS_SLOW_MULTIPLIER,
  ACCESS_SLOW_THRESHOLD,
  DECAY_SCHEDULE_DAYS,
  LOW_SUCCESS_MULTIPLIER,
  LOW_SUCCESS_THRESHOLD,
  MAX_MEMORIES_PER_RING,
  MIN_RELEVANCE_SCORE,
  NEXT_DECAY_STAGE,
  REINFORCEMENT_SLOW_MULTIPLIER,
  REINFORCEMENT_SLOW_THRESHOLD,
  TOKEN_BUDGETS,
  RECENCY_HALF_LIFE_DAYS,
  REINFORCEMENT_WEIGHT,
  SUCCESS_WEIGHT,
  ACCESS_WEIGHT,
  BASE_WEIGHT,
} from './constants';
import { generateEmbedding } from './embedding-service';
import { deleteMemoryRingVector, upsertMemoryRingVector } from './vector-service';
import type { DecayStage, MemoryResult } from './types';

// ============================================================================
// LLM Compression
// ============================================================================

function getCompressionLLM(): ChatOpenAI {
  return new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: process.env.MEMORY_COMPRESSION_MODEL || 'gpt-4o-mini',
    temperature: 0.1,
  });
}

const COMPRESSION_PROMPTS: Record<string, string> = {
  compressed: `Compress the following memory to approximately 250 tokens. Keep the essential facts, actions, and outcomes. Remove redundancy and specific details that aren't critical.`,
  summary: `Summarize the following memory to approximately 150 tokens. Extract only the key insight, pattern, or lesson learned.`,
  essence: `Distill the following memory to its absolute essence in approximately 50 tokens. What is the one core takeaway?`,
};

/**
 * Compress content to the next decay stage
 */
async function compressContent(
  content: string,
  targetStage: DecayStage
): Promise<string> {
  const prompt = COMPRESSION_PROMPTS[targetStage];
  if (!prompt) {
    throw new Error(`No compression prompt for stage: ${targetStage}`);
  }

  const llm = getCompressionLLM();
  const response = await llm.invoke([
    { role: 'system', content: prompt },
    { role: 'user', content },
  ]);

  return typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);
}

// ============================================================================
// Decay Processing
// ============================================================================

/**
 * Process all memories due for decay
 */
export async function processDecay(): Promise<MemoryResult<{
  processed: number;
  compressed: number;
  forgotten: number;
  errors: number;
}>> {
  try {
    let processed = 0;
    let compressed = 0;
    let forgotten = 0;
    let errors = 0;

    // Find memories due for decay (not shocks, not already forgotten)
    const duForDecay = await db
      .select()
      .from(memoryRingTable)
      .where(
        and(
          eq(memoryRingTable.is_shock, false),
          ne(memoryRingTable.current_decay_stage, 'forgotten'),
          lt(memoryRingTable.next_decay_at, new Date())
        )
      )
      .limit(100); // Process in batches

    for (const memory of duForDecay) {
      try {
        processed++;

        const nextStage = NEXT_DECAY_STAGE[memory.current_decay_stage];

        if (nextStage === 'forgotten' || nextStage === null) {
          // Mark as forgotten (will be cleaned up later)
          await db
            .update(memoryRingTable)
            .set({
              current_decay_stage: 'forgotten',
              current_token_count: 0,
              updated_at: new Date(),
              metadata: {
                ...(memory.metadata as Record<string, unknown> ?? {}),
                decay_history: [
                  ...(((memory.metadata as Record<string, unknown>)?.decay_history ?? []) as Array<{ from: string; to: string; at: string }>),
                  { from: memory.current_decay_stage, to: 'forgotten', at: new Date().toISOString() },
                ],
              },
            })
            .where(eq(memoryRingTable.uuid, memory.uuid));

          // Remove vector from zvec
          deleteMemoryRingVector(memory.uuid);

          forgotten++;
          continue;
        }

        // Get current content at the active stage
        const currentContent = getCurrentContent(memory);
        if (!currentContent) {
          errors++;
          continue;
        }

        // Compress to next stage
        const compressedContent = await compressContent(currentContent, nextStage);

        // Generate new embedding for compressed content
        let newEmbedding: number[] | null = null;
        try {
          newEmbedding = await generateEmbedding(compressedContent);
        } catch {
          // Keep old embedding if new one fails
        }

        // Calculate next decay date with multipliers
        const nextDecayAt = calculateNextDecayDate(memory, nextStage);

        // Build update based on target stage
        const updateData: Record<string, unknown> = {
          current_decay_stage: nextStage,
          current_token_count: Math.ceil(compressedContent.length / 4),
          next_decay_at: nextDecayAt,
          updated_at: new Date(),
          metadata: {
            ...(memory.metadata as Record<string, unknown> ?? {}),
            decay_history: [
              ...(((memory.metadata as Record<string, unknown>)?.decay_history ?? []) as Array<{ from: string; to: string; at: string }>),
              { from: memory.current_decay_stage, to: nextStage, at: new Date().toISOString() },
            ],
          },
        };

        // Set content at the appropriate stage
        if (nextStage === 'compressed') updateData.content_compressed = compressedContent;
        if (nextStage === 'summary') updateData.content_summary = compressedContent;
        if (nextStage === 'essence') updateData.content_essence = compressedContent;

        await db
          .update(memoryRingTable)
          .set(updateData)
          .where(eq(memoryRingTable.uuid, memory.uuid));

        // Update embedding in zvec with compressed content
        if (newEmbedding) {
          try {
            upsertMemoryRingVector(
              memory.uuid,
              newEmbedding,
              memory.profile_uuid,
              memory.ring_type,
              memory.agent_uuid
            );
          } catch {
            // Non-fatal
          }
        }

        compressed++;
      } catch (error) {
        console.error(`Failed to decay memory ${memory.uuid}:`, error);
        errors++;
      }
    }

    return {
      success: true,
      data: { processed, compressed, forgotten, errors },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process decay',
    };
  }
}

// ============================================================================
// Natural Selection
// ============================================================================

/**
 * Cull lowest-relevance memories when ring exceeds threshold
 */
export async function runNaturalSelection(
  profileUuid: string,
  options?: {
    maxPerRing?: number;
    minRelevanceScore?: number;
  }
): Promise<MemoryResult<{ culled: number }>> {
  try {
    const maxPerRing = options?.maxPerRing ?? MAX_MEMORIES_PER_RING;
    const minRelevance = options?.minRelevanceScore ?? MIN_RELEVANCE_SCORE;
    let totalCulled = 0;

    // First: update relevance scores
    await updateRelevanceScores(profileUuid);

    // Delete memories below minimum relevance
    const lowRelevance = await db
      .delete(memoryRingTable)
      .where(
        and(
          eq(memoryRingTable.profile_uuid, profileUuid),
          eq(memoryRingTable.is_shock, false),
          lt(memoryRingTable.relevance_score, minRelevance)
        )
      )
      .returning({ uuid: memoryRingTable.uuid });

    // Clean up zvec vectors for deleted memories
    for (const row of lowRelevance) {
      deleteMemoryRingVector(row.uuid);
    }

    totalCulled += lowRelevance.length;

    // For each ring type, ensure we're under the limit
    const ringTypes = ['procedures', 'practice', 'longterm', 'shocks'] as const;

    for (const ringType of ringTypes) {
      if (ringType === 'shocks') continue; // Never cull shocks

      const count = await db
        .select({ count: sql<number>`count(*)` })
        .from(memoryRingTable)
        .where(
          and(
            eq(memoryRingTable.profile_uuid, profileUuid),
            eq(memoryRingTable.ring_type, ringType)
          )
        );

      const currentCount = count[0]?.count ?? 0;
      if (currentCount <= maxPerRing) continue;

      // Delete excess memories with lowest relevance
      const excess = currentCount - maxPerRing;
      const toDelete = await db
        .select({ uuid: memoryRingTable.uuid })
        .from(memoryRingTable)
        .where(
          and(
            eq(memoryRingTable.profile_uuid, profileUuid),
            eq(memoryRingTable.ring_type, ringType),
            eq(memoryRingTable.is_shock, false)
          )
        )
        .orderBy(memoryRingTable.relevance_score)
        .limit(excess);

      if (toDelete.length > 0) {
        const uuids = toDelete.map(d => d.uuid);
        await db
          .delete(memoryRingTable)
          .where(
            sql`${memoryRingTable.uuid} = ANY(${uuids})`
          );
        // Clean up zvec vectors
        for (const u of uuids) {
          deleteMemoryRingVector(u);
        }
        totalCulled += toDelete.length;
      }
    }

    return { success: true, data: { culled: totalCulled } };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run natural selection',
    };
  }
}

// ============================================================================
// Relevance Score Calculation
// ============================================================================

/**
 * Update relevance scores for all memories in a profile
 */
async function updateRelevanceScores(profileUuid: string): Promise<void> {
  // Relevance = base * recency * reinforcement * success * access
  // Using SQL for efficiency
  await db.execute(sql`
    UPDATE memory_ring
    SET relevance_score = GREATEST(0.01,
      ${BASE_WEIGHT}
      * EXP(-0.693 * EXTRACT(EPOCH FROM (NOW() - COALESCE(last_accessed_at, created_at))) / (${RECENCY_HALF_LIFE_DAYS} * 86400))
      * (1.0 + ${REINFORCEMENT_WEIGHT} * LEAST(reinforcement_count, 20))
      * (1.0 + ${SUCCESS_WEIGHT} * COALESCE(success_score, 0.5))
      * (1.0 + ${ACCESS_WEIGHT} * LN(1 + COALESCE(access_count, 0)))
    )
    WHERE profile_uuid = ${profileUuid}
      AND is_shock = false
      AND current_decay_stage != 'forgotten'
  `);
}

/**
 * Reinforce a memory (called when memory is accessed or re-observed)
 */
export async function reinforceMemory(memoryUuid: string): Promise<void> {
  await db
    .update(memoryRingTable)
    .set({
      reinforcement_count: sql`${memoryRingTable.reinforcement_count} + 1`,
      last_accessed_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(memoryRingTable.uuid, memoryUuid));
}

/**
 * Clean up forgotten memories
 */
export async function cleanupForgotten(): Promise<number> {
  const result = await db
    .delete(memoryRingTable)
    .where(eq(memoryRingTable.current_decay_stage, 'forgotten'))
    .returning({ uuid: memoryRingTable.uuid });

  // Clean up zvec vectors
  for (const row of result) {
    deleteMemoryRingVector(row.uuid);
  }

  return result.length;
}

// ============================================================================
// Helpers
// ============================================================================

function getCurrentContent(memory: typeof memoryRingTable.$inferSelect): string | null {
  switch (memory.current_decay_stage) {
    case 'full': return memory.content_full;
    case 'compressed': return memory.content_compressed;
    case 'summary': return memory.content_summary;
    case 'essence': return memory.content_essence;
    default: return null;
  }
}

function calculateNextDecayDate(
  memory: typeof memoryRingTable.$inferSelect,
  nextStage: DecayStage
): Date {
  const baseDays = DECAY_SCHEDULE_DAYS[nextStage] ?? 30;
  let multiplier = 1.0;

  // High reinforcement slows decay
  if ((memory.reinforcement_count ?? 0) > REINFORCEMENT_SLOW_THRESHOLD) {
    multiplier *= REINFORCEMENT_SLOW_MULTIPLIER;
  }

  // High access slows decay
  if ((memory.access_count ?? 0) > ACCESS_SLOW_THRESHOLD) {
    multiplier *= ACCESS_SLOW_MULTIPLIER;
  }

  // Low success accelerates decay
  if (memory.success_score !== null && memory.success_score < LOW_SUCCESS_THRESHOLD) {
    multiplier *= LOW_SUCCESS_MULTIPLIER;
  }

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + Math.round(baseDays * multiplier));
  return nextDate;
}
