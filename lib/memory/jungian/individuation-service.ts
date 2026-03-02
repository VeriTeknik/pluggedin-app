/**
 * Individuation Service — Per-Profile Maturity Scoring
 *
 * 4-component score (0-100): Memory Depth, Learning Velocity,
 * Collective Contribution, Self-Awareness.
 * Pure SQL calculation, in-memory cached.
 *
 * 5 maturity levels: nascent → developing → established → mature → individuated
 */

import { and, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  collectiveContributionsTable,
  collectiveFeedbackTable,
  dreamConsolidationsTable,
  individuationSnapshotsTable,
  memoryRingTable,
} from '@/db/schema';
import { hashProfileUuid } from '../cbp/hash-utils';

import {
  INDIVIDUATION_CACHE_TTL_MINUTES,
  INDIVIDUATION_ENABLED,
  INDIVIDUATION_HISTORY_DAYS,
} from './constants';
import type { MemoryResult } from '../types';
import type {
  IndividuationResponse,
  IndividuationScore,
  IndividuationSnapshot,
  MaturityLevel,
} from './types';

// ============================================================================
// In-Memory Cache (Bounded LRU)
// ============================================================================

// Maximum number of profiles to cache. Map iteration order is insertion order,
// so we delete the oldest entry when the limit is reached (simple LRU).
// NOTE: In serverless environments (e.g. Vercel), this module-level Map won't
// survive across function invocations, so effective cache hit rate may be low.
// This is acceptable — the cache is a performance optimization, not a correctness
// requirement. The DB queries will simply run on every cold invocation.
const SCORE_CACHE_MAX_SIZE = 500;

interface CacheEntry {
  score: IndividuationScore;
  trend: 'accelerating' | 'stable' | 'decelerating';
  cachedAt: number;
}

const scoreCache = new Map<string, CacheEntry>();

function getCachedEntry(profileUuid: string): CacheEntry | null {
  const entry = scoreCache.get(profileUuid);
  if (!entry) return null;
  const ageMs = Date.now() - entry.cachedAt;
  if (ageMs > INDIVIDUATION_CACHE_TTL_MINUTES * 60 * 1000) {
    scoreCache.delete(profileUuid);
    return null;
  }
  // Move to end (most recently used) by re-inserting
  scoreCache.delete(profileUuid);
  scoreCache.set(profileUuid, entry);
  return entry;
}

