import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { searchMemories } from '@/lib/memory/retrieval-service';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';

const searchSchema = z.object({
  query: z.string().min(1).max(1000),
  ring_types: z.array(z.enum(['procedures', 'practice', 'longterm', 'shocks'])).optional(),
  agent_uuid: z.string().uuid().optional(),
  top_k: z.number().int().min(1).max(50).optional(),
  threshold: z.number().min(0).max(1).optional(),
  include_gut: z.boolean().optional(),
});

/**
 * POST /api/memory/search - Progressive disclosure Layer 1 (search)
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
    const parsed = searchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await searchMemories({
      profileUuid: auth.activeProfile.uuid,
      query: parsed.data.query,
      ringTypes: parsed.data.ring_types,
      agentUuid: parsed.data.agent_uuid,
      topK: parsed.data.top_k,
      threshold: parsed.data.threshold,
      includeGut: parsed.data.include_gut,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
