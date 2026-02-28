import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  startSession,
  getSessionHistory,
} from '@/lib/memory/session-service';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../auth';

const startSessionSchema = z.object({
  content_session_id: z.string().min(1),
  agent_uuid: z.string().uuid().optional(),
});

/**
 * GET /api/memory/sessions - List memory sessions
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
    const agentUuid = searchParams.get('agent_uuid') ?? undefined;
    const limitRaw = parseInt(searchParams.get('limit') ?? '20', 10);
    const offsetRaw = parseInt(searchParams.get('offset') ?? '0', 10);
    const statusRaw = searchParams.get('status') ?? undefined;

    // Validate pagination bounds
    const limit = isNaN(limitRaw) || limitRaw < 1 ? 20 : Math.min(limitRaw, 100);
    const offset = isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;

    // Validate status enum
    const validStatuses = ['active', 'completed', 'abandoned'] as const;
    const status = statusRaw && validStatuses.includes(statusRaw as typeof validStatuses[number])
      ? (statusRaw as 'active' | 'completed' | 'abandoned')
      : undefined;

    // Validate agent_uuid format if provided
    if (agentUuid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentUuid)) {
      return NextResponse.json(
        { success: false, error: 'Invalid agent_uuid format' },
        { status: 400 }
      );
    }

    const sessions = await getSessionHistory(auth.activeProfile.uuid, {
      agentUuid,
      limit,
      offset,
      status,
    });

    return NextResponse.json({ success: true, data: sessions });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/memory/sessions - Start a new memory session
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
    const parsed = startSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await startSession({
      profileUuid: auth.activeProfile.uuid,
      agentUuid: parsed.data.agent_uuid,
      contentSessionId: parsed.data.content_session_id,
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
