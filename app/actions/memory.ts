'use server';

import { and, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import {
  freshMemoryTable,
  gutPatternsTable,
  memoryRingTable,
  memorySessionsTable,
  projectsTable,
} from '@/db/schema';
import type {
  DecayStage,
  MemoryResult,
  MemoryStats,
  RingType,
} from '@/lib/memory/types';
import {
  startSession as startSessionService,
  endSession as endSessionService,
  getSessionHistory,
} from '@/lib/memory/session-service';
import {
  addObservation as addObservationService,
  getSessionObservations as getSessionObservationsService,
} from '@/lib/memory/observation-service';
import {
  searchMemories as searchMemoriesService,
  getMemoryTimeline as getMemoryTimelineService,
  getMemoryDetails as getMemoryDetailsService,
} from '@/lib/memory/retrieval-service';
import { generateZReport, getZReports as getZReportsService } from '@/lib/memory/z-report-service';
import { classifyBatch } from '@/lib/memory/analytics-agent';
import { processDecay } from '@/lib/memory/decay-engine';
import { aggregatePatterns, queryIntuition } from '@/lib/memory/gut-agent';

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
  userId: string,
  params: { contentSessionId: string; agentUuid?: string }
): Promise<MemoryResult<{ uuid: string; memorySessionId: string }>> {
  try {
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
  userId: string,
  memorySessionId: string
): Promise<MemoryResult<{ uuid: string }>> {
  try {
    const parsed = endSessionSchema.parse({ memorySessionId });

    // Verify session ownership before ending it
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    // Check that the session belongs to the calling user's profile
    const [sessionCheck] = await db
      .select({ uuid: memorySessionsTable.uuid })
      .from(memorySessionsTable)
      .where(
        and(
          eq(memorySessionsTable.memory_session_id, parsed.memorySessionId),
          eq(memorySessionsTable.profile_uuid, profileUuid)
        )
      )
      .limit(1);

    if (!sessionCheck) {
      return { success: false, error: 'Session not found' };
    }

    const result = await endSessionService(parsed.memorySessionId);

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
  userId: string,
  options?: { agentUuid?: string; limit?: number; offset?: number }
): Promise<MemoryResult> {
  try {
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
  userId: string,
  params: z.infer<typeof addObservationSchema>
): Promise<MemoryResult<{ uuid: string }>> {
  try {
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
  userId: string,
  sessionUuid: string,
  options?: { limit?: number; offset?: number }
): Promise<MemoryResult> {
  try {
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

export async function searchMemories(
  userId: string,
  params: z.infer<typeof searchMemoriesSchema>
): Promise<MemoryResult> {
  try {
    const parsed = searchMemoriesSchema.parse(params);

    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    return searchMemoriesService({
      ...parsed,
      ringTypes: parsed.ringTypes as RingType[] | undefined,
      profileUuid,
    });
  } catch (error) {
    return formatError(error);
  }
}

export async function getMemoryTimeline(
  userId: string,
  memoryUuids: string[]
): Promise<MemoryResult> {
  try {
    const parsed = memoryUuidsSchema.parse({ memoryUuids });

    // Enforce profile scoping to prevent IDOR
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    return getMemoryTimelineService(parsed.memoryUuids, profileUuid);
  } catch (error) {
    return formatError(error);
  }
}

export async function getMemoryDetails(
  userId: string,
  memoryUuids: string[]
): Promise<MemoryResult> {
  try {
    const parsed = memoryUuidsSchema.parse({ memoryUuids });

    // Enforce profile scoping to prevent IDOR
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    return getMemoryDetailsService(parsed.memoryUuids, profileUuid);
  } catch (error) {
    return formatError(error);
  }
}

// ============================================================================
// Memory Ring
// ============================================================================

export async function getMemoryRing(
  userId: string,
  options?: { ringType?: RingType; limit?: number; offset?: number; agentUuid?: string }
): Promise<MemoryResult> {
  try {
    const parsed = getMemoryRingSchema.parse(options);

    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

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

    return { success: true, data: memories };
  } catch (error) {
    return formatError(error);
  }
}

export async function deleteMemory(
  userId: string,
  memoryUuid: string
): Promise<MemoryResult> {
  try {
    const parsed = deleteMemorySchema.parse({ memoryUuid });

    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    await db
      .delete(memoryRingTable)
      .where(
        and(
          eq(memoryRingTable.uuid, parsed.memoryUuid),
          eq(memoryRingTable.profile_uuid, profileUuid)
        )
      );

    return { success: true };
  } catch (error) {
    return formatError(error);
  }
}

// ============================================================================
// Statistics
// ============================================================================

export async function getMemoryStats(
  userId: string
): Promise<MemoryResult<MemoryStats>> {
  try {
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

    // Gut patterns count
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
  userId: string,
  options?: { agentUuid?: string; limit?: number }
): Promise<MemoryResult> {
  try {
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

export async function triggerClassification(
  userId: string
): Promise<MemoryResult> {
  try {
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    return classifyBatch(profileUuid);
  } catch (error) {
    return formatError(error);
  }
}

export async function triggerDecay(userId: string): Promise<MemoryResult> {
  try {
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
