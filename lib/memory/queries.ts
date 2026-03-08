import { and, count, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  freshMemoryTable,
  gutPatternsTable,
  memoryRingTable,
  memorySessionsTable,
} from '@/db/schema';
import type { MemoryStats, RingType } from '@/lib/memory/types';

function toCountMap<K extends string>(
  rows: { key: K; count: number }[]
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const { key, count } of rows) {
    map[key] = count;
  }
  return map;
}

/**
 * Fetch memory ring entries for a given profile.
 * Used by both the server action and the API route.
 */
export async function fetchMemoryRing(params: {
  profileUuid: string;
  ringType?: RingType | null;
  agentUuid?: string;
  limit: number;
  offset: number;
}) {
  const { profileUuid, ringType, agentUuid, limit, offset } = params;

  const conditions = [eq(memoryRingTable.profile_uuid, profileUuid)];
  if (ringType) {
    conditions.push(eq(memoryRingTable.ring_type, ringType));
  }
  if (agentUuid) {
    conditions.push(eq(memoryRingTable.agent_uuid, agentUuid));
  }

  return db
    .select()
    .from(memoryRingTable)
    .where(and(...conditions))
    .orderBy(desc(memoryRingTable.relevance_score))
    .limit(limit)
    .offset(offset);
}

/**
 * Compute memory statistics for a given profile.
 * Used by both the server action and the API route.
 */
export async function fetchMemoryStats(profileUuid: string): Promise<MemoryStats> {
  const [sessionStats] = await db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where ${memorySessionsTable.status} = 'active')`,
    })
    .from(memorySessionsTable)
    .where(eq(memorySessionsTable.profile_uuid, profileUuid));

  const [freshStats] = await db
    .select({
      total: sql<number>`count(*)`,
      unclassified: sql<number>`count(*) filter (where ${freshMemoryTable.classified} = false)`,
    })
    .from(freshMemoryTable)
    .where(eq(freshMemoryTable.profile_uuid, profileUuid));

  const ringCounts = await db
    .select({
      key: memoryRingTable.ring_type,
      count: count(),
    })
    .from(memoryRingTable)
    .where(eq(memoryRingTable.profile_uuid, profileUuid))
    .groupBy(memoryRingTable.ring_type);

  const decayCounts = await db
    .select({
      key: memoryRingTable.current_decay_stage,
      count: count(),
    })
    .from(memoryRingTable)
    .where(eq(memoryRingTable.profile_uuid, profileUuid))
    .groupBy(memoryRingTable.current_decay_stage);

  // Gut patterns are intentionally global (collective wisdom).
  // Only patterns meeting k-anonymity threshold are exposed via the query endpoint.
  // This count reveals no per-profile data.
  const [gutStats] = await db
    .select({ total: count() })
    .from(gutPatternsTable);

  return {
    totalSessions: sessionStats?.total ?? 0,
    activeSessions: sessionStats?.active ?? 0,
    totalFreshMemories: freshStats?.total ?? 0,
    unclassifiedCount: freshStats?.unclassified ?? 0,
    ringCounts: toCountMap(ringCounts),
    decayStageCounts: toCountMap(decayCounts),
    totalGutPatterns: gutStats?.total ?? 0,
  };
}
