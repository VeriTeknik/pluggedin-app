import { and, desc, eq, gte, or, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { docsTable, projectsTable } from '@/db/schema';

import { analyticsSchemas, withAnalytics } from '../analytics-hof';

export interface RecentDocument {
  uuid: string;
  name: string;
  file_name: string;
  source: 'upload' | 'ai_generated' | 'api';
  version: number;
  created_at: Date;
  ai_metadata?: {
    model?: {
      name: string;
      provider: string;
      version?: string;
    };
  } | null;
}

export const getRecentDocuments = withAnalytics(
  // Parse and validate inputs
  (profileUuid: string, limit: number = 10, projectUuid?: string | undefined) => ({
    profileUuid: analyticsSchemas.profileUuid.parse(profileUuid),
    limit: analyticsSchemas.limit.parse(limit),
    projectUuid,
  }),

  // Rate limit key
  (userId) => `analytics:recentDocs:${userId}`,

  // Handler with business logic
  async ({ profileUuid, limit, projectUuid }) => {
    // Get user_id from project if projectUuid is provided (for legacy document support)
    let projectUserId: string | null = null;
    if (projectUuid) {
      const [project] = await db
        .select({ user_id: projectsTable.user_id })
        .from(projectsTable)
        .where(eq(projectsTable.uuid, projectUuid));
      projectUserId = project?.user_id || null;
    }

    // Build where condition to include legacy documents with NULL project_uuid
    let whereCondition: any;

    if (projectUuid && projectUserId) {
      // Include documents with the project_uuid OR legacy documents (NULL project_uuid) for this user
      whereCondition = or(
        eq(docsTable.project_uuid, projectUuid),
        and(
          isNull(docsTable.project_uuid),
          eq(docsTable.user_id, projectUserId)
        )
      );
    } else if (projectUuid) {
      // Fallback if project not found (shouldn't happen with valid projectUuid)
      whereCondition = eq(docsTable.project_uuid, projectUuid);
    } else {
      // Fall back to profile_uuid for backwards compatibility
      whereCondition = eq(docsTable.profile_uuid, profileUuid);
    }

    const recentDocs = await db
      .select({
        uuid: docsTable.uuid,
        name: docsTable.name,
        file_name: docsTable.file_name,
        source: docsTable.source,
        version: docsTable.version,
        created_at: docsTable.created_at,
        ai_metadata: docsTable.ai_metadata,
      })
      .from(docsTable)
      .where(whereCondition)
      .orderBy(desc(docsTable.created_at))
      .limit(limit);

    return recentDocs.map(doc => ({
      uuid: doc.uuid,
      name: doc.name,
      file_name: doc.file_name,
      source: doc.source || 'upload', // Default to upload for backward compatibility
      version: doc.version || 1,
      created_at: doc.created_at,
      ai_metadata: doc.ai_metadata as RecentDocument['ai_metadata'],
    }));
  },

  // Enable caching with 5-minute TTL for performance
  {
    cache: {
      enabled: true,
      ttl: 5 * 60 * 1000, // 5 minutes
    },
  }
);