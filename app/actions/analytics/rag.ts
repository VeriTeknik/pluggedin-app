import { and, count, desc, eq, gte, like, or, sql, isNull } from 'drizzle-orm';

import { db } from '@/db';
import {
  docsTable,
  mcpActivityTable,
  projectsTable,
} from '@/db/schema';
import { ragService } from '@/lib/rag-service';

import { analyticsSchemas, type TimePeriod,withAnalytics } from '../analytics-hof';
import { getDateCutoff } from './shared';

export interface RagAnalytics {
  totalDocuments: number;
  aiGeneratedCount: number;
  uploadedCount: number;
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

    // Get user_id from project if projectUuid is provided (for legacy document support)
    let projectUserId: string | null = null;
    if (projectUuid) {
      const [project] = await db
        .select({ user_id: projectsTable.user_id })
        .from(projectsTable)
        .where(eq(projectsTable.uuid, projectUuid));
      projectUserId = project?.user_id || null;
    }

    // Build document conditions to include legacy documents with NULL project_uuid
    let docConditions: any[] = [];

    if (projectUuid && projectUserId) {
      // Include documents with the project_uuid OR legacy documents (NULL project_uuid) for this user
      docConditions.push(
        or(
          eq(docsTable.project_uuid, projectUuid),
          and(
            isNull(docsTable.project_uuid),
            eq(docsTable.user_id, projectUserId)
          )
        )
      );
    } else if (projectUuid) {
      // Fallback if project not found (shouldn't happen with valid projectUuid)
      docConditions.push(eq(docsTable.project_uuid, projectUuid));
    } else {
      // Fall back to profile_uuid for backwards compatibility
      docConditions.push(eq(docsTable.profile_uuid, profileUuid));
    }

    if (cutoff) {
      docConditions.push(gte(docsTable.created_at, cutoff));
    }

    // Get documents for aggregation (handle legacy rows with NULL source)
    const documentStats = await db
      .select({
        source: docsTable.source,
        fileSize: docsTable.file_size,
      })
      .from(docsTable)
      .where(and(...docConditions));

    const normalizedStats = documentStats.reduce(
      (acc, doc) => {
        const normalizedSource = doc.source ? doc.source.toLowerCase() : 'upload';

        acc.totalDocuments += 1;
        acc.totalSize += doc.fileSize || 0;

        if (normalizedSource === 'ai_generated') {
          acc.aiGeneratedCount += 1;
        } else {
          acc.uploadedCount += 1;
        }

        return acc;
      },
      {
        totalDocuments: 0,
        aiGeneratedCount: 0,
        uploadedCount: 0,
        totalSize: 0,
      }
    );

    // Get RAG storage from the service
    let ragStorage = 0;
    try {
      // Use projectUuid if available, otherwise fall back to profileUuid for compatibility
      const ragIdentifier = projectUuid || profileUuid;
      const ragStats = await ragService.getStorageStats(ragIdentifier);
      if (ragStats.success && ragStats.estimatedStorageMb !== undefined) {
        // Convert MB to bytes to match file storage units
        ragStorage = Math.round(ragStats.estimatedStorageMb * 1024 * 1024);
      }
    } catch (error) {
      console.error('Error fetching RAG storage:', error);
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
