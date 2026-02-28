'use server';

import { and, count, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  freshMemoryTable,
  gutPatternsTable,
  memoryRingTable,
  memorySessionsTable,
} from '@/db/schema';
import type {
  AddObservationParams,
  DecayStage,
  MemoryResult,
  MemoryStats,
  RingType,
  SearchMemoriesParams,
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
import { generateZReport } from '@/lib/memory/z-report-service';
import { classifyBatch } from '@/lib/memory/analytics-agent';
import { processDecay, runNaturalSelection } from '@/lib/memory/decay-engine';
import { aggregatePatterns, queryIntuition } from '@/lib/memory/gut-agent';

import { getProjectActiveProfile } from './profiles';

// ============================================================================
// Helper: Get Profile UUID
// ============================================================================

async function getActiveProfileUuid(userId: string): Promise<string | null> {
  const { projectsTable } = await import('@/db/schema');

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
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    return startSessionService({
      profileUuid,
      agentUuid: params.agentUuid,
      contentSessionId: params.contentSessionId,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function endMemorySession(
  userId: string,
  memorySessionId: string
): Promise<MemoryResult<{ uuid: string }>> {
  try {
    const result = await endSessionService(memorySessionId);

    // Trigger Z-report generation if session ended successfully
    if (result.success && result.data) {
      // Fire and forget - Z-report generation is async
      generateZReport(result.data.uuid).catch(console.error);
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getMemorySessions(
  userId: string,
  options?: { agentUuid?: string; limit?: number; offset?: number }
): Promise<MemoryResult> {
  try {
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    const sessions = await getSessionHistory(profileUuid, options);
    return { success: true, data: sessions };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Observations
// ============================================================================

export async function addObservation(
  userId: string,
  params: Omit<AddObservationParams, 'profileUuid'>
): Promise<MemoryResult<{ uuid: string }>> {
  try {
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    return addObservationService({
      ...params,
      profileUuid,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getSessionObservations(
  userId: string,
  sessionUuid: string,
  options?: { limit?: number; offset?: number }
): Promise<MemoryResult> {
  try {
    const observations = await getSessionObservationsService(sessionUuid, options);
    return { success: true, data: observations };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Memory Retrieval (Progressive Disclosure)
// ============================================================================

export async function searchMemories(
  userId: string,
  params: Omit<SearchMemoriesParams, 'profileUuid'>
): Promise<MemoryResult> {
  try {
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    return searchMemoriesService({ ...params, profileUuid });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getMemoryTimeline(
  userId: string,
  memoryUuids: string[]
): Promise<MemoryResult> {
  try {
    return getMemoryTimelineService(memoryUuids);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function getMemoryDetails(
  userId: string,
  memoryUuids: string[]
): Promise<MemoryResult> {
  try {
    return getMemoryDetailsService(memoryUuids);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
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
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    const conditions = [eq(memoryRingTable.profile_uuid, profileUuid)];

    if (options?.ringType) {
      conditions.push(eq(memoryRingTable.ring_type, options.ringType));
    }

    if (options?.agentUuid) {
      conditions.push(eq(memoryRingTable.agent_uuid, options.agentUuid));
    }

    const memories = await db
      .select()
      .from(memoryRingTable)
      .where(and(...conditions))
      .orderBy(desc(memoryRingTable.relevance_score))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);

    return { success: true, data: memories };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function deleteMemory(
  userId: string,
  memoryUuid: string
): Promise<MemoryResult> {
  try {
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    await db
      .delete(memoryRingTable)
      .where(
        and(
          eq(memoryRingTable.uuid, memoryUuid),
          eq(memoryRingTable.profile_uuid, profileUuid)
        )
      );

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
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
    const profileUuid = await getActiveProfileUuid(userId);
    if (!profileUuid) {
      return { success: false, error: 'No active profile found' };
    }

    const { getZReports: getZReportsService } = await import('@/lib/memory/z-report-service');
    const reports = await getZReportsService(profileUuid, options);
    return { success: true, data: reports };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
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
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function triggerDecay(): Promise<MemoryResult> {
  try {
    return processDecay();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function triggerGutAggregation(): Promise<MemoryResult> {
  try {
    return aggregatePatterns();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function queryGutIntuition(
  query: string,
  topK?: number
): Promise<MemoryResult> {
  try {
    return queryIntuition(query, topK);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
