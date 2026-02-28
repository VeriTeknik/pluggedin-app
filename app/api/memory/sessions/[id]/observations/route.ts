import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  addObservation,
  getSessionObservations,
} from '@/lib/memory/observation-service';
import { getSessionByUuid } from '@/lib/memory/session-service';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../../../auth';

const observationSchema = z.object({
  type: z.enum([
    'tool_call', 'tool_result', 'user_preference', 'error_pattern',
    'decision', 'success_pattern', 'failure_pattern', 'workflow_step',
    'insight', 'context_switch',
  ]),
  content: z.string().min(1).max(10000),
  outcome: z.enum(['success', 'failure', 'neutral']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * GET /api/memory/sessions/[id]/observations - List observations for a session
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid session ID format' },
        { status: 400 }
      );
    }

    // Verify session ownership
    const session = await getSessionByUuid(id);
    if (!session || session.profile_uuid !== auth.activeProfile.uuid) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limitRaw = parseInt(searchParams.get('limit') ?? '100', 10);
    const offsetRaw = parseInt(searchParams.get('offset') ?? '0', 10);

    // Validate pagination bounds to prevent abuse
    const limit = isNaN(limitRaw) || limitRaw < 1 ? 100 : Math.min(limitRaw, 500);
    const offset = isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;

    const observations = await getSessionObservations(id, { limit, offset });

    return NextResponse.json({ success: true, data: observations });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/memory/sessions/[id]/observations - Add an observation
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid session ID format' },
        { status: 400 }
      );
    }

    // Verify session ownership
    const session = await getSessionByUuid(id);
    if (!session || session.profile_uuid !== auth.activeProfile.uuid) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    if (session.status !== 'active') {
      return NextResponse.json(
        { success: false, error: 'Session is not active' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = observationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await addObservation({
      profileUuid: auth.activeProfile.uuid,
      sessionUuid: id,
      agentUuid: session.agent_uuid ?? undefined,
      type: parsed.data.type,
      content: parsed.data.content,
      outcome: parsed.data.outcome,
      metadata: parsed.data.metadata as Record<string, unknown>,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
