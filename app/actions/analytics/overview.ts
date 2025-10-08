import { and, count, desc, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  docsTable,
  mcpActivityTable,
  mcpServersTable,
} from '@/db/schema';

import { analyticsSchemas, type TimePeriod,withAnalytics } from '../analytics-hof';
import { calculateTrend,getComparisonCutoff, getDateCutoff } from './shared';
import { buildDocFilterWithProjectLookup } from './shared-helpers';

export interface OverviewMetrics {
  totalToolCalls: number;
  totalDocuments: number;
  totalRagSearches: number;
  mostUsedServer: string | null;
  storageUsed: number;
  toolCallsTrend: number;
  documentsTrend: number;
  ragSearchesTrend: number;
  dailyActivity: Array<{
    date: string;
    toolCalls: number;
    ragSearches: number;
  }>;
  activityHeatmap: Array<{
    date: string;
    count: number;
  }>;
}

export const getOverviewMetrics = withAnalytics(
  // Parse and validate inputs
  (profileUuid: string, period: TimePeriod = '7d', projectUuid?: string | undefined) => ({
    profileUuid: analyticsSchemas.profileUuid.parse(profileUuid),
    period: analyticsSchemas.period.parse(period),
    projectUuid,
  }),

  // Rate limit key
  (userId) => `analytics:overview:${userId}`,

  // Handler with business logic
  async ({ profileUuid, period, projectUuid }) => {
    const cutoff = getDateCutoff(period);
    const comparisonPeriod = getComparisonCutoff(period);

    // Build conditions for activity tracking
    const currentConditions = [eq(mcpActivityTable.profile_uuid, profileUuid)];
    if (cutoff) {
      currentConditions.push(gte(mcpActivityTable.created_at, cutoff));
    }

    // Get current period metrics
    const [currentMetrics] = await db
      .select({
        toolCalls: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'tool_call' THEN 1 END)`,
        ragSearches: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'resource_read' AND ${mcpActivityTable.item_name} LIKE '%rag%' THEN 1 END)`,
      })
      .from(mcpActivityTable)
      .where(and(...currentConditions));

    const totalToolCalls = Number(currentMetrics?.toolCalls || 0);
    const totalRagSearches = Number(currentMetrics?.ragSearches || 0);

    // Get comparison metrics for trends
    let previousToolCalls = 0;
    let previousRagSearches = 0;

    if (period !== 'all') {
      const [previousMetrics] = await db
        .select({
          toolCalls: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'tool_call' THEN 1 END)`,
          ragSearches: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'resource_read' AND ${mcpActivityTable.item_name} LIKE '%rag%' THEN 1 END)`,
        })
        .from(mcpActivityTable)
        .where(
          and(
            eq(mcpActivityTable.profile_uuid, profileUuid),
            gte(mcpActivityTable.created_at, comparisonPeriod.start),
            sql`${mcpActivityTable.created_at} < ${comparisonPeriod.end}`
          )
        );

      previousToolCalls = Number(previousMetrics?.toolCalls || 0);
      previousRagSearches = Number(previousMetrics?.ragSearches || 0);
    }

    // Get document stats using shared helper
    const { projectUserId, conditions: docConditions } = await buildDocFilterWithProjectLookup({
      projectUuid,
      profileUuid,
      cutoff: cutoff ?? undefined,
    });

    const [docStats] = await db
      .select({
        total: count(),
        totalSize: sql<number>`COALESCE(SUM(${docsTable.file_size}), 0)`,
      })
      .from(docsTable)
      .where(and(...docConditions));

    const totalDocuments = docStats?.total || 0;
    const storageUsed = Number(docStats?.totalSize || 0);

    // Get previous document count for trend
    let previousDocuments = 0;
    if (period !== 'all') {
      const { conditions: prevDocConditions } = await buildDocFilterWithProjectLookup({
        projectUuid,
        profileUuid,
        cutoff: comparisonPeriod.start,
      });

      // Add upper bound for comparison period
      prevDocConditions.push(sql`${docsTable.created_at} < ${comparisonPeriod.end}`);

      const [prevDocStats] = await db
        .select({ total: count() })
        .from(docsTable)
        .where(and(...prevDocConditions));

      previousDocuments = prevDocStats?.total || 0;
    }

    // Get most used server
    const serverActivity = await db
      .select({
        serverName: sql<string>`
          CASE
            WHEN ${mcpServersTable.name} IS NOT NULL THEN ${mcpServersTable.name}
            WHEN ${mcpActivityTable.external_id} IS NOT NULL THEN ${mcpActivityTable.external_id}
            WHEN ${mcpActivityTable.server_uuid} IS NOT NULL THEN ${mcpActivityTable.server_uuid}::text || ' (Deleted)'
            ELSE 'Unknown'
          END
        `,
        count: count(),
      })
      .from(mcpActivityTable)
      .leftJoin(mcpServersTable, eq(mcpActivityTable.server_uuid, mcpServersTable.uuid))
      .where(and(...currentConditions))
      .groupBy(
        mcpServersTable.name,
        mcpActivityTable.server_uuid,
        mcpActivityTable.external_id
      )
      .orderBy(desc(count()))
      .limit(1);

    const mostUsedServer = serverActivity[0]?.serverName || null;

    // Get daily activity for chart (with appropriate limits to prevent memory issues)
    const maxDays = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
    const dailyActivityData = await db
      .select({
        date: sql<string>`DATE(${mcpActivityTable.created_at})`,
        toolCalls: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'tool_call' THEN 1 END)`,
        ragSearches: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'resource_read' AND ${mcpActivityTable.item_name} LIKE '%rag%' THEN 1 END)`,
      })
      .from(mcpActivityTable)
      .where(and(...currentConditions))
      .groupBy(sql`DATE(${mcpActivityTable.created_at})`)
      .orderBy(sql`DATE(${mcpActivityTable.created_at}) DESC`)
      .limit(maxDays);

    // Sort in ascending order for chart display
    const dailyActivity = dailyActivityData
      .map(d => ({
        date: d.date,
        toolCalls: Number(d.toolCalls),
        ragSearches: Number(d.ragSearches),
      }))
      .reverse();

    // Get activity heatmap (always shows last 90 days for consistency)
    // This is independent of the selected time period filter to provide a consistent view
    // PERFORMANCE: Limited to 90 days max to prevent memory issues
    const heatmapCutoff = new Date();
    heatmapCutoff.setDate(heatmapCutoff.getDate() - 90);

    const heatmapData = await db
      .select({
        date: sql<string>`DATE(${mcpActivityTable.created_at})`,
        count: count(),
      })
      .from(mcpActivityTable)
      .where(
        and(
          eq(mcpActivityTable.profile_uuid, profileUuid),
          gte(mcpActivityTable.created_at, heatmapCutoff)
        )
      )
      .groupBy(sql`DATE(${mcpActivityTable.created_at})`)
      .orderBy(sql`DATE(${mcpActivityTable.created_at}) DESC`)
      .limit(90);  // Explicit limit for safety

    const activityHeatmap = heatmapData
      .map(d => ({
        date: d.date,
        count: d.count,
      }))
      .reverse();  // Sort ascending for heatmap display

    // Calculate trends
    const toolCallsTrend = calculateTrend(totalToolCalls, previousToolCalls);
    const documentsTrend = calculateTrend(totalDocuments, previousDocuments);
    const ragSearchesTrend = calculateTrend(totalRagSearches, previousRagSearches);

    return {
      totalToolCalls,
      totalDocuments,
      totalRagSearches,
      mostUsedServer,
      storageUsed,
      toolCallsTrend,
      documentsTrend,
      ragSearchesTrend,
      dailyActivity,
      activityHeatmap,
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