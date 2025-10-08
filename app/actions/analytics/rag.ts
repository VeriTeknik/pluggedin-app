import { and, count, desc, eq, gte, like, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  docsTable,
  mcpActivityTable,
} from '@/db/schema';
import log from '@/lib/logger';
import { ragService } from '@/lib/rag-service';

import { analyticsSchemas, type TimePeriod,withAnalytics } from '../analytics-hof';
import { getDateCutoff } from './shared';
import { buildDocFilterWithProjectLookup } from './shared-helpers';

export interface RagAnalytics {
  totalDocuments: number;
  aiGeneratedCount: number;
  uploadedCount: number;
  apiOriginatedCount: number;
  storageBreakdown: {
    files: number;
    ragVectors: number;
  };
  documentsByModel: Array<{
    model: string;
    count: number;
  }>;
  ragSearchFrequency: Array<{
    date: string;
    count: number;
  }>;
  mostAccessedDocs: Array<{
    name: string;
    accessCount: number;
    isPlaceholder?: boolean;
  }>;
}

export const getRagAnalytics = withAnalytics(
  // Parse and validate inputs
  (profileUuid: string, period: TimePeriod = '7d', projectUuid?: string | undefined) => ({
    profileUuid: analyticsSchemas.profileUuid.parse(profileUuid),
    period: analyticsSchemas.period.parse(period),
    projectUuid,
    cacheVersion: 'rag-upload-stats-v2',
  }),

  // Rate limit key
  (userId) => `analytics:rag:${userId}`,

  // Handler with business logic
  async ({ profileUuid, period, projectUuid }) => {
    const cutoff = getDateCutoff(period);

    // Use shared helper to build document filter conditions
    const { conditions: docConditions } = await buildDocFilterWithProjectLookup({
      projectUuid,
      profileUuid,
      cutoff: cutoff ?? undefined,
    });

    // Use aggregated SQL query instead of fetching all rows and reducing in JS
    const [documentStats] = await db
      .select({
        totalDocuments: count(),
        aiGeneratedCount: sql<number>`
          COUNT(
            CASE WHEN COALESCE(LOWER(${docsTable.source}), 'upload') = 'ai_generated'
            THEN 1 END
          )
        `,
        uploadedCount: sql<number>`
          COUNT(
            CASE WHEN COALESCE(LOWER(${docsTable.source}), 'upload') IN ('upload', 'api')
            THEN 1 END
          )
        `,
        apiOriginatedCount: sql<number>`
          COUNT(
            CASE WHEN LOWER(${docsTable.source}) = 'api'
            THEN 1 END
          )
        `,
        totalSize: sql<number>`COALESCE(SUM(${docsTable.file_size}), 0)`,
      })
      .from(docsTable)
      .where(and(...docConditions));

    const normalizedStats = {
      totalDocuments: Number(documentStats?.totalDocuments || 0),
      aiGeneratedCount: Number(documentStats?.aiGeneratedCount || 0),
      uploadedCount: Number(documentStats?.uploadedCount || 0),
      apiOriginatedCount: Number(documentStats?.apiOriginatedCount || 0),
      totalSize: Number(documentStats?.totalSize || 0),
    };

    // Get RAG storage from the service
    let ragStorage = 0;
    // Use projectUuid if available, otherwise fall back to profileUuid for compatibility
    const ragIdentifier = projectUuid || profileUuid;
    try {
      const ragStats = await ragService.getStorageStats(ragIdentifier);
      if (ragStats.success && ragStats.estimatedStorageMb !== undefined) {
        // Convert MB to bytes to match file storage units
        ragStorage = Math.round(ragStats.estimatedStorageMb * 1024 * 1024);
      }
    } catch (error) {
      log.error('Failed to fetch RAG storage stats', error instanceof Error ? error : undefined, {
        ragIdentifier,
        profileUuid,
        projectUuid,
      });
      // Continue without failing the entire request
    }

    // Get documents by AI model
    const modelData = await db
      .select({
        model: sql<string>`${docsTable.ai_metadata}->>'model'`,
        count: count(),
      })
      .from(docsTable)
      .where(
        and(
          ...docConditions,
          eq(docsTable.source, 'ai_generated'),
          sql`${docsTable.ai_metadata} IS NOT NULL`
        )
      )
      .groupBy(sql`${docsTable.ai_metadata}->>'model'`)
      .orderBy(desc(count()))
      .limit(10);

    const documentsByModel = modelData
      .filter(m => m.model)
      .map(m => ({
        model: m.model || 'Unknown',
        count: m.count,
      }));

    // Get RAG search frequency from activity log (using safe parameterized queries)
    const ragSearchData = await db
      .select({
        date: sql<string>`DATE(${mcpActivityTable.created_at})`,
        count: count(),
      })
      .from(mcpActivityTable)
      .where(
        and(
          eq(mcpActivityTable.profile_uuid, profileUuid),
          eq(mcpActivityTable.action, 'resource_read'),
          // Safe: Using hardcoded patterns only, never user input
          // These patterns identify RAG-related resource reads
          or(
            like(mcpActivityTable.item_name, '%rag%'),
            like(mcpActivityTable.item_name, '%search%')
          ),
          cutoff ? gte(mcpActivityTable.created_at, cutoff) : sql`true`
        )
      )
      .groupBy(sql`DATE(${mcpActivityTable.created_at})`)
      .orderBy(sql`DATE(${mcpActivityTable.created_at})`);

    const ragSearchFrequency = ragSearchData.map(d => ({
      date: d.date,
      count: d.count,
    }));

    // Get most accessed documents - now with real tracking!
    const mostAccessedDocsRaw = await db
      .select({
        name: docsTable.name,
        uuid: docsTable.uuid,
        accessCount: sql<number>`COUNT(${mcpActivityTable.id})`,
      })
      .from(docsTable)
      .leftJoin(
        mcpActivityTable,
        and(
          sql`${mcpActivityTable.item_name} = ${docsTable.uuid}::text`,
          sql`${mcpActivityTable.action} IN ('document_view', 'document_rag_query')`
        )
      )
      .where(and(...docConditions))
      .groupBy(docsTable.name, docsTable.uuid)
      .orderBy(desc(sql`COUNT(${mcpActivityTable.id})`))
      .limit(10);

    const mostAccessedDocs = mostAccessedDocsRaw.map(d => ({
      name: d.name,
      accessCount: Number(d.accessCount),
      isPlaceholder: false, // Now using real data!
    }));

    return {
      totalDocuments: normalizedStats.totalDocuments,
      aiGeneratedCount: normalizedStats.aiGeneratedCount,
      uploadedCount: normalizedStats.uploadedCount,
      apiOriginatedCount: normalizedStats.apiOriginatedCount,
      storageBreakdown: {
        files: normalizedStats.totalSize,
        ragVectors: ragStorage, // Storage in bytes from RAG service
      },
      documentsByModel,
      ragSearchFrequency,
      mostAccessedDocs,
    };
  },

  // Enable caching with 5-minute TTL for performance
  {
    cache: {
      enabled: true,
      ttl: 5 * 60 * 1000, // 5 minutes
    },
  }
);
