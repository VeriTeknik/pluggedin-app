/**
 * Synchronicity Detector
 *
 * Discovers temporal co-occurrence patterns across anonymized profiles.
 * Pure SQL analysis — no LLM calls.
 * Three analysis types: co-occurrence, failure correlation, emergent workflows.
 *
 * Output: patterns stored in gut_patterns with pattern_type='synchronicity'.
 */

import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { gutPatternsTable } from '@/db/schema';
import { hashPattern } from '../cbp/hash-utils';
import { CBP_INITIAL_CONFIDENCE, GUT_K_ANONYMITY_THRESHOLD } from '../constants';
import { generateEmbedding } from '../embedding-service';
import { upsertGutPatternVector } from '../vector-service';

import {
  SYNC_ACTIVE_TOOLS_LIMIT,
  SYNC_COOCCURRENCE_GAP_MINUTES,
  SYNC_COOCCURRENCE_WINDOW_DAYS,
  SYNC_DETECTION_ADVISORY_LOCK_KEY,
  SYNC_FAILURE_WINDOW_DAYS,
  SYNC_MIN_EVENTS_THRESHOLD,
  SYNC_TABLESAMPLE_PERCENT,
  SYNC_TABLESAMPLE_TRIGGER_ROWS,
  SYNC_WORKFLOW_GAP_MINUTES,
  SYNC_WORKFLOW_WINDOW_DAYS,
} from './constants';
import { getTemporalEventCount } from './temporal-event-service';
import type { MemoryResult } from '../types';
import type { SynchronicityDetectionResult, SynchronicityPattern } from './types';

/**
 * Run full synchronicity detection.
 * Should be called from cron with advisory lock protection.
 */
export async function detectSynchronicities(): Promise<
  MemoryResult<SynchronicityDetectionResult>
> {
  try {
    // Advisory lock to prevent concurrent runs
    const lockQueryResult = await db.execute(
      sql`SELECT pg_try_advisory_lock(${SYNC_DETECTION_ADVISORY_LOCK_KEY}) as acquired`
    );
    const lockResult = lockQueryResult.rows[0] as { acquired: boolean } | undefined;
    if (!lockResult?.acquired) {
      return { success: false, error: 'Synchronicity detection already running' };
    }

    try {
      const rowCount = await getTemporalEventCount();
      const useSampling = rowCount > SYNC_TABLESAMPLE_TRIGGER_ROWS;

      const [coOccurrences, failureCorrelations, emergentWorkflows] =
        await Promise.all([
          detectCoOccurrences(useSampling),
          detectFailureCorrelations(useSampling),
          detectEmergentWorkflows(useSampling),
        ]);

      // Store discovered patterns in gut_patterns
      const allPatterns = [
        ...coOccurrences.map((p) => ({
          ...p,
          analysisType: 'co_occurrence' as const,
        })),
        ...failureCorrelations.map((p) => ({
          ...p,
          analysisType: 'failure_correlation' as const,
        })),
        ...emergentWorkflows.map((p) => ({
          ...p,
          analysisType: 'emergent_workflow' as const,
        })),
      ];

      let patternsCreated = 0;
      for (const pattern of allPatterns) {
        const created = await storeAsGutPattern(pattern);
        if (created) patternsCreated++;
      }

      return {
        success: true,
        data: {
          coOccurrences,
          failureCorrelations,
          emergentWorkflows,
          patternsCreated,
        },
      };
    } finally {
      await db.execute(
        sql`SELECT pg_advisory_unlock(${SYNC_DETECTION_ADVISORY_LOCK_KEY})`
      );
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to detect synchronicities',
    };
  }
}

// ============================================================================
// Analysis Type 1: Temporal Co-occurrence
// ============================================================================

