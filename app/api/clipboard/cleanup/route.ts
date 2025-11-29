import { and, isNotNull, lt, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { clipboardsTable } from '@/db/schema';
import { cleanupAllExpiredClipboards } from '@/lib/clipboard';

// This endpoint can be called by a cron job to clean up expired clipboard entries
// Expected to be called with a secret key for security

/**
 * Verify cron authorization
 * Security: Fail closed - require CRON_SECRET in non-development environments
 */
function verifyCronAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isDevelopment = process.env.NODE_ENV === 'development';

  // In production, CRON_SECRET is required
  if (!cronSecret && !isDevelopment) {
    console.error('[Clipboard Cleanup] CRON_SECRET not configured in production');
    return NextResponse.json(
      { error: 'Cleanup endpoint not configured' },
      { status: 503 }
    );
  }

  // If CRON_SECRET is configured, verify authorization
  if (cronSecret && (!authHeader || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return null; // Auth passed
}

/**
 * POST /api/clipboard/cleanup
 * Clean up expired clipboard entries
 *
 * This endpoint should be called periodically by a cron job or scheduler.
 * It deletes all clipboard entries where expires_at < NOW()
 *
 * Security: Requires CRON_SECRET header for authorization (fail-closed in production)
 */
export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const deletedCount = await cleanupAllExpiredClipboards();

    console.log(`[Clipboard Cleanup] Deleted ${deletedCount} expired entries`);

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Cleaned up ${deletedCount} expired clipboard entries`,
    });
  } catch (error) {
    console.error('Error during clipboard cleanup:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/clipboard/cleanup
 * Get cleanup status / stats (for monitoring)
 */
export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    // Get count of expired entries pending cleanup
    // Note: Must check isNotNull to match cleanup logic - entries with NULL expires_at never expire
    const expiredResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clipboardsTable)
      .where(
        and(
          isNotNull(clipboardsTable.expires_at),
          lt(clipboardsTable.expires_at, new Date())
        )
      );

    // Get total entries count
    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clipboardsTable);

    return NextResponse.json({
      success: true,
      stats: {
        expiredCount: expiredResult[0]?.count ?? 0,
        totalCount: totalResult[0]?.count ?? 0,
      },
    });
  } catch (error) {
    console.error('Error getting clipboard cleanup stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
