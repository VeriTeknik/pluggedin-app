import { NextRequest, NextResponse } from 'next/server';

import { verifyCronSecret } from '@/lib/cron-auth';
import { cleanupTemporalEvents } from '@/lib/memory/jungian/temporal-event-service';

/**
 * POST /api/memory/temporal-events/cleanup - Cleanup old temporal events
 * Restricted: requires CRON_SECRET header.
 */
export async function POST(request: NextRequest) {
  try {
    if (!verifyCronSecret(request.headers.get('x-cron-secret'))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: this endpoint requires cron authorization' },
        { status: 403 }
      );
    }

    const result = await cleanupTemporalEvents();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
