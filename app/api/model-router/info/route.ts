import { NextResponse } from 'next/server';

import { authenticate } from '@/app/api/auth';
import { db } from '@/db';
import { modelRouterServicesTable } from '@/db/schema';
import { generateModelRouterToken } from '@/lib/model-router/token';
import { eq } from 'drizzle-orm';

/**
 * GET /api/model-router/info
 *
 * Returns Model Router service info (URL and temporary token) for configuration UI.
 * Used by AgentConfigForm to fetch available models dynamically.
 *
 * Security:
 * - Requires authentication via authenticate()
 * - Returns short-lived token (5 min expiry)
 * - Token tied to user's project for tracking
 */
export async function GET(request: Request) {
  // Authenticate user
  const auth = await authenticate(request);
  if ('error' in auth) {
    return auth.error;
  }

  try {
    // Find enabled Model Router service (same logic as agent creation)
    const modelRouters = await db
      .select()
      .from(modelRouterServicesTable)
      .where(eq(modelRouterServicesTable.is_enabled, true))
      .orderBy(modelRouterServicesTable.priority)
      .limit(1);

    if (modelRouters.length === 0) {
      return NextResponse.json(
        { error: 'No Model Router service available' },
        { status: 503 }
      );
    }

    const modelRouter = modelRouters[0];

    // Generate temporary token (5 min expiry for form usage)
    const tempToken = await generateModelRouterToken(
      'temp-config-ui', // Temporary identifier
      `config-${auth.project.user_id}` // User-specific name
    );

    return NextResponse.json({
      url: modelRouter.url,
      token: tempToken,
      service_uuid: modelRouter.uuid,
      expires_in: 300, // 5 minutes
    });
  } catch (error) {
    console.error('Error fetching Model Router info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Model Router service info' },
      { status: 500 }
    );
  }
}
