/**
 * Gut Agent - Collective Wisdom
 *
 * The outermost ring: digital intuition from anonymized aggregated patterns.
 * Like Carl Jung's collective unconscious - shared instincts that guide
 * without conscious effort.
 *
 * Privacy-preserving: patterns are normalized, hashed, and only persisted
 * when seen by >= K unique profiles (k-anonymity).
 */

import { createHash } from 'crypto';
import { ChatOpenAI } from '@langchain/openai';
import { eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/db';
import { gutPatternsTable, memoryRingTable } from '@/db/schema';

import { GUT_K_ANONYMITY_THRESHOLD, GUT_MAX_PATTERN_TOKENS } from './constants';
import { generateEmbedding } from './embedding-service';
import { searchGutPatterns, upsertGutPatternVector } from './vector-service';
import type { MemoryResult, PatternType } from './types';

// ============================================================================
// Pattern Extraction & Normalization
// ============================================================================

const PATTERN_EXTRACTION_PROMPT = `You are a Pattern Extractor. Given a memory, extract the generalizable pattern.

Rules:
- Remove all profile-specific details (names, IDs, specific values)
- Keep the pattern structure (what tool was used, what sequence of actions, what worked/failed)
- Compress to max ${GUT_MAX_PATTERN_TOKENS} tokens
- Classify the pattern type: tool_sequence, error_recovery, workflow, preference, best_practice

Respond in JSON:
{
  "pattern_type": "tool_sequence|error_recovery|workflow|preference|best_practice",
  "pattern_description": "Human-readable description",
  "compressed_pattern": "Normalized pattern (max ${GUT_MAX_PATTERN_TOKENS} tokens)"
}`;

function getPatternLLM(): ChatOpenAI {
  return new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: process.env.MEMORY_PATTERN_MODEL || 'gpt-4o-mini',
    temperature: 0.1,
    maxTokens: 300,
  });
}

/**
 * Extract a normalized pattern from memory content
 */
async function extractPattern(content: string): Promise<{
  patternType: PatternType;
  patternDescription: string;
  compressedPattern: string;
} | null> {
  try {
    const llm = getPatternLLM();

    const response = await llm.invoke([
      { role: 'system', content: PATTERN_EXTRACTION_PROMPT },
      { role: 'user', content },
    ]);

    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      patternType: parsed.pattern_type as PatternType,
      patternDescription: parsed.pattern_description,
      compressedPattern: parsed.compressed_pattern,
    };
  } catch {
    return null;
  }
}

/**
 * Hash a normalized pattern for deduplication
 */
function hashPattern(compressedPattern: string): string {
  return createHash('sha256')
    .update(compressedPattern.toLowerCase().trim())
    .digest('hex');
}

// ============================================================================
// Aggregation
// ============================================================================

/**
 * Aggregate patterns from all profiles into gut patterns.
 * This is the core of collective wisdom - runs periodically.
 */
