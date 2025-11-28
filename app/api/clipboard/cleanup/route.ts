import { lt, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { clipboardsTable } from '@/db/schema';

// This endpoint can be called by a cron job to clean up expired clipboard entries
// Expected to be called with a secret key for security

/**
 * POST /api/clipboard/cleanup
 * Clean up expired clipboard entries
 *
 * This endpoint should be called periodically by a cron job or scheduler.
 * It deletes all clipboard entries where expires_at < NOW()
 *
 * Security: Requires CRON_SECRET header for authorization
 */
export async function POST(request: NextRequest) {
  try {
    // Verify the request is authorized
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // If CRON_SECRET is configured, require authorization
    if (cronSecret) {
      if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    // Delete all expired clipboard entries
    const result = await db
      .delete(clipboardsTable)
      .where(
        lt(clipboardsTable.expires_at, new Date())
      )
      .returning({ uuid: clipboardsTable.uuid });

    const deletedCount = result.length;

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
    // Verify the request is authorized
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // If CRON_SECRET is configured, require authorization
    if (cronSecret) {
      if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    // Get count of expired entries pending cleanup
    const expiredResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clipboardsTable)
      .where(lt(clipboardsTable.expires_at, new Date()));

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
