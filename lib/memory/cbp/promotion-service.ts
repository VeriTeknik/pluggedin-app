/**
 * CBP Promotion Service
 *
 * Pipeline: Memory Ring → Eligibility → Anonymize → Dedup → Score → gut_patterns
 *
 * Promotes high-quality, reinforced individual memories into the collective
 * pattern pool with privacy-preserving anonymization and deduplication.
 */

import { createHash } from 'crypto';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  collectiveContributionsTable,
  gutPatternsTable,
  memoryRingTable,
} from '@/db/schema';

import {
  CBP_DEDUP_SIMILARITY_THRESHOLD,
  CBP_MIN_REINFORCEMENT,
  CBP_MIN_SUCCESS_SCORE,
  GUT_AGGREGATION_BATCH_LIMIT,
  GUT_K_ANONYMITY_THRESHOLD,
} from '../constants';
import { generateEmbedding } from '../embedding-service';
import { searchGutPatterns, upsertGutPatternVector } from '../vector-service';
import type { MemoryResult, PatternType } from '../types';
import { anonymize, stripPII } from './anonymizer';

// ============================================================================
// Helpers
// ============================================================================

function hashProfileUuid(profileUuid: string): string {
  return createHash('sha256').update(profileUuid).digest('hex');
}

function hashPattern(text: string): string {
  return createHash('sha256').update(text.toLowerCase().trim()).digest('hex');
}

// ============================================================================
// Eligibility Check
// ============================================================================

interface EligibleMemory {
  uuid: string;
  profileUuid: string;
  content: string | null;
  contentFull: string | null;
  ringType: string | null;
  successScore: number | null;
}

/**
 * Find memories eligible for CBP promotion.
 * Criteria:
 * - reinforcement_count >= CBP_MIN_REINFORCEMENT
 * - success_score >= CBP_MIN_SUCCESS_SCORE (or null)
 * - Not already processed for CBP
 * - Not in 'forgotten' decay stage
 */
async function findEligibleMemories(limit: number): Promise<EligibleMemory[]> {
  return db
    .select({
      uuid: memoryRingTable.uuid,
      profileUuid: memoryRingTable.profile_uuid,
      content: memoryRingTable.content_summary,
      contentFull: memoryRingTable.content_full,
      ringType: memoryRingTable.ring_type,
      successScore: memoryRingTable.success_score,
    })
    .from(memoryRingTable)
    .where(
      sql`${memoryRingTable.reinforcement_count} >= ${CBP_MIN_REINFORCEMENT}
        AND (${memoryRingTable.success_score} IS NULL OR ${memoryRingTable.success_score} >= ${CBP_MIN_SUCCESS_SCORE})
        AND ${memoryRingTable.current_decay_stage} != 'forgotten'
        AND COALESCE(${memoryRingTable.metadata}::jsonb->>'cbp_promoted', 'false') <> 'true'`
    )
    .limit(limit);
}

// ============================================================================
// Deduplication
// ============================================================================

interface DedupResult {
  isDuplicate: boolean;
  existingPatternUuid?: string;
  similarity?: number;
}

/**
 * Check if a pattern already exists in the collective pool using vector similarity.
 */
async function checkDuplicate(embedding: number[]): Promise<DedupResult> {
  const results = searchGutPatterns({
    queryEmbedding: embedding,
    topK: 1,
    threshold: CBP_DEDUP_SIMILARITY_THRESHOLD,
  });

  if (results.length > 0) {
    return {
      isDuplicate: true,
      existingPatternUuid: results[0].uuid,
      similarity: results[0].score,
    };
  }

  return { isDuplicate: false };
}

// ============================================================================
// Contribution Tracking
// ============================================================================

async function trackContribution(
  patternUuid: string,
  profileUuid: string,
  sourceRingUuid: string,
  successScore: number | null,
  ringType: string | null
): Promise<void> {
  const profileHash = hashProfileUuid(profileUuid);

  await db
    .insert(collectiveContributionsTable)
    .values({
      pattern_uuid: patternUuid,
      profile_hash: profileHash,
      source_ring_uuid: sourceRingUuid,
      success_score: successScore,
      ring_type: ringType,
    })
    .onConflictDoNothing(); // Skip if already contributed
}

// ============================================================================
// Core Promotion Pipeline
// ============================================================================

export interface PromotionStats {
  eligible: number;
  anonymized: number;
  newPatterns: number;
  reinforced: number;
  skipped: number;
  errors: number;
}

/**
 * Run the CBP promotion pipeline.
 *
 * For each eligible memory:
 * 1. Anonymize (regex PII strip + LLM generalization)
 * 2. Generate embedding for the anonymized content
 * 3. Dedup against existing patterns (cosine ≥ 0.90)
 * 4. If duplicate → reinforce existing pattern + track contribution
 * 5. If new → create gut pattern + track contribution
 * 6. Mark source memory as cbp_promoted
 */
