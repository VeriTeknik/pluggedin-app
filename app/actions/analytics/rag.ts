import { and, count, desc, eq, gte, like, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  docsTable,
  mcpActivityTable,
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
  (profileUuid: string, period: TimePeriod = '7d') => ({
    profileUuid: analyticsSchemas.profileUuid.parse(profileUuid),
    period: analyticsSchemas.period.parse(period),
  }),

  // Rate limit key
  (userId) => `analytics:rag:${userId}`,

  // Handler with business logic
  async ({ profileUuid, period }) => {
    const cutoff = getDateCutoff(period);
    const docConditions = [eq(docsTable.profile_uuid, profileUuid)];

    if (cutoff) {
      docConditions.push(gte(docsTable.created_at, cutoff));
    }

    // Get document counts by source
    const [docStats] = await db
      .select({
        total: count(),
        aiGenerated: sql<number>`COUNT(CASE WHEN ${docsTable.source} = 'ai_generated' THEN 1 END)`,
        uploaded: sql<number>`COUNT(CASE WHEN ${docsTable.source} = 'upload' THEN 1 END)`,
        totalSize: sql<number>`COALESCE(SUM(${docsTable.file_size}), 0)`,
      })
      .from(docsTable)
      .where(and(...docConditions));

    // Get RAG vector count from the service
    let ragVectors = 0;
    try {
      const ragStats = await ragService.getStorageStats(profileUuid);
      if (ragStats.success && ragStats.vectorsCount !== undefined) {
        ragVectors = ragStats.vectorsCount;
      }
    } catch (error) {
      console.error('Error fetching RAG vector count:', error);
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
      totalDocuments: docStats?.total || 0,
      aiGeneratedCount: Number(docStats?.aiGenerated || 0),
      uploadedCount: Number(docStats?.uploaded || 0),
      storageBreakdown: {
        files: Number(docStats?.totalSize || 0),
        ragVectors, // Now fetching from RAG service
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