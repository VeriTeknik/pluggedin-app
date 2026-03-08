import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { memoryRingTable } from '@/db/schema';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';

/**
 * GET /api/memory/ring - List memory ring entries
 * Uses authenticate() which supports both session and API key auth.
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

    const { searchParams } = new URL(request.url);
    const ringType = searchParams.get('ring_type') as 'procedures' | 'practice' | 'longterm' | 'shocks' | null;
    const agentUuid = searchParams.get('agent_uuid') ?? undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10) || 0;

    const conditions = [eq(memoryRingTable.profile_uuid, auth.activeProfile.uuid)];
    if (ringType) {
      conditions.push(eq(memoryRingTable.ring_type, ringType));
    }
    if (agentUuid) {
      conditions.push(eq(memoryRingTable.agent_uuid, agentUuid));
    }

    const memories = await db
      .select()
      .from(memoryRingTable)
      .where(and(...conditions))
      .orderBy(desc(memoryRingTable.relevance_score))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ success: true, data: memories });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
