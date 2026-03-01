/**
 * CBP Injection Engine - Proactive Pattern Delivery
 *
 * Delivers collective patterns to users based on context:
 * - Proactive warning: Before tool calls with known pitfalls
 * - Post-error suggestion: After errors match collective knowledge
 * - Contextual enrichment: When search context matches patterns
 *
 * Only returns patterns that meet k-anonymity threshold.
 */

import { eq, sql, inArray, and, gte } from 'drizzle-orm';

import { db } from '@/db';
import {
  collectiveFeedbackTable,
  gutPatternsTable,
} from '@/db/schema';

import {
  CBP_INJECTION_SIMILARITY_THRESHOLD,
  CBP_MAX_INJECTION_RESULTS,
  CBP_MIN_FEEDBACK_RATING,
  CBP_NEGATIVE_FEEDBACK_THRESHOLD,
  GUT_K_ANONYMITY_THRESHOLD,
} from '../constants';
import { generateEmbedding } from '../embedding-service';
import { searchGutPatterns } from '../vector-service';
import type { InjectionContext, MemoryResult } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface InjectedPattern {
  uuid: string;
  patternType: string;
  description: string;
  pattern: string;
  confidence: number;
  occurrenceCount: number;
  successRate: number;
  similarity: number;
  context: InjectionContext;
  averageRating: number | null;
}

// ============================================================================
// Core Injection Queries
// ============================================================================

/**
 * Get relevant collective patterns for a given context.
 * Returns patterns that meet k-anonymity and feedback thresholds.
 */
async function findRelevantPatterns(
  queryEmbedding: number[],
  context: InjectionContext,
  maxResults: number = CBP_MAX_INJECTION_RESULTS
): Promise<InjectedPattern[]> {
  // Vector search for similar patterns
  const vectorResults = searchGutPatterns({
    queryEmbedding,
    topK: maxResults * 2, // Fetch extra for filtering
    threshold: CBP_INJECTION_SIMILARITY_THRESHOLD,
  });

  if (vectorResults.length === 0) {
    return [];
  }

  const uuids = vectorResults.map(r => r.uuid);

  // Fetch pattern data with k-anonymity filter
  const patterns = await db
    .select()
    .from(gutPatternsTable)
    .where(
      and(
        inArray(gutPatternsTable.uuid, uuids),
        gte(gutPatternsTable.unique_profile_count, GUT_K_ANONYMITY_THRESHOLD)
      )
    );

  // Get average ratings for these patterns
  const feedbackRows = await db
    .select({
      pattern_uuid: collectiveFeedbackTable.pattern_uuid,
      avgRating: sql<number>`AVG(${collectiveFeedbackTable.rating})`,
      feedbackCount: sql<number>`COUNT(*)`,
    })
    .from(collectiveFeedbackTable)
    .where(inArray(collectiveFeedbackTable.pattern_uuid, uuids))
    .groupBy(collectiveFeedbackTable.pattern_uuid);

  const feedbackMap = new Map(
    feedbackRows.map(r => [r.pattern_uuid, { avg: Number(r.avgRating), count: Number(r.feedbackCount) }])
  );

  const scoreMap = new Map(vectorResults.map(r => [r.uuid, r.score]));

  // Filter out patterns with poor feedback
  const filtered = patterns
    .filter(p => {
      const feedback = feedbackMap.get(p.uuid);
      // No feedback = OK; feedback with avg < threshold = skip
      if (feedback && feedback.count >= CBP_NEGATIVE_FEEDBACK_THRESHOLD && feedback.avg < CBP_MIN_FEEDBACK_RATING) {
        return false;
      }
      return true;
    })
    .map(p => ({
      uuid: p.uuid,
      patternType: p.pattern_type ?? '',
      description: p.pattern_description ?? '',
      pattern: p.compressed_pattern ?? '',
      confidence: p.confidence ?? 0,
      occurrenceCount: p.occurrence_count ?? 0,
      successRate: p.success_rate ?? 0,
      similarity: scoreMap.get(p.uuid) ?? 0,
      context,
      averageRating: feedbackMap.get(p.uuid)?.avg ?? null,
    }))
    .sort((a, b) => {
      // Sort by confidence * similarity for relevance
      const scoreA = a.confidence * a.similarity;
      const scoreB = b.confidence * b.similarity;
      return scoreB - scoreA;
    })
    .slice(0, maxResults);

  return filtered;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Inject proactive warnings before a tool call.
 * Use when an agent is about to invoke a tool with known pitfalls.
 */
export async function injectProactiveWarning(
  toolName: string,
  toolInput?: string
): Promise<MemoryResult<InjectedPattern[]>> {
  try {
    const query = `pitfall warning when using ${toolName}${toolInput ? `: ${toolInput.slice(0, 200)}` : ''}`;
    const embedding = await generateEmbedding(query);
    const patterns = await findRelevantPatterns(embedding, 'proactive_warning');

    return { success: true, data: patterns };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Proactive injection failed',
    };
  }
}

