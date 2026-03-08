'use server';

import { and, count, desc, eq, sql } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { db } from '@/db';
import {
  freshMemoryTable,
  gutPatternsTable,
  memoryRingTable,
  memorySessionsTable,
  projectsTable,
} from '@/db/schema';
import { authOptions } from '@/lib/auth';
import { classifyBatch } from '@/lib/memory/analytics-agent';
import { injectContextual,submitFeedback } from '@/lib/memory/cbp/injection-engine';
import { getPromotionStats } from '@/lib/memory/cbp/promotion-service';
import { processDecay } from '@/lib/memory/decay-engine';
import { queryIntuition } from '@/lib/memory/gut-agent';
import {
  getIndividuationHistory,
  getIndividuationScore,
  injectWithArchetype,
} from '@/lib/memory/jungian';
import {
  addObservation as addObservationService,
  getSessionObservations as getSessionObservationsService,
} from '@/lib/memory/observation-service';
import {
  getMemoryDetails as getMemoryDetailsService,
  getMemoryTimeline as getMemoryTimelineService,
  searchMemories as searchMemoriesService,
} from '@/lib/memory/retrieval-service';
import {
  endSession as endSessionService,
  getSessionHistory,
  startSession as startSessionService,
} from '@/lib/memory/session-service';
import type {
  DecayStage,
  MemoryResult,
  MemoryStats,
  RingType,
} from '@/lib/memory/types';
import {
  FEEDBACK_TYPE_VALUES,
} from '@/lib/memory/types';
import { deleteMemoryRingVector } from '@/lib/memory/vector-service';
import { generateZReport, getZReports as getZReportsService } from '@/lib/memory/z-report-service';

import { getProjectActiveProfile } from './profiles';

// ============================================================================
// Shared Helpers
// ============================================================================

function formatError<T = unknown>(error: unknown): MemoryResult<T> {
  if (error instanceof z.ZodError) {
    return { success: false, error: error.errors[0].message };
  }
  return {
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error',
  };
}

/**
 * Resolve the authenticated user's ID from the server session.
 * Throws if not authenticated — callers catch via formatError.
 */
async function requireAuthUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error('Authentication required');
  }
  return session.user.id;
}

/**
 * Higher-order helper to DRY up profile-scoped server actions.
 * Handles: authenticate → validate input → resolve profile → execute handler → catch errors.
 */
function createProfileAction<I, O = unknown>(
  schema: z.ZodSchema<I>,
  handler: (parsed: I, profileUuid: string) => Promise<MemoryResult<O>>
): (input?: unknown) => Promise<MemoryResult<O>> {
  return async (input?: unknown): Promise<MemoryResult<O>> => {
    try {
      const userId = await requireAuthUserId();
      const parsed = schema.parse(input);
      const profileUuid = await getActiveProfileUuid(userId);
      if (!profileUuid) {
        return { success: false, error: 'No active profile found' };
      }
      return handler(parsed, profileUuid);
    } catch (error) {
      return formatError(error);
    }
  };
}

// ============================================================================
// Validation Schemas
// ============================================================================

const startSessionSchema = z.object({
  contentSessionId: z.string().min(1, 'Content session ID is required'),
  agentUuid: z.string().uuid().optional(),
});

const endSessionSchema = z.object({
  memorySessionId: z.string().min(1, 'Memory session ID is required'),
});

const getSessionsSchema = z.object({
  agentUuid: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  status: z.enum(['active', 'completed', 'abandoned']).optional(),
}).optional();

const addObservationSchema = z.object({
  sessionUuid: z.string().uuid('Invalid session UUID'),
  agentUuid: z.string().uuid().optional(),
  type: z.enum([
    'tool_call', 'tool_result', 'user_preference', 'error_pattern',
    'decision', 'success_pattern', 'failure_pattern', 'workflow_step',
    'insight', 'context_switch',
  ]),
  content: z.string().min(1, 'Content is required').max(50000),
  outcome: z.enum(['success', 'failure', 'neutral']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const getSessionObservationsSchema = z.object({
  sessionUuid: z.string().uuid('Invalid session UUID'),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

const searchMemoriesSchema = z.object({
  query: z.string().min(1, 'Query is required').max(2000),
  ringTypes: z.array(z.enum(['procedures', 'practice', 'longterm', 'shocks'])).optional(),
  agentUuid: z.string().uuid().optional(),
  topK: z.number().int().min(1).max(50).optional(),
  includeGut: z.boolean().optional(),
  threshold: z.number().min(0).max(1).optional(),
});

const memoryUuidsSchema = z.object({
  memoryUuids: z.array(z.string().uuid()).min(1).max(50),
});

const getMemoryRingSchema = z.object({
  ringType: z.enum(['procedures', 'practice', 'longterm', 'shocks']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  agentUuid: z.string().uuid().optional(),
}).optional();

const deleteMemorySchema = z.object({
  memoryUuid: z.string().uuid('Invalid memory UUID'),
});

const getZReportsSchema = z.object({
  agentUuid: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).optional();

const queryGutSchema = z.object({
  query: z.string().min(1, 'Query is required').max(2000),
  topK: z.number().int().min(1).max(20).optional(),
});

// ============================================================================
// Helper: Get Profile UUID
// ============================================================================

async function getActiveProfileUuid(userId: string): Promise<string | null> {
  const project = await db
    .select({ uuid: projectsTable.uuid })
    .from(projectsTable)
    .where(eq(projectsTable.user_id, userId))
    .limit(1);

  if (project.length === 0) return null;

  const activeProfile = await getProjectActiveProfile(project[0].uuid);
  return activeProfile?.uuid ?? null;
}

// ============================================================================
// Session Management
// ============================================================================

export async function startMemorySession(
  params: { contentSessionId: string; agentUuid?: string }
): Promise<MemoryResult<{ uuid: string; memorySessionId: string }>> {
  try {
    const userId = await requireAuthUserId();
    const parsed = startSessionSchema.parse(params);

    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    return startSessionService({
      profileUuid,
      agentUuid: parsed.agentUuid,
      contentSessionId: parsed.contentSessionId,
    });
  } catch (error) {
    return formatError(error);
  }
}

export async function endMemorySession(
  memorySessionId: string
): Promise<MemoryResult<{ uuid: string }>> {
  try {
    const userId = await requireAuthUserId();
    const parsed = endSessionSchema.parse({ memorySessionId });

    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    // Atomic ownership check + status update (prevents TOCTOU race)
    const result = await endSessionService(parsed.memorySessionId, profileUuid);

    // Trigger Z-report generation if session ended successfully
    if (result.success && result.data) {
      generateZReport(result.data.uuid).catch(console.error);
    }

    return result;
  } catch (error) {
    return formatError(error);
  }
}

export async function getMemorySessions(
  options?: { agentUuid?: string; limit?: number; offset?: number; status?: 'active' | 'completed' | 'abandoned' }
): Promise<MemoryResult> {
  try {
    const userId = await requireAuthUserId();
    const parsed = getSessionsSchema.parse(options);

    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    const sessions = await getSessionHistory(profileUuid, parsed);
    return { success: true, data: sessions };
  } catch (error) {
    return formatError(error);
  }
}

// ============================================================================
// Observations
// ============================================================================

export async function addObservation(
  params: z.infer<typeof addObservationSchema>
): Promise<MemoryResult<{ uuid: string }>> {
  try {
    const userId = await requireAuthUserId();
    const parsed = addObservationSchema.parse(params);

    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    return addObservationService({
      ...parsed,
      profileUuid,
    });
  } catch (error) {
    return formatError(error);
  }
}

export async function getSessionObservations(
  sessionUuid: string,
  options?: { limit?: number; offset?: number }
): Promise<MemoryResult> {
  try {
    const userId = await requireAuthUserId();
    const parsed = getSessionObservationsSchema.parse({
      sessionUuid,
      ...options,
    });

    // Verify session ownership before returning observations
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    const [sessionCheck] = await db
      .select({ uuid: memorySessionsTable.uuid })
      .from(memorySessionsTable)
      .where(
        and(
          eq(memorySessionsTable.uuid, parsed.sessionUuid),
          eq(memorySessionsTable.profile_uuid, profileUuid)
        )
      )
      .limit(1);

    if (!sessionCheck) {
      return { success: false, error: 'Session not found' };
    }

    const observations = await getSessionObservationsService(
      parsed.sessionUuid,
      { limit: parsed.limit, offset: parsed.offset }
    );
    return { success: true, data: observations };
  } catch (error) {
    return formatError(error);
  }
}

// ============================================================================
// Memory Retrieval (Progressive Disclosure)
// ============================================================================

const _searchMemories = createProfileAction(
  searchMemoriesSchema,
  async (parsed, profileUuid) =>
    searchMemoriesService({
      ...parsed,
      ringTypes: parsed.ringTypes as RingType[] | undefined,
      profileUuid,
    })
);

export async function searchMemories(
  params: z.infer<typeof searchMemoriesSchema>
): Promise<MemoryResult> {
  return _searchMemories(params);
}

const _getMemoryTimeline = createProfileAction(
  memoryUuidsSchema,
  async (parsed, profileUuid) =>
    getMemoryTimelineService(parsed.memoryUuids, profileUuid)
);

export async function getMemoryTimeline(
  memoryUuids: string[]
): Promise<MemoryResult> {
  return _getMemoryTimeline({ memoryUuids });
}

const _getMemoryDetails = createProfileAction(
  memoryUuidsSchema,
  async (parsed, profileUuid) =>
    getMemoryDetailsService(parsed.memoryUuids, profileUuid)
);

export async function getMemoryDetails(
  memoryUuids: string[]
): Promise<MemoryResult> {
  return _getMemoryDetails({ memoryUuids });
}

// ============================================================================
// Memory Ring
// ============================================================================

const _getMemoryRing = createProfileAction(
  getMemoryRingSchema,
  async (parsed, profileUuid) => {
    const conditions = [eq(memoryRingTable.profile_uuid, profileUuid)];

    if (parsed?.ringType) {
      conditions.push(eq(memoryRingTable.ring_type, parsed.ringType));
    }

    if (parsed?.agentUuid) {
      conditions.push(eq(memoryRingTable.agent_uuid, parsed.agentUuid));
    }

    const memories = await db
      .select()
      .from(memoryRingTable)
      .where(and(...conditions))
      .orderBy(desc(memoryRingTable.relevance_score))
      .limit(parsed?.limit ?? 50)
      .offset(parsed?.offset ?? 0);

    return { success: true as const, data: memories };
  }
);

export async function getMemoryRing(
  options?: { ringType?: RingType; limit?: number; offset?: number; agentUuid?: string }
): Promise<MemoryResult> {
  return _getMemoryRing(options);
}

const _deleteMemory = createProfileAction(
  deleteMemorySchema,
  async (parsed, profileUuid) => {
    const deleted = await db
      .delete(memoryRingTable)
      .where(
        and(
          eq(memoryRingTable.uuid, parsed.memoryUuid),
          eq(memoryRingTable.profile_uuid, profileUuid)
        )
      )
      .returning({ uuid: memoryRingTable.uuid });

    // Clean up zvec vector to prevent ghost vectors
    for (const row of deleted) {
      deleteMemoryRingVector(row.uuid);
    }

    return { success: true as const };
  }
);

export async function deleteMemory(
  memoryUuid: string
): Promise<MemoryResult> {
  return _deleteMemory({ memoryUuid });
}

// ============================================================================
// Statistics
// ============================================================================

export async function getMemoryStats(): Promise<MemoryResult<MemoryStats>> {
  try {
    const userId = await requireAuthUserId();
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    // Session counts
    const [sessionStats] = await db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${memorySessionsTable.status} = 'active')`,
      })
      .from(memorySessionsTable)
      .where(eq(memorySessionsTable.profile_uuid, profileUuid));

    // Fresh memory counts
    const [freshStats] = await db
      .select({
        total: sql<number>`count(*)`,
        unclassified: sql<number>`count(*) filter (where ${freshMemoryTable.classified} = false)`,
      })
      .from(freshMemoryTable)
      .where(eq(freshMemoryTable.profile_uuid, profileUuid));

    // Ring counts by type
    const ringCounts = await db
      .select({
        ringType: memoryRingTable.ring_type,
        count: count(),
      })
      .from(memoryRingTable)
      .where(eq(memoryRingTable.profile_uuid, profileUuid))
      .groupBy(memoryRingTable.ring_type);

    // Decay stage counts
    const decayCounts = await db
      .select({
        stage: memoryRingTable.current_decay_stage,
        count: count(),
      })
      .from(memoryRingTable)
      .where(eq(memoryRingTable.profile_uuid, profileUuid))
      .groupBy(memoryRingTable.current_decay_stage);

    // Gut patterns count: intentionally global (collective wisdom).
    // Only patterns meeting k-anonymity threshold are returned to users via the query endpoint.
    // This count reveals no per-profile data.
    const [gutStats] = await db
      .select({ total: count() })
      .from(gutPatternsTable);

    // Build stats object
    const ringCountMap: Record<string, number> = {};
    for (const r of ringCounts) {
      ringCountMap[r.ringType] = r.count;
    }

    const decayCountMap: Record<string, number> = {};
    for (const d of decayCounts) {
      decayCountMap[d.stage] = d.count;
    }

    return {
      success: true,
      data: {
        totalSessions: sessionStats?.total ?? 0,
        activeSessions: sessionStats?.active ?? 0,
        totalFreshMemories: freshStats?.total ?? 0,
        unclassifiedCount: freshStats?.unclassified ?? 0,
        ringCounts: ringCountMap as Record<RingType, number>,
        decayStageCounts: decayCountMap as Record<DecayStage, number>,
        totalGutPatterns: gutStats?.total ?? 0,
      },
    };
  } catch (error) {
    return formatError(error);
  }
}

// ============================================================================
// Z-Reports
// ============================================================================

export async function getZReports(
  options?: { agentUuid?: string; limit?: number }
): Promise<MemoryResult> {
  try {
    const userId = await requireAuthUserId();
    const parsed = getZReportsSchema.parse(options);

    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    const reports = await getZReportsService(profileUuid, parsed);
    return { success: true, data: reports };
  } catch (error) {
    return formatError(error);
  }
}

// ============================================================================
// Background Processing Triggers
// ============================================================================

export async function triggerClassification(): Promise<MemoryResult> {
  try {
    const userId = await requireAuthUserId();
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    return classifyBatch(profileUuid);
  } catch (error) {
    return formatError(error);
  }
}

export async function triggerDecay(): Promise<MemoryResult> {
  try {
    const userId = await requireAuthUserId();
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    return processDecay(profileUuid);
  } catch (error) {
    return formatError(error);
  }
}

export async function triggerGutAggregation(): Promise<MemoryResult> {
  // Gut aggregation is a cross-profile operation that should only
  // be triggered by cron jobs, not by regular users via server actions.
  return { success: false, error: 'Gut aggregation can only be triggered via the cron API endpoint' };
}

export async function queryGutIntuition(
  query: string,
  topK?: number
): Promise<MemoryResult> {
  try {
    const parsed = queryGutSchema.parse({ query, topK });
    return queryIntuition(parsed.query, parsed.topK);
  } catch (error) {
    return formatError(error);
  }
}

// ============================================================================
// Collective Best Practices (CBP)
// ============================================================================


const cbpFeedbackSchema = z.object({
  patternUuid: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  feedbackType: z.enum(FEEDBACK_TYPE_VALUES),
  comment: z.string().max(1000).optional(),
});

const cbpQuerySchema = z.object({
  query: z.string().min(1, 'Query is required').max(2000),
  maxResults: z.number().int().min(1).max(10).optional(),
});

export async function submitCBPFeedback(
  input: unknown
): Promise<MemoryResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: 'Authentication required' };
    }

    const parsed = cbpFeedbackSchema.parse(input);
    const profileUuid = await getActiveProfileUuid(session.user.id);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    return submitFeedback(
      parsed.patternUuid,
      profileUuid,
      parsed.rating,
      parsed.feedbackType,
      parsed.comment
    );
  } catch (error) {
    return formatError(error);
  }
}

export async function queryCBPPatterns(
  query: string,
  maxResults?: number
): Promise<MemoryResult> {
  try {
    // CBP patterns are k-anonymous collective data (no profile scoping needed),
    // but we still require an authenticated session.
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { success: false, error: 'Authentication required' };
    }

    const parsed = cbpQuerySchema.parse({ query, maxResults });
    return injectContextual(parsed.query, parsed.maxResults);
  } catch (error) {
    return formatError(error);
  }
}

export async function getCBPStats(): Promise<MemoryResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { success: false, error: 'Authentication required' };
    }

    return getPromotionStats();
  } catch (error) {
    return formatError(error);
  }
}

// ============================================================================
// Jungian Intelligence Layer (v3.2.0)
// ============================================================================

const ArchetypeInjectInputSchema = z.object({
  query: z.string().max(500).optional(),
  toolName: z.string().max(255).optional(),
  outcome: z.enum(['success', 'failure', 'neutral']).optional(),
  observationType: z.enum([
    'tool_call', 'tool_result', 'user_preference', 'error_pattern',
    'decision', 'success_pattern', 'failure_pattern', 'workflow_step',
    'insight', 'context_switch',
  ]).optional(),
  errorMessage: z.string().max(500).optional(),
  consecutiveFailures: z.number().int().min(0).optional(),
});

// No explicit profileUuid is forwarded here — injectWithArchetype operates on
// cross-profile collective patterns (gut_patterns) that are not profile-scoped.
// The archetype router uses context signals (tool, outcome) to rank patterns,
// not profile identity.
export const injectWithArchetypeAction = createProfileAction(
  ArchetypeInjectInputSchema,
  async (parsed) => {
    return injectWithArchetype({
      query: parsed.query,
      toolName: parsed.toolName,
      outcome: parsed.outcome,
      observationType: parsed.observationType,
      errorMessage: parsed.errorMessage,
      consecutiveFailures: parsed.consecutiveFailures,
    });
  }
);

const IndividuationInputSchema = z.object({});

export const getIndividuationScoreAction = createProfileAction(
  IndividuationInputSchema,
  async (_parsed, profileUuid) => {
    return getIndividuationScore(profileUuid);
  }
);

const IndividuationHistoryInputSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
});

export const getIndividuationHistoryAction = createProfileAction(
  IndividuationHistoryInputSchema,
  async (parsed, profileUuid) => {
    return getIndividuationHistory(profileUuid, parsed.days);
  }
);
