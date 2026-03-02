import { NextRequest, NextResponse } from 'next/server';

import { verifyCronSecret } from '@/lib/cron-auth';
import {
  cleanupDreamConsolidations,
  cleanupIndividuationSnapshots,
  cleanupTemporalEvents,
} from '@/lib/memory/jungian/temporal-event-service';

/**
 * POST /api/memory/temporal-events/cleanup - Cleanup old Jungian data
 * Runs retention cleanup for temporal_events, dream_consolidations,
 * and individuation_snapshots.
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

    const [temporalResult, dreamResult, individuationResult] = await Promise.all([
      cleanupTemporalEvents(),
      cleanupDreamConsolidations(),
      cleanupIndividuationSnapshots(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        temporalEvents: temporalResult.success ? temporalResult.data : { error: temporalResult.error },
        dreamConsolidations: dreamResult.success ? dreamResult.data : { error: dreamResult.error },
        individuationSnapshots: individuationResult.success ? individuationResult.data : { error: individuationResult.error },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
