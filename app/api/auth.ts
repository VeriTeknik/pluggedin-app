import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { trackApiKeyUsage } from '@/app/actions/api-keys';
import { db } from '@/db';
import { apiKeysTable } from '@/db/schema';

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
    user: {
      id: activeProfile.userId,
      email: activeProfile.userEmail,
      username: activeProfile.username,
    },
  };
}