export async function runPromotionPipeline(): Promise<MemoryResult<PromotionStats>> {
  const stats: PromotionStats = {
    eligible: 0,
    anonymized: 0,
    newPatterns: 0,
    reinforced: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    const memories = await findEligibleMemories(GUT_AGGREGATION_BATCH_LIMIT);
    stats.eligible = memories.length;

    for (const memory of memories) {
      try {
        const content = memory.content || memory.contentFull;
        if (!content) {
          stats.skipped++;
          continue;
        }

        // Step 1: Anonymize
        const anonResult = await anonymize(content);
        if (!anonResult.success || !anonResult.data) {
          stats.errors++;
          continue;
        }
        stats.anonymized++;

        const anonymizedText = anonResult.data.anonymized;
        const patternHash = hashPattern(anonymizedText);

        // Step 2: Generate embedding
        let embedding: number[];
        try {
          embedding = await generateEmbedding(anonymizedText);
        } catch {
          stats.errors++;
          continue;
        }

        // Step 3: Dedup check
        const dedup = await checkDuplicate(embedding);

        if (dedup.isDuplicate && dedup.existingPatternUuid) {
          // Step 4a: Reinforce existing pattern
          const profileHash = hashProfileUuid(memory.profileUuid);

          // Check if this profile is new to this pattern
          const [existing] = await db
            .select({ metadata: gutPatternsTable.metadata })
            .from(gutPatternsTable)
            .where(eq(gutPatternsTable.uuid, dedup.existingPatternUuid))
            .limit(1);

          const existingHashes = (existing?.metadata as Record<string, unknown>)?.profile_hashes as string[] ?? [];
          const isNewProfile = !existingHashes.includes(profileHash);

          const metadataUpdate = isNewProfile
            ? sql`jsonb_set(
                jsonb_set(
                  COALESCE(${gutPatternsTable.metadata}, '{}'::jsonb),
                  '{last_seen}',
                  ${JSON.stringify(new Date().toISOString())}::jsonb
                ),
                '{profile_hashes}',
                (COALESCE(${gutPatternsTable.metadata}->'profile_hashes', '[]'::jsonb) || ${JSON.stringify(profileHash)}::jsonb)
              )`
            : sql`jsonb_set(
                COALESCE(${gutPatternsTable.metadata}, '{}'::jsonb),
                '{last_seen}',
                ${JSON.stringify(new Date().toISOString())}::jsonb
              )`;

          await db
            .update(gutPatternsTable)
            .set({
              occurrence_count: sql`${gutPatternsTable.occurrence_count} + 1`,
              success_rate: sql`(${gutPatternsTable.success_rate} * ${gutPatternsTable.occurrence_count} + ${memory.successScore ?? 0.5}) / (${gutPatternsTable.occurrence_count} + 1)`,
              unique_profile_count: isNewProfile
                ? sql`${gutPatternsTable.unique_profile_count} + 1`
                : gutPatternsTable.unique_profile_count,
              confidence: sql`LEAST(1.0, ${gutPatternsTable.confidence} + 0.05)`,
              updated_at: new Date(),
              metadata: metadataUpdate,
            })
            .where(eq(gutPatternsTable.uuid, dedup.existingPatternUuid));

          await trackContribution(
            dedup.existingPatternUuid,
            memory.profileUuid,
            memory.uuid,
            memory.successScore,
            memory.ringType
          );

          stats.reinforced++;
        } else {
          // Step 4b: Create new pattern
          // Determine pattern type from ring type
          const patternType = mapRingTypeToPatternType(memory.ringType);

          const [newPattern] = await db
            .insert(gutPatternsTable)
            .values({
              pattern_hash: patternHash,
              pattern_type: patternType,
              pattern_description: anonymizedText.slice(0, 500),
              compressed_pattern: anonymizedText.slice(0, 500),
              occurrence_count: 1,
              success_rate: memory.successScore ?? 0.5,
              unique_profile_count: 1,
              confidence: 0.3,
              metadata: {
                first_seen: new Date().toISOString(),
                last_seen: new Date().toISOString(),
                profile_hashes: [hashProfileUuid(memory.profileUuid)],
              },
            })
            .returning({ uuid: gutPatternsTable.uuid });

          if (newPattern) {
            try {
              upsertGutPatternVector(newPattern.uuid, embedding, patternType);
            } catch {
              // Vector storage failure is non-fatal
            }

            await trackContribution(
              newPattern.uuid,
              memory.profileUuid,
              memory.uuid,
              memory.successScore,
              memory.ringType
            );
          }

          stats.newPatterns++;
        }

        // Step 5: Mark source memory as cbp_promoted
        await db
          .update(memoryRingTable)
          .set({
            metadata: sql`jsonb_set(
              COALESCE(${memoryRingTable.metadata}, '{}'::jsonb),
              '{cbp_promoted}',
              'true'::jsonb
            )`,
          })
          .where(eq(memoryRingTable.uuid, memory.uuid));
      } catch {
        stats.errors++;
      }
    }

    return { success: true, data: stats };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Promotion pipeline failed',
    };
  }
}

// ============================================================================
// Statistics
// ============================================================================

export async function getPromotionStats(): Promise<MemoryResult<{
  totalPatterns: number;
  patternsAboveThreshold: number;
  totalContributions: number;
  uniqueContributors: number;
}>> {
  try {
    const [patternStats] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        aboveThreshold: sql<number>`COUNT(*) FILTER (WHERE ${gutPatternsTable.unique_profile_count} >= ${GUT_K_ANONYMITY_THRESHOLD})`,
      })
      .from(gutPatternsTable);

    const [contribStats] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        uniqueProfiles: sql<number>`COUNT(DISTINCT ${collectiveContributionsTable.profile_hash})`,
      })
      .from(collectiveContributionsTable);

    return {
      success: true,
      data: {
        totalPatterns: Number(patternStats?.total ?? 0),
        patternsAboveThreshold: Number(patternStats?.aboveThreshold ?? 0),
        totalContributions: Number(contribStats?.total ?? 0),
        uniqueContributors: Number(contribStats?.uniqueProfiles ?? 0),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get promotion stats',
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function mapRingTypeToPatternType(ringType: string | null): PatternType {
  switch (ringType) {
    case 'procedures': return 'workflow';
    case 'practice': return 'best_practice';
    case 'shocks': return 'error_recovery';
    case 'longterm': return 'tool_sequence';
    default: return 'best_practice';
  }
}
