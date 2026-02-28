import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { memoryRingTable } from '@/db/schema';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';

/**
 * GET /api/memory/ring - List memory ring entries
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
    const ringType = searchParams.get('ring_type');
    const agentUuid = searchParams.get('agent_uuid');
    const limitRaw = parseInt(searchParams.get('limit') ?? '50', 10);
    const offsetRaw = parseInt(searchParams.get('offset') ?? '0', 10);

    // Validate pagination bounds
    const limit = isNaN(limitRaw) || limitRaw < 1 ? 50 : Math.min(limitRaw, 200);
    const offset = isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;

    // Validate ring_type enum
    const validRingTypes = ['procedures', 'practice', 'longterm', 'shocks'];
    if (ringType && !validRingTypes.includes(ringType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid ring_type. Must be one of: procedures, practice, longterm, shocks' },
        { status: 400 }
      );
    }

    // Validate agent_uuid format if provided
    if (agentUuid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentUuid)) {
      return NextResponse.json(
        { success: false, error: 'Invalid agent_uuid format' },
        { status: 400 }
      );
    }

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
