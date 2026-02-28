import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getMemoryTimeline } from '@/lib/memory/retrieval-service';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../../auth';

const timelineSchema = z.object({
  memory_uuids: z.array(z.string().uuid()).min(1).max(50),
});

/**
 * POST /api/memory/search/timeline - Progressive disclosure Layer 2 (timeline)
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const parsed = timelineSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await getMemoryTimeline(parsed.data.memory_uuids, auth.activeProfile.uuid);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
