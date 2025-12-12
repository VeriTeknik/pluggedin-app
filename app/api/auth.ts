import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { trackApiKeyUsage } from '@/app/actions/api-keys';
import { db } from '@/db';
import { apiKeysTable, projectsTable } from '@/db/schema';
import { authOptions } from '@/lib/auth';

import { getProjectActiveProfile } from '../actions/profiles';

export async function authenticateApiKey(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      error: NextResponse.json(
        { error: 'Authorization header with Bearer token is required' },
        { status: 401 }
      ),
    };
  }

  const apiKey = authHeader.substring(7).trim(); // Remove 'Bearer ' prefix
  const apiKeyRecord = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.api_key, apiKey))
    .limit(1);

  if (apiKeyRecord.length === 0) {
    return {
      error: NextResponse.json({ error: 'Invalid API key' }, { status: 401 }),
    };
  }

  const activeProfile = await getProjectActiveProfile(
    apiKeyRecord[0].project_uuid
  );
  if (!activeProfile) {
    return {
      error: NextResponse.json(
        { error: 'No active profile found for this API key' },
        { status: 401 }
      ),
    };
  }

  // Update last_used_at timestamp asynchronously with batched updates
  // This prevents race conditions and reduces database writes
  trackApiKeyUsage(apiKeyRecord[0].uuid).catch((err) =>
    console.error('Failed to track API key usage:', err)
  );

  return {
    success: true,
    apiKey: apiKeyRecord[0],
    activeProfile,
    project: {
      uuid: apiKeyRecord[0].project_uuid,
      user_id: activeProfile.userId,
    },
    user: {
      id: activeProfile.userId,
      email: activeProfile.userEmail,
      username: activeProfile.username,
    },
    authType: 'apikey' as const,
  };
}

/**
 * Authenticate request using either session (for UI) or API key (for external calls)
 * Tries session first, falls back to API key
 */
export async function authenticate(request: Request) {
  // First, try session-based auth (for UI access)
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    // Get user's project and active profile
    const project = await db
      .select({ uuid: projectsTable.uuid })
      .from(projectsTable)
      .where(eq(projectsTable.user_id, session.user.id))
      .limit(1);

    if (project.length === 0) {
      return {
        error: NextResponse.json(
          { error: 'No project found for user' },
          { status: 401 }
        ),
      };
    }

    const activeProfile = await getProjectActiveProfile(project[0].uuid);
    if (!activeProfile) {
      return {
        error: NextResponse.json(
          { error: 'No active profile found' },
          { status: 401 }
        ),
      };
    }

    return {
      success: true,
      activeProfile,
      project: { uuid: project[0].uuid, user_id: session.user.id },
      user: {
        id: session.user.id,
        email: session.user.email,
        username: activeProfile.username,
      },
      authType: 'session' as const,
    };
  }

  // Fall back to API key auth
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authenticateApiKey(request);
  }

  return {
    error: NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    ),
  };
}
