import { NextRequest, NextResponse } from 'next/server';

import { triggerTokenRefresh } from '@/lib/oauth/token-refresh-scheduler';
import { createRateLimiter } from '@/lib/rate-limiter';

/**
 * OAuth Token Refresh Endpoint (Cron)
 *
 * Proactively refreshes expiring OAuth tokens.
 * Intended to be called by external cron jobs (e.g., system crontab).
 *
 * Security:
 * - Requires CRON_SECRET environment variable for authentication
 * - Rate limited to prevent abuse
 * - IP-based rate limiting (10 requests per hour)
 *
 * Example cron configuration:
 * ```bash
 * # Refresh OAuth tokens every 10 minutes
 * * /10 * * * * /home/pluggedin/oauth-refresh.sh >> /home/pluggedin/logs/oauth-refresh.log 2>&1
 * ```
 *
 * Example curl usage:
 * ```bash
 * curl -X POST https://plugged.in/api/oauth/refresh-tokens \
 *   -H "Authorization: Bearer $CRON_SECRET" \
 *   -H "Content-Type: application/json"
 * ```
 */

// Rate limiter for cron endpoint (10 requests per hour per IP)
const cronRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per window
});

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = await cronRateLimiter(request);
    if (!rateLimitResult.allowed) {
      console.warn('[OAuth Refresh Cron] Rate limit exceeded');
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    // Validate CRON_SECRET
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[OAuth Refresh Cron] CRON_SECRET not configured');
      return NextResponse.json(
        { error: 'Service not configured' },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('[OAuth Refresh Cron] Missing or invalid Authorization header');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const providedSecret = authHeader.substring(7); // Remove 'Bearer ' prefix

    // P0 Security: Use constant-time comparison to prevent timing attacks
    // This prevents attackers from using timing analysis to guess the secret
    const crypto = await import('crypto');
    const secretsMatch = crypto.timingSafeEqual(
      Buffer.from(providedSecret),
      Buffer.from(cronSecret)
    );

    if (!secretsMatch) {
      console.warn('[OAuth Refresh Cron] Invalid CRON_SECRET');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Trigger token refresh
    console.log('[OAuth Refresh Cron] Starting scheduled token refresh...');
    const results = await triggerTokenRefresh();

    console.log(
      `[OAuth Refresh Cron] Completed: ${results.refreshed} refreshed, ${results.failed} failed`
    );

    // Return results
    return NextResponse.json({
      success: true,
      refreshed: results.refreshed,
      failed: results.failed,
      errors: results.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[OAuth Refresh Cron] Unexpected error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Return 405 for other HTTP methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}