async function detectCoOccurrences(
  useSampling: boolean
): Promise<SynchronicityPattern[]> {
  const sampleClause = useSampling
    ? sql.raw(`TABLESAMPLE BERNOULLI(${Number(SYNC_TABLESAMPLE_PERCENT)})`)
    : sql``;

  const result = await db.execute(sql`
    WITH active_tools AS (
      SELECT tool_name, COUNT(*) as cnt
      FROM temporal_events ${sampleClause}
      WHERE created_at > NOW() - INTERVAL '1 day' * ${SYNC_COOCCURRENCE_WINDOW_DAYS}
      GROUP BY tool_name
      HAVING COUNT(*) >= ${SYNC_MIN_EVENTS_THRESHOLD}
      ORDER BY cnt DESC
      LIMIT ${SYNC_ACTIVE_TOOLS_LIMIT}
    ),
    sequences AS (
      SELECT
        t.profile_hash,
        t.tool_name,
        LEAD(t.tool_name) OVER (PARTITION BY t.profile_hash ORDER BY t.created_at) as next_tool,
        t.outcome,
        LEAD(t.created_at) OVER (PARTITION BY t.profile_hash ORDER BY t.created_at) - t.created_at as gap
      FROM temporal_events ${sampleClause} t
      WHERE t.created_at > NOW() - INTERVAL '1 day' * ${SYNC_COOCCURRENCE_WINDOW_DAYS}
        AND t.tool_name IN (SELECT tool_name FROM active_tools)
    )
    SELECT tool_name, next_tool, COUNT(DISTINCT profile_hash) as unique_profiles
    FROM sequences
    WHERE gap < INTERVAL '1 minute' * ${SYNC_COOCCURRENCE_GAP_MINUTES}
      AND gap > INTERVAL '0 seconds'
      AND next_tool IS NOT NULL
    GROUP BY tool_name, next_tool
    HAVING COUNT(DISTINCT profile_hash) >= ${GUT_K_ANONYMITY_THRESHOLD}
    ORDER BY unique_profiles DESC
    LIMIT 50
  `);

  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    analysisType: 'co_occurrence' as const,
    toolName: String(row.tool_name),
    relatedTool: String(row.next_tool),
    uniqueProfiles: Number(row.unique_profiles),
  }));
}

// ============================================================================
// Analysis Type 2: Failure Correlation
// ============================================================================

async function detectFailureCorrelations(
  useSampling: boolean
): Promise<SynchronicityPattern[]> {
  const sampleClause = useSampling
    ? sql.raw(`TABLESAMPLE BERNOULLI(${Number(SYNC_TABLESAMPLE_PERCENT)})`)
    : sql``;

  const result = await db.execute(sql`
    WITH active_tools AS (
      SELECT tool_name FROM temporal_events ${sampleClause}
      WHERE created_at > NOW() - INTERVAL '1 day' * ${SYNC_FAILURE_WINDOW_DAYS}
      GROUP BY tool_name
      HAVING COUNT(*) >= ${SYNC_MIN_EVENTS_THRESHOLD}
      ORDER BY COUNT(*) DESC
      LIMIT ${SYNC_ACTIVE_TOOLS_LIMIT}
    )
    SELECT
      t.tool_name,
      EXTRACT(DOW FROM t.created_at) as day_of_week,
      EXTRACT(HOUR FROM t.created_at) as hour_of_day,
      COUNT(*) FILTER (WHERE t.outcome = 'failure') as failures,
      COUNT(*) as total,
      ROUND(COUNT(*) FILTER (WHERE t.outcome = 'failure')::numeric / NULLIF(COUNT(*), 0), 2) as failure_rate,
      COUNT(DISTINCT t.profile_hash) as unique_profiles
    FROM temporal_events ${sampleClause} t
    WHERE t.created_at > NOW() - INTERVAL '1 day' * ${SYNC_FAILURE_WINDOW_DAYS}
      AND t.tool_name IN (SELECT tool_name FROM active_tools)
    GROUP BY t.tool_name, day_of_week, hour_of_day
    HAVING COUNT(DISTINCT t.profile_hash) >= ${GUT_K_ANONYMITY_THRESHOLD}
      AND COUNT(*) >= ${SYNC_MIN_EVENTS_THRESHOLD}
      AND COUNT(*) FILTER (WHERE t.outcome = 'failure')::numeric / NULLIF(COUNT(*), 0) > 0.5
    LIMIT 50
  `);

  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    analysisType: 'failure_correlation' as const,
    toolName: String(row.tool_name),
    dayOfWeek: Number(row.day_of_week),
    hourOfDay: Number(row.hour_of_day),
    failureRate: Number(row.failure_rate),
    total: Number(row.total),
    uniqueProfiles: Number(row.unique_profiles),
  }));
}

// ============================================================================
// Analysis Type 3: Emergent Workflows
// ============================================================================

async function detectEmergentWorkflows(
  useSampling: boolean
): Promise<SynchronicityPattern[]> {
  const sampleClause = useSampling
    ? sql.raw(`TABLESAMPLE BERNOULLI(${Number(SYNC_TABLESAMPLE_PERCENT)})`)
    : sql``;

  const result = await db.execute(sql`
    WITH active_tools AS (
      SELECT tool_name FROM temporal_events ${sampleClause}
      WHERE event_type = 'tool_call'
        AND created_at > NOW() - INTERVAL '1 day' * ${SYNC_WORKFLOW_WINDOW_DAYS}
      GROUP BY tool_name
      HAVING COUNT(*) >= ${SYNC_MIN_EVENTS_THRESHOLD}
      ORDER BY COUNT(*) DESC
      LIMIT ${SYNC_ACTIVE_TOOLS_LIMIT}
    ),
    ordered AS (
      SELECT
        t.profile_hash,
        t.tool_name,
        LEAD(t.tool_name, 1) OVER w as tool_2,
        LEAD(t.tool_name, 2) OVER w as tool_3,
        LEAD(t.created_at, 2) OVER w - t.created_at as total_gap
      FROM temporal_events ${sampleClause} t
      WHERE t.event_type = 'tool_call'
        AND t.created_at > NOW() - INTERVAL '1 day' * ${SYNC_WORKFLOW_WINDOW_DAYS}
        AND t.tool_name IN (SELECT tool_name FROM active_tools)
      WINDOW w AS (PARTITION BY t.profile_hash ORDER BY t.created_at)
    )
    SELECT tool_name, tool_2, tool_3, COUNT(DISTINCT profile_hash) as unique_profiles
    FROM ordered
    WHERE tool_2 IS NOT NULL AND tool_3 IS NOT NULL
      AND tool_name != tool_2 AND tool_2 != tool_3
      AND total_gap < INTERVAL '1 minute' * ${SYNC_WORKFLOW_GAP_MINUTES}
    GROUP BY tool_name, tool_2, tool_3
    HAVING COUNT(DISTINCT profile_hash) >= ${GUT_K_ANONYMITY_THRESHOLD}
    ORDER BY unique_profiles DESC
    LIMIT 50
  `);

  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    analysisType: 'emergent_workflow' as const,
    toolName: String(row.tool_name),
    relatedTool: String(row.tool_2),
    thirdTool: String(row.tool_3),
    uniqueProfiles: Number(row.unique_profiles),
  }));
}

// ============================================================================
// Pattern Storage
// ============================================================================

async function storeAsGutPattern(
  pattern: SynchronicityPattern & { analysisType: string }
): Promise<boolean> {
  try {
    const description = formatPatternDescription(pattern);
    const hash = hashPattern(description);

    // Check if already exists
    const existing = await db
      .select({ uuid: gutPatternsTable.uuid })
      .from(gutPatternsTable)
      .where(sql`${gutPatternsTable.pattern_hash} = ${hash}`)
      .limit(1);

    if (existing.length > 0) {
      // Reinforce existing pattern
      await db
        .update(gutPatternsTable)
        .set({
          occurrence_count: sql`${gutPatternsTable.occurrence_count} + 1`,
          unique_profile_count: pattern.uniqueProfiles,
          updated_at: new Date(),
        })
        .where(sql`${gutPatternsTable.uuid} = ${existing[0].uuid}`);
      return false;
    }

    // Generate embedding for the pattern description
    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(description);
    } catch {
      console.warn('Failed to generate embedding for synchronicity pattern');
    }

    const [newPattern] = await db
      .insert(gutPatternsTable)
      .values({
        pattern_hash: hash,
        pattern_type: 'synchronicity',
        pattern_description: description,
        compressed_pattern: description,
        occurrence_count: 1,
        success_rate: pattern.failureRate != null ? 1 - pattern.failureRate : null,
        unique_profile_count: pattern.uniqueProfiles,
        confidence: CBP_INITIAL_CONFIDENCE,
        metadata: {
          source: 'synchronicity',
          analysis_type: pattern.analysisType,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
        } as typeof gutPatternsTable.$inferInsert.metadata,
      })
      .returning({ uuid: gutPatternsTable.uuid });

    if (embedding && newPattern) {
      try {
        await upsertGutPatternVector(newPattern.uuid, embedding, 'synchronicity');
      } catch (error) {
        // Rollback on vector failure
        console.error('Vector storage failed for synchronicity pattern:', error);
        await db
          .delete(gutPatternsTable)
          .where(sql`${gutPatternsTable.uuid} = ${newPattern.uuid}`);
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

function formatPatternDescription(
  pattern: SynchronicityPattern & { analysisType: string }
): string {
  switch (pattern.analysisType) {
    case 'co_occurrence':
      return `After using ${pattern.toolName}, users frequently use ${pattern.relatedTool} (${pattern.uniqueProfiles} profiles)`;
    case 'failure_correlation':
      return `${pattern.toolName} has ${Math.round((pattern.failureRate ?? 0) * 100)}% failure rate on day ${pattern.dayOfWeek ?? 0} hour ${pattern.hourOfDay ?? 0} (${pattern.uniqueProfiles} profiles, ${pattern.total ?? 0} events)`;
    case 'emergent_workflow':
      return `Common workflow: ${pattern.toolName} → ${pattern.relatedTool} → ${pattern.thirdTool} (${pattern.uniqueProfiles} profiles)`;
    default:
      return `Synchronicity pattern: ${pattern.toolName} (${pattern.uniqueProfiles} profiles)`;
  }
}
