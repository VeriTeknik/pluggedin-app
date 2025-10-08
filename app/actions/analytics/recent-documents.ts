import { and, desc } from 'drizzle-orm';

import { db } from '@/db';
import { docsTable } from '@/db/schema';

import { analyticsSchemas, withAnalytics } from '../analytics-hof';
import { buildDocFilterWithProjectLookup } from './shared-helpers';

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
    // Use shared helper to build document filter conditions
    const { conditions } = await buildDocFilterWithProjectLookup({
      projectUuid,
      profileUuid,
    });

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
      .where(and(...conditions))
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