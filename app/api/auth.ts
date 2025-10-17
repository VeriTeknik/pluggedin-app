import { and, eq, inArray, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { apiKeysTable, projectsTable, users } from '@/db/schema';

import { getProjectActiveProfile } from '../actions/profiles';

/**
 * Queue for batching usage updates
 *
 * IMPORTANT LIMITATION (Serverless Environments):
 * This in-memory queue does NOT persist across serverless function invocations.
 * Each invocation gets a fresh instance, so usage tracking may be incomplete in
 * serverless deployments (Vercel, AWS Lambda, etc.).
 *
 * For production serverless environments, consider:
 * 1. Direct database updates (may impact performance)
 * 2. External job queue (Redis, SQS, etc.)
 * 3. Edge function with longer lifecycle
 * 4. Background job processor
 *
 * Current implementation prioritizes response latency over perfect usage accuracy.
 */
const usageUpdateQueue = new Map<string, { count: number; lastIp: string }>();

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

  // Fetch API key with user and project relationships
  const apiKeyRecord = await db.query.apiKeysTable.findFirst({
    where: and(
      eq(apiKeysTable.api_key, apiKey),
      eq(apiKeysTable.is_active, true) // Check if active
    ),
    with: {
      user: true,
      project: true, // May be null if project was deleted
    },
  });

  if (!apiKeyRecord) {
    return {
      error: NextResponse.json({ error: 'Invalid or inactive API key' }, { status: 401 }),
    };
  }

  // Check if this is an orphaned key
  if (!apiKeyRecord.user_id) {
    return {
      error: NextResponse.json(
        { error: 'API key has no owner - please contact support' },
        { status: 401 }
      ),
    };
  }

  // Check expiration
  if (apiKeyRecord.expires_at) {
    const expiresAtDate =
      apiKeyRecord.expires_at instanceof Date
        ? apiKeyRecord.expires_at
        : new Date(apiKeyRecord.expires_at);
    if (new Date() > expiresAtDate) {
      return {
        error: NextResponse.json({ error: 'API key expired' }, { status: 401 }),
      };
    }
  }

  // Determine accessible projects
  let accessibleProjects: string[] = [];

  if (apiKeyRecord.all_projects_access) {
    // Get all current projects for the user
    const userProjects = await db
      .select({ uuid: projectsTable.uuid })
      .from(projectsTable)
      .where(eq(projectsTable.user_id, apiKeyRecord.user_id));
    accessibleProjects = userProjects.map(p => p.uuid);
  } else if (apiKeyRecord.project_permissions?.length) {
    // Use project_permissions (may include deleted projects)
    // Filter to only existing projects
    const existingProjects = await db
      .select({ uuid: projectsTable.uuid })
      .from(projectsTable)
      .where(
        and(
          inArray(projectsTable.uuid, apiKeyRecord.project_permissions),
          eq(projectsTable.user_id, apiKeyRecord.user_id)
        )
      );

    // If no projects exist but key had permissions, it's effectively unusable
    if (existingProjects.length === 0 && apiKeyRecord.project_permissions.length > 0) {
      return {
        error: NextResponse.json(
          { error: 'All permitted projects have been deleted. Please update API key permissions.' },
          { status: 401 }
        ),
      };
    }

    accessibleProjects = existingProjects.map(p => p.uuid);
  } else if (apiKeyRecord.project_uuid && apiKeyRecord.project) {
    // Legacy single-project key with existing project
    accessibleProjects = [apiKeyRecord.project_uuid];
  }

  // Get active profile for backward compatibility with MCP proxy
  let activeProfile = null;
  if (accessibleProjects.length > 0) {
    activeProfile = await getProjectActiveProfile(accessibleProjects[0]);
  } else if (apiKeyRecord.project_uuid) {
    // Try legacy project_uuid even if project doesn't exist
    // (for backward compatibility during migration)
    activeProfile = await getProjectActiveProfile(apiKeyRecord.project_uuid);
  }

  if (!activeProfile && accessibleProjects.length === 0) {
    return {
      error: NextResponse.json(
        { error: 'No accessible projects for this API key' },
        { status: 401 }
      ),
    };
  }

  // Queue usage update (non-blocking)
  queueApiKeyUsageUpdate(apiKeyRecord.uuid, request);

  // Return structure compatible with existing code and MCP proxy
  return {
    success: true,
    apiKey: apiKeyRecord,
    activeProfile, // For backward compatibility
    user: apiKeyRecord.user || {
      id: apiKeyRecord.user_id!,
      email: activeProfile?.userEmail,
      username: activeProfile?.username,
    },
    accessibleProjects,
  };
}

// Queue usage update for batch processing
function queueApiKeyUsageUpdate(apiKeyUuid: string, request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ||
             request.headers.get('x-real-ip') ||
             'unknown';

  if (!usageUpdateQueue.has(apiKeyUuid)) {
    usageUpdateQueue.set(apiKeyUuid, { count: 0, lastIp: ip });
  }

  const entry = usageUpdateQueue.get(apiKeyUuid)!;
  entry.count++;
  entry.lastIp = ip;

  // Process immediately in serverless (no long-running process)
  // In production, consider using a job queue or edge function
  processUsageUpdate(apiKeyUuid).catch(err =>
    console.error('Failed to update API key usage:', err)
  );
}

// Process usage update with optimistic locking
async function processUsageUpdate(apiKeyUuid: string) {
  const entry = usageUpdateQueue.get(apiKeyUuid);
  if (!entry) return;

  usageUpdateQueue.delete(apiKeyUuid);

  try {
    // Fetch current version
    const current = await db.query.apiKeysTable.findFirst({
      where: eq(apiKeysTable.uuid, apiKeyUuid),
      columns: { version: true },
    });

    if (!current) return;

    // Update with optimistic lock
    await db
      .update(apiKeysTable)
      .set({
        usage_count: sql`LEAST(${apiKeysTable.usage_count} + ${entry.count}, 2147483647)`,
        last_used_at: new Date(),
        last_used_ip: entry.lastIp,
        // version increment handled by trigger
      })
      .where(
        and(
          eq(apiKeysTable.uuid, apiKeyUuid),
          eq(apiKeysTable.version, current.version)
        )
      );
  } catch (error) {
    // Version conflict or other error - log but don't fail request
    console.error('API key usage update failed:', error);
  }
}
