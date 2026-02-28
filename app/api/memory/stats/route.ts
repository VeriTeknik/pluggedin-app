import { count, eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import {
  freshMemoryTable,
  gutPatternsTable,
  memoryRingTable,
  memorySessionsTable,
} from '@/db/schema';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';

/**
 * GET /api/memory/stats - Memory statistics
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await EnhancedRateLimiters.api(request);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rateLimitResult.retryAfter },
        { status: 429 }
      );
    }

    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const profileUuid = auth.activeProfile.uuid;

    // Session stats
    const [sessionStats] = await db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${memorySessionsTable.status} = 'active')`,
      })
      .from(memorySessionsTable)
      .where(eq(memorySessionsTable.profile_uuid, profileUuid));

    // Fresh memory stats
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

    // Gut patterns
    const [gutStats] = await db
      .select({ total: count() })
      .from(gutPatternsTable);

    const ringCountMap: Record<string, number> = {};
    for (const r of ringCounts) {
      ringCountMap[r.ringType] = r.count;
    }

    const decayCountMap: Record<string, number> = {};
    for (const d of decayCounts) {
      decayCountMap[d.stage] = d.count;
    }

    return NextResponse.json({
      success: true,
      data: {
        totalSessions: sessionStats?.total ?? 0,
        activeSessions: sessionStats?.active ?? 0,
        totalFreshMemories: freshStats?.total ?? 0,
        unclassifiedCount: freshStats?.unclassified ?? 0,
        ringCounts: ringCountMap,
        decayStageCounts: decayCountMap,
        totalGutPatterns: gutStats?.total ?? 0,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
