import { NextRequest, NextResponse } from 'next/server';

import {
  getSessionByUuid,
  getSessionByMemorySessionId,
  endSession,
} from '@/lib/memory/session-service';
import { generateZReport } from '@/lib/memory/z-report-service';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

import { authenticate } from '../../../auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEMORY_SESSION_ID_RE = /^ms_[A-Za-z0-9_-]{10,30}$/;

/** Resolve session by UUID or memory_session_id (ms_xxx) format */
async function resolveSession(id: string) {
  if (UUID_RE.test(id)) return getSessionByUuid(id);
  if (MEMORY_SESSION_ID_RE.test(id)) return getSessionByMemorySessionId(id);
  return null;
}

/**
 * GET /api/memory/sessions/[id] - Get session details
 * Accepts either UUID or memory_session_id (ms_xxx) format.
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

    const session = await resolveSession(id);

    if (!session || session.profile_uuid !== auth.activeProfile.uuid) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/memory/sessions/[id] - End a session (status → completed)
 * Accepts either UUID or memory_session_id (ms_xxx) format.
 */
export async function PATCH(
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

    // Verify ownership: look up session by UUID or memory_session_id
    const session = await resolveSession(id);
    if (!session || session.profile_uuid !== auth.activeProfile.uuid) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // Atomic ownership check + status update (prevents TOCTOU race)
    const result = await endSession(session.memory_session_id, auth.activeProfile.uuid);

    // Trigger Z-report generation asynchronously
    if (result.success && result.data) {
      generateZReport(result.data.uuid).catch(console.error);
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
