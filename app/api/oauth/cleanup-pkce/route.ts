import { NextRequest, NextResponse } from 'next/server';

import { cleanupExpiredPkceStates } from '@/lib/oauth/pkce-cleanup';

/**
 * OAuth PKCE State Cleanup Endpoint
 *
 * This endpoint should be called by external cron jobs (e.g., Vercel Cron, GitHub Actions)
 * to periodically clean up expired PKCE states.
 *
 * Schedule recommendation: Every 10-15 minutes
 *
 * Example cron configuration (Vercel):
 * ```json
 * {
 *   "crons": [{
 *     "path": "/api/oauth/cleanup-pkce",
 *     "schedule": "every 10 minutes"
 *   }]
 * }
 * ```
 *
 * Example GitHub Actions:
 * ```yaml
 * - cron: '10 * * * *'  # Every hour at minute 10
 * ```
 */
export async function POST(req: NextRequest) {
  try {
    // Optional: Add authentication to prevent unauthorized calls
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Clean up expired PKCE states
    const deletedCount = await cleanupExpiredPkceStates();

    return NextResponse.json({
      success: true,
      deletedCount,
      message: deletedCount > 0
        ? `Cleaned up ${deletedCount} expired PKCE states`
        : 'No expired PKCE states found',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error cleaning up PKCE states:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to clean up PKCE states',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Also support GET for easier testing in development
export async function GET(req: NextRequest) {
  // Only allow GET in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'GET method not allowed in production. Use POST with authentication.' },
      { status: 405 }
    );
  }

  try {
    const deletedCount = await cleanupExpiredPkceStates();

    return NextResponse.json({
      success: true,
      deletedCount,
      message: deletedCount > 0
        ? `Cleaned up ${deletedCount} expired PKCE states`
        : 'No expired PKCE states found',
      timestamp: new Date().toISOString(),
      note: 'GET is only available in development. Use POST with Bearer token in production.'
    });
  } catch (error) {
    console.error('Error cleaning up PKCE states:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to clean up PKCE states',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