function setCachedEntry(
  profileUuid: string,
  score: IndividuationScore,
  trend: 'accelerating' | 'stable' | 'decelerating'
): void {
  // Evict oldest entry if at capacity
  if (scoreCache.size >= SCORE_CACHE_MAX_SIZE && !scoreCache.has(profileUuid)) {
    const oldest = scoreCache.keys().next().value;
    if (oldest) scoreCache.delete(oldest);
  }
  scoreCache.set(profileUuid, { score, trend, cachedAt: Date.now() });
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get individuation score for a profile (cached).
 */
export async function getIndividuationScore(
  profileUuid: string
): Promise<MemoryResult<IndividuationResponse>> {
  if (!INDIVIDUATION_ENABLED) {
    return {
      success: true,
      data: {
        total: 0,
        level: 'nascent',
        weeklyTrend: 'stable',
        tip: 'Individuation metrics are disabled.',
        components: {
          memoryDepth: 0,
          learningVelocity: 0,
          collectiveContribution: 0,
          selfAwareness: 0,
        },
      },
    };
  }

  try {
    // Check cache (includes both score and trend)
    const cached = getCachedEntry(profileUuid);
    let score: IndividuationScore;
    let trend: 'accelerating' | 'stable' | 'decelerating';

    if (cached) {
      score = cached.score;
      trend = cached.trend;
    } else {
      [score, trend] = await Promise.all([
        calculateScore(profileUuid),
        calculateTrend(profileUuid),
      ]);
      setCachedEntry(profileUuid, score, trend);
    }

    // Generate contextual tip
    const tip = generateTip(score);

    return {
      success: true,
      data: {
        total: score.total,
        level: score.maturityLevel,
        weeklyTrend: trend,
        tip,
        components: {
          memoryDepth: score.memoryDepth,
          learningVelocity: score.learningVelocity,
          collectiveContribution: score.collectiveContribution,
          selfAwareness: score.selfAwareness,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to calculate individuation score',
    };
  }
}

/**
 * Get individuation score history (for trend charts).
 */
export async function getIndividuationHistory(
  profileUuid: string,
  days: number = 30
): Promise<MemoryResult<IndividuationSnapshot[]>> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const snapshots = await db
      .select()
      .from(individuationSnapshotsTable)
      .where(
        and(
          eq(individuationSnapshotsTable.profile_uuid, profileUuid),
          gte(individuationSnapshotsTable.snapshot_date, cutoff.toISOString().split('T')[0])
        )
      )
      .orderBy(individuationSnapshotsTable.snapshot_date);

    return {
      success: true,
      data: snapshots.map((s) => ({
        total: s.total_score,
        memoryDepth: s.memory_depth ?? 0,
        learningVelocity: s.learning_velocity ?? 0,
        collectiveContribution: s.collective_contribution ?? 0,
        selfAwareness: s.self_awareness ?? 0,
        maturityLevel: (s.maturity_level ?? 'nascent') as MaturityLevel,
        profileUuid: s.profile_uuid,
        snapshotDate: String(s.snapshot_date),
      })),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to get individuation history',
    };
  }
}

/**
 * Save daily snapshot. Called during session start.
 */
export async function saveIndividuationSnapshot(
  profileUuid: string
): Promise<void> {
  if (!INDIVIDUATION_ENABLED) return;

  try {
    const [score, trend] = await Promise.all([
      calculateScore(profileUuid),
      calculateTrend(profileUuid),
    ]);
    setCachedEntry(profileUuid, score, trend);

    await db
      .insert(individuationSnapshotsTable)
      .values({
        profile_uuid: profileUuid,
        total_score: score.total,
        memory_depth: score.memoryDepth,
        learning_velocity: score.learningVelocity,
        collective_contribution: score.collectiveContribution,
        self_awareness: score.selfAwareness,
        maturity_level: score.maturityLevel,
      })
      .onConflictDoUpdate({
        target: [
          individuationSnapshotsTable.profile_uuid,
          individuationSnapshotsTable.snapshot_date,
        ],
        set: {
          total_score: score.total,
          memory_depth: score.memoryDepth,
          learning_velocity: score.learningVelocity,
          collective_contribution: score.collectiveContribution,
          self_awareness: score.selfAwareness,
          maturity_level: score.maturityLevel,
        },
      });
  } catch (error) {
    // Non-fatal: snapshot failure shouldn't break session start
    console.warn('Failed to save individuation snapshot:', error);
  }
}

// ============================================================================
// Score Calculation (Pure SQL)
// ============================================================================

async function calculateScore(
  profileUuid: string
): Promise<IndividuationScore> {
  const windowDate = new Date();
  windowDate.setDate(windowDate.getDate() - INDIVIDUATION_HISTORY_DAYS);

  const [memoryDepth, learningVelocity, collectiveContribution, selfAwareness] =
    await Promise.all([
      calcMemoryDepth(profileUuid, windowDate),
      calcLearningVelocity(profileUuid, windowDate),
      calcCollectiveContribution(profileUuid, windowDate),
      calcSelfAwareness(profileUuid, windowDate),
    ]);

  const total = memoryDepth + learningVelocity + collectiveContribution + selfAwareness;
  const maturityLevel = getMaturityLevel(total);

  return {
    total,
    memoryDepth,
    learningVelocity,
    collectiveContribution,
    selfAwareness,
    maturityLevel,
  };
}

/** Memory Depth (0-25): Ring diversity + decay survival + shock recovery */
async function calcMemoryDepth(
  profileUuid: string,
  windowDate: Date
): Promise<number> {
  const [ringStats] = await db
    .select({
      ringTypes: sql<number>`COUNT(DISTINCT ${memoryRingTable.ring_type})`,
      survivedCompressed: sql<number>`COUNT(*) FILTER (WHERE ${memoryRingTable.current_decay_stage} IN ('summary', 'essence'))`,
      totalActive: sql<number>`COUNT(*) FILTER (WHERE ${memoryRingTable.current_decay_stage} != 'forgotten')`,
      shocksRecovered: sql<number>`COUNT(*) FILTER (WHERE ${memoryRingTable.is_shock} = true AND ${memoryRingTable.success_score} > 0.5)`,
      totalShocks: sql<number>`COUNT(*) FILTER (WHERE ${memoryRingTable.is_shock} = true)`,
    })
    .from(memoryRingTable)
    .where(
      and(
        eq(memoryRingTable.profile_uuid, profileUuid),
        gte(memoryRingTable.created_at, windowDate)
      )
    );

  // Ring diversity: 0-10 (4 ring types max = 10 points)
  const ringDiversity = Math.min(10, (ringStats?.ringTypes ?? 0) * 2.5);

  // Decay survival: 0-10 (ratio of memories past compressed stage)
  const totalActive = ringStats?.totalActive ?? 0;
  const survived = ringStats?.survivedCompressed ?? 0;
  const survivalRate = totalActive > 0 ? survived / totalActive : 0;
  const decaySurvival = Math.min(10, Math.round(survivalRate * 20));

  // Shock recovery: 0-5
  const totalShocks = ringStats?.totalShocks ?? 0;
  const shocksRecovered = ringStats?.shocksRecovered ?? 0;
  const shockRecovery = totalShocks > 0
    ? Math.min(5, Math.round((shocksRecovered / totalShocks) * 5))
    : 2; // Neutral if no shocks

  return Math.min(25, ringDiversity + decaySurvival + shockRecovery);
}

/** Learning Velocity (0-25): Weekly rate + relevance quality + reinforcement */
async function calcLearningVelocity(
  profileUuid: string,
  windowDate: Date
): Promise<number> {
  // Use memoryRingTable (long-term) instead of freshMemoryTable (7-day TTL)
  // so the 90-day window actually captures the full history.
  const [stats] = await db
    .select({
      totalCount: sql<number>`COUNT(*)`,
      weeklyRate: sql<number>`COUNT(*) / GREATEST(1, EXTRACT(EPOCH FROM (NOW() - ${windowDate})) / 604800)`,
      avgRelevance: sql<number>`AVG(${memoryRingTable.relevance_score})`,
      reinforcedCount: sql<number>`SUM(COALESCE(${memoryRingTable.reinforcement_count}, 0))`,
    })
    .from(memoryRingTable)
    .where(
      and(
        eq(memoryRingTable.profile_uuid, profileUuid),
        gte(memoryRingTable.created_at, windowDate)
      )
    );

  // Weekly memory rate: 0-10 (10+ memories/week = max)
  const weeklyRate = Math.min(10, Math.round(stats?.weeklyRate ?? 0));

  // Relevance quality: 0-10 (avg relevance score of ring memories)
  const avgRelevance = stats?.avgRelevance ?? 0;
  const relevanceScore = Math.min(10, Math.round(avgRelevance * 10));

  // Reinforcement: 0-5 (based on ratio of total reinforcements to memories)
  const total = stats?.totalCount ?? 0;
  const reinforced = stats?.reinforcedCount ?? 0;
  const reinforcementRate = total > 0 ? reinforced / total : 0;
  const reinforcementScore = Math.min(5, Math.round(Math.min(1, reinforcementRate) * 5));

  return Math.min(25, weeklyRate + relevanceScore + reinforcementScore);
}

/**
 * Collective Contribution (0-25): CBP promoted + pattern diversity + feedback.
 *
 * Note: collectiveContributionsTable is keyed by profile_hash (anonymized SHA-256)
 * for k-anonymity in shared patterns, while collectiveFeedbackTable uses profile_uuid
 * directly since feedback is a private, profile-scoped action. We derive the hash
 * from the UUID to query both sides.
 */
async function calcCollectiveContribution(
  profileUuid: string,
  windowDate: Date
): Promise<number> {
  const profileHash = hashProfileUuid(profileUuid);

  const [contribStats] = await db
    .select({
      promotedCount: sql<number>`COUNT(*)`,
      patternDiversity: sql<number>`COUNT(DISTINCT ${collectiveContributionsTable.ring_type})`,
    })
    .from(collectiveContributionsTable)
    .where(
      and(
        eq(collectiveContributionsTable.profile_hash, profileHash),
        gte(collectiveContributionsTable.created_at, windowDate)
      )
    );

  const [feedbackStats] = await db
    .select({
      feedbackCount: sql<number>`COUNT(*)`,
    })
    .from(collectiveFeedbackTable)
    .where(
      and(
        eq(collectiveFeedbackTable.profile_uuid, profileUuid),
        gte(collectiveFeedbackTable.created_at, windowDate)
      )
    );

  // CBP promoted: 0-10 (10+ promotions = max)
  const promoted = Math.min(10, contribStats?.promotedCount ?? 0);

  // Pattern diversity: 0-10 (diverse ring types contributing)
  const diversity = Math.min(10, (contribStats?.patternDiversity ?? 0) * 2.5);

  // Feedback given: 0-5 (5+ feedbacks = max)
  const feedback = Math.min(5, feedbackStats?.feedbackCount ?? 0);

  return Math.min(25, promoted + diversity + feedback);
}

/** Self-Awareness (0-25): Search usage + decay acceptance + dream consolidation */
async function calcSelfAwareness(
  profileUuid: string,
  windowDate: Date
): Promise<number> {
  const [searchStats] = await db
    .select({
      avgAccessCount: sql<number>`AVG(${memoryRingTable.access_count})`,
      totalAccess: sql<number>`SUM(${memoryRingTable.access_count})`,
    })
    .from(memoryRingTable)
    .where(
      and(
        eq(memoryRingTable.profile_uuid, profileUuid),
        gte(memoryRingTable.created_at, windowDate)
      )
    );

  const [dreamStats] = await db
    .select({
      dreamCount: sql<number>`COUNT(*)`,
    })
    .from(dreamConsolidationsTable)
    .where(
      and(
        eq(dreamConsolidationsTable.profile_uuid, profileUuid),
        gte(dreamConsolidationsTable.created_at, windowDate)
      )
    );

  // Memory search usage: 0-10 (based on total access count)
  const totalAccess = searchStats?.totalAccess ?? 0;
  const searchScore = Math.min(10, Math.round(Math.log2(1 + totalAccess)));

  // Access engagement: 0-10 (higher avg access count = more active memory retrieval)
  const avgAccess = searchStats?.avgAccessCount ?? 0;
  const accessEngagement = Math.min(10, Math.round(avgAccess));

  // Dream consolidation: 0-5 (active consolidation = self-awareness)
  const dreamScore = Math.min(5, dreamStats?.dreamCount ?? 0);

  return Math.min(25, searchScore + accessEngagement + dreamScore);
}

// ============================================================================
// Helpers
// ============================================================================

/** Exported for unit testing. */
export function getMaturityLevel(total: number): MaturityLevel {
  if (total >= 81) return 'individuated';
  if (total >= 61) return 'mature';
  if (total >= 41) return 'established';
  if (total >= 21) return 'developing';
  return 'nascent';
}

/** Exported for unit testing. */
export function generateTip(score: IndividuationScore): string {
  // Find weakest component
  const components = [
    { name: 'Memory Depth', score: score.memoryDepth, max: 25 },
    { name: 'Learning Velocity', score: score.learningVelocity, max: 25 },
    { name: 'Collective Contribution', score: score.collectiveContribution, max: 25 },
    { name: 'Self-Awareness', score: score.selfAwareness, max: 25 },
  ];

  const weakest = components.sort((a, b) => a.score / a.max - b.score / b.max)[0];

  switch (weakest.name) {
    case 'Memory Depth':
      return 'Try using different tool types to build diverse memory across all rings.';
    case 'Learning Velocity':
      return 'Record more observations during sessions to accelerate learning.';
    case 'Collective Contribution':
      return 'Rate collective patterns and your successful workflows will help others.';
    case 'Self-Awareness':
      return 'Search your memories more often — self-reflection strengthens understanding.';
    default:
      return 'Keep learning — every interaction builds your collective intelligence.';
  }
}

async function calculateTrend(
  profileUuid: string
): Promise<'accelerating' | 'stable' | 'decelerating'> {
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const snapshots = await db
    .select({
      total_score: individuationSnapshotsTable.total_score,
      snapshot_date: individuationSnapshotsTable.snapshot_date,
    })
    .from(individuationSnapshotsTable)
    .where(
      and(
        eq(individuationSnapshotsTable.profile_uuid, profileUuid),
        gte(
          individuationSnapshotsTable.snapshot_date,
          twoWeeksAgo.toISOString().split('T')[0]
        )
      )
    )
    .orderBy(individuationSnapshotsTable.snapshot_date);

  if (snapshots.length < 2) return 'stable';

  const recentSnapshots = snapshots.filter(
    (s) => new Date(String(s.snapshot_date)) >= oneWeekAgo
  );
  const olderSnapshots = snapshots.filter(
    (s) => new Date(String(s.snapshot_date)) < oneWeekAgo
  );

  const recentAvg =
    recentSnapshots.reduce((sum, s) => sum + s.total_score, 0) /
    Math.max(1, recentSnapshots.length);

  const olderAvg =
    olderSnapshots.reduce((sum, s) => sum + s.total_score, 0) /
    Math.max(1, olderSnapshots.length);

  const diff = recentAvg - olderAvg;
  if (diff > 3) return 'accelerating';
  if (diff < -3) return 'decelerating';
  return 'stable';
}
