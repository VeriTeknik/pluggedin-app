import { and, eq, inArray, lt } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { memorySessionsTable } from '@/db/schema';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../../auth';

/**
 * POST /api/memory/sessions/prune - Delete abandoned sessions older than 24h
 * Also deletes their associated observations.
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await EnhancedRateLimiters.sensitive(request);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rateLimitResult.retryAfter },
        { status: 429 }
      );
    }

    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const threshold = new Date();
    threshold.setHours(threshold.getHours() - 24);

    // Find abandoned sessions older than 24h for this profile (batch limit 500)
    const staleSessions = await db
      .select({ uuid: memorySessionsTable.uuid })
      .from(memorySessionsTable)
      .where(
        and(
          eq(memorySessionsTable.profile_uuid, auth.activeProfile.uuid),
          eq(memorySessionsTable.status, 'abandoned'),
          lt(memorySessionsTable.ended_at, threshold)
        )
      )
      .limit(500);

    if (staleSessions.length === 0) {
      return NextResponse.json({ success: true, data: { deleted: 0 } });
    }

    const sessionUuids = staleSessions.map(s => s.uuid);

    // Atomic delete with full WHERE re-check to prevent TOCTOU
    const deleted = await db
      .delete(memorySessionsTable)
      .where(
        and(
          inArray(memorySessionsTable.uuid, sessionUuids),
          eq(memorySessionsTable.profile_uuid, auth.activeProfile.uuid),
          eq(memorySessionsTable.status, 'abandoned'),
          lt(memorySessionsTable.ended_at, threshold)
        )
      )
      .returning({ uuid: memorySessionsTable.uuid });

    return NextResponse.json({
      success: true,
      data: { deleted: deleted.length },
    });
  } catch (error) {
    console.error('Prune sessions error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