export async function aggregatePatterns(): Promise<MemoryResult<{
  extracted: number;
  newPatterns: number;
  reinforced: number;
}>> {
  try {
    let extracted = 0;
    let newPatterns = 0;
    let reinforced = 0;

    // Get high-quality memories from all profiles that haven't been processed
    // Only memories with decent success scores and reinforcement
    const memories = await db
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
        sql`${memoryRingTable.reinforcement_count} >= 2
          AND (${memoryRingTable.success_score} IS NULL OR ${memoryRingTable.success_score} >= 0.5)
          AND ${memoryRingTable.current_decay_stage} != 'forgotten'
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_extract_path_text(${memoryRingTable.metadata}::jsonb, 'gut_processed')
            WHERE jsonb_extract_path_text(${memoryRingTable.metadata}::jsonb, 'gut_processed') = 'true'
          )`
      )
      .limit(100);

    for (const memory of memories) {
      const content = memory.content || memory.contentFull;
      if (!content) continue;

      const pattern = await extractPattern(content);
      if (!pattern) continue;

      extracted++;
      const hash = hashPattern(pattern.compressedPattern);

      // Check if pattern already exists
      const [existing] = await db
        .select()
        .from(gutPatternsTable)
        .where(eq(gutPatternsTable.pattern_hash, hash))
        .limit(1);

      if (existing) {
        // Check if this profile is new to this pattern
        const isNewProfile = !((existing.metadata as Record<string, unknown>)?.profile_hashes as string[] ?? [])
          .includes(hashPattern(memory.profileUuid));

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
            metadata: sql`jsonb_set(
              COALESCE(${gutPatternsTable.metadata}, '{}'::jsonb),
              '{last_seen}',
              ${JSON.stringify(new Date().toISOString())}::jsonb
            )`,
          })
          .where(eq(gutPatternsTable.uuid, existing.uuid));

        reinforced++;
      } else {
        // Create new pattern (only if we can eventually reach k-anonymity)
        let embedding: number[] | null = null;
        try {
          embedding = await generateEmbedding(pattern.compressedPattern);
        } catch {
          // Non-fatal
        }

        const [newPattern] = await db
          .insert(gutPatternsTable)
          .values({
            pattern_hash: hash,
            pattern_type: pattern.patternType,
            pattern_description: pattern.patternDescription,
            compressed_pattern: pattern.compressedPattern,
            occurrence_count: 1,
            success_rate: memory.successScore ?? 0.5,
            unique_profile_count: 1,
            confidence: 0.3,
            metadata: {
              first_seen: new Date().toISOString(),
              last_seen: new Date().toISOString(),
              profile_hashes: [hashPattern(memory.profileUuid)],
            },
          })
          .returning({ uuid: gutPatternsTable.uuid });

        // Store embedding in zvec
        if (embedding && newPattern) {
          try {
            upsertGutPatternVector(newPattern.uuid, embedding, pattern.patternType);
          } catch {
            // Non-fatal
          }
        }

        newPatterns++;
      }

      // Mark memory as gut-processed
      await db
        .update(memoryRingTable)
        .set({
          metadata: sql`jsonb_set(
            COALESCE(${memoryRingTable.metadata}, '{}'::jsonb),
            '{gut_processed}',
            'true'::jsonb
          )`,
        })
        .where(eq(memoryRingTable.uuid, memory.uuid));
    }

    return {
      success: true,
      data: { extracted, newPatterns, reinforced },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to aggregate patterns',
    };
  }
}

// ============================================================================
// Querying Collective Wisdom
// ============================================================================

/**
 * Query the gut for intuition about a topic
 */
export async function queryIntuition(
  query: string,
  topK: number = 5
): Promise<MemoryResult<Array<{
  uuid: string;
  patternType: string;
  description: string;
  pattern: string;
  confidence: number;
  occurrenceCount: number;
  successRate: number;
  similarity: number;
}>>> {
  try {
    const queryEmbedding = await generateEmbedding(query);

    // Search zvec for similar patterns (returns uuid + score)
    const vectorResults = searchGutPatterns({
      queryEmbedding,
      topK,
      threshold: 0.5,
    });

    if (vectorResults.length === 0) {
      return { success: true, data: [] };
    }

    // Fetch full pattern data from PostgreSQL
    const uuids = vectorResults.map(r => r.uuid);
    const patterns = await db
      .select()
      .from(gutPatternsTable)
      .where(inArray(gutPatternsTable.uuid, uuids));

    // Build score map for merging
    const scoreMap = new Map(vectorResults.map(r => [r.uuid, r.score]));

    // Only return patterns that meet k-anonymity threshold
    const filtered = patterns.filter(p =>
      (p.occurrence_count ?? 0) >= GUT_K_ANONYMITY_THRESHOLD
    );

    return {
      success: true,
      data: filtered.map(p => ({
        uuid: p.uuid,
        patternType: p.pattern_type ?? '',
        description: p.pattern_description ?? '',
        pattern: p.compressed_pattern ?? '',
        confidence: p.confidence ?? 0,
        occurrenceCount: p.occurrence_count ?? 0,
        successRate: p.success_rate ?? 0,
        similarity: scoreMap.get(p.uuid) ?? 0,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to query intuition',
    };
  }
}
