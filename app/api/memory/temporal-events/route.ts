import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { hashProfileUuid } from '@/lib/memory/cbp/hash-utils';
import { recordTemporalEvents } from '@/lib/memory/jungian/temporal-event-service';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';

const temporalEventSchema = z.object({
  tool_name: z.string().min(1).max(200),
  event_type: z.string().min(1).max(100),
  outcome: z.enum(['success', 'failure', 'neutral']).optional(),
  context_hash: z.string().max(64).optional(),
});

const bodySchema = z.object({
  events: z.array(temporalEventSchema).min(1).max(100),
});

/**
 * POST /api/memory/temporal-events - Record temporal events
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
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const profileHash = hashProfileUuid(auth.activeProfile.uuid);

    const events = parsed.data.events.map((e) => ({
      profileHash,
      toolName: e.tool_name,
      eventType: e.event_type,
      outcome: e.outcome,
      contextHash: e.context_hash,
    }));

    const result = await recordTemporalEvents(events);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
