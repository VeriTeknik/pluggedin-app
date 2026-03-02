import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { injectWithArchetype } from '@/lib/memory/jungian/archetype-router';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../../auth';

const bodySchema = z.object({
  query: z.string().max(2000).optional(),
  tool_name: z.string().max(200).optional(),
  outcome: z.string().max(100).optional(),
  observation_type: z.string().max(100).optional(),
  error_message: z.string().max(1000).optional(),
  consecutive_failures: z.number().int().min(0).max(100).optional(),
});

/**
 * POST /api/memory/archetype/inject - Inject patterns with archetype-aware filtering
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

    const { query, tool_name, outcome, observation_type, error_message, consecutive_failures } =
      parsed.data;

    const result = await injectWithArchetype({
      query,
      toolName: tool_name,
      outcome: outcome as 'success' | 'failure' | 'neutral' | undefined,
      observationType: observation_type as any,
      errorMessage: error_message,
      consecutiveFailures: consecutive_failures,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