/**
 * Inject post-error suggestions after an error occurs.
 * Use when a tool call or workflow step fails.
 */
export async function injectPostErrorSuggestion(
  errorMessage: string,
  toolName?: string
): Promise<MemoryResult<InjectedPattern[]>> {
  try {
    const query = `error solution: ${errorMessage.slice(0, 300)}${toolName ? ` (tool: ${toolName})` : ''}`;
    const embedding = await generateEmbedding(query);
    const patterns = await findRelevantPatterns(embedding, 'post_error');

    return { success: true, data: patterns };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Post-error injection failed',
    };
  }
}

/**
 * Inject contextual patterns during a search or conversation.
 * Use when enriching search results or providing background context.
 */
export async function injectContextual(
  query: string,
  maxResults?: number
): Promise<MemoryResult<InjectedPattern[]>> {
  try {
    const embedding = await generateEmbedding(query);
    const patterns = await findRelevantPatterns(embedding, 'contextual', maxResults);

    return { success: true, data: patterns };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Contextual injection failed',
    };
  }
}

// ============================================================================
// Feedback
// ============================================================================

/**
 * Submit feedback on a collective pattern.
 */
export async function submitFeedback(
  patternUuid: string,
  profileUuid: string,
  rating: number,
  feedbackType: string,
  comment?: string
): Promise<MemoryResult> {
  try {
    if (rating < 1 || rating > 5) {
      return { success: false, error: 'Rating must be between 1 and 5' };
    }

    await db
      .insert(collectiveFeedbackTable)
      .values({
        pattern_uuid: patternUuid,
        profile_uuid: profileUuid,
        rating,
        feedback_type: feedbackType,
        comment: comment?.slice(0, 1000),
      })
      .onConflictDoUpdate({
        target: [collectiveFeedbackTable.pattern_uuid, collectiveFeedbackTable.profile_uuid],
        set: {
          rating,
          feedback_type: feedbackType,
          comment: comment?.slice(0, 1000),
          created_at: new Date(),
        },
      });

    // Update pattern confidence based on feedback
    const [feedback] = await db
      .select({
        avgRating: sql<number>`AVG(${collectiveFeedbackTable.rating})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(collectiveFeedbackTable)
      .where(eq(collectiveFeedbackTable.pattern_uuid, patternUuid));

    if (feedback && Number(feedback.count) >= CBP_NEGATIVE_FEEDBACK_THRESHOLD) {
      const avgRating = Number(feedback.avgRating);
      // Map 1-5 rating to confidence adjustment: neutral = no change, below = decrease, above = increase
      const NEUTRAL_RATING = 3.0;
      const ADJUSTMENT_FACTOR = 0.05;
      const confidenceAdjustment = (avgRating - NEUTRAL_RATING) * ADJUSTMENT_FACTOR;

      await db
        .update(gutPatternsTable)
        .set({
          confidence: sql`GREATEST(0.0, LEAST(1.0, ${gutPatternsTable.confidence} + ${confidenceAdjustment}))`,
          updated_at: new Date(),
        })
        .where(eq(gutPatternsTable.uuid, patternUuid));
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit feedback',
    };
  }
}
