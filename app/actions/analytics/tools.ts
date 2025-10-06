import { and, count, desc, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/db';
import { mcpActivityTable, mcpServersTable } from '@/db/schema';

import { analyticsSchemas, type TimePeriod,withAnalytics } from '../analytics-hof';
import { getDateCutoff } from './shared';

export interface ToolAnalytics {
  topTools: Array<{
    name: string;
    serverName: string;
    count: number;
    successRate: number;
  }>;
  serverActivity: Array<{
    serverName: string;
    toolCalls: number;
    resourceReads: number;
    promptGets: number;
    totalActivity: number;
  }>;
  hourlyDistribution: Array<{
    hour: number;
    count: number;
  }>;
  activityHeatmap: Array<{
    date: string;
    count: number;
  }>;
}

export const getToolAnalytics = withAnalytics(
  // Parse and validate inputs
  (profileUuid: string, period: TimePeriod = '7d', serverUuid?: string) => ({
    profileUuid: analyticsSchemas.profileUuid.parse(profileUuid),
    period: analyticsSchemas.period.parse(period),
    serverUuid: serverUuid ? analyticsSchemas.serverUuid.parse(serverUuid) : undefined,
  }),

  // Rate limit key
  (userId) => `analytics:tools:${userId}`,

  // Handler with business logic
  async ({ profileUuid, period, serverUuid }) => {
    // Verify server ownership if serverUuid is provided
    if (serverUuid) {
      const serverOwnership = await db
        .select({ uuid: mcpServersTable.uuid })
        .from(mcpServersTable)
        .where(
          and(
            eq(mcpServersTable.uuid, serverUuid),
            eq(mcpServersTable.profile_uuid, profileUuid)
          )
        )
        .limit(1);

      if (serverOwnership.length === 0) {
        throw new Error('Server not found or unauthorized');
      }
    }

    const cutoff = getDateCutoff(period);
    const conditions = [eq(mcpActivityTable.profile_uuid, profileUuid)];

    if (cutoff) {
      conditions.push(gte(mcpActivityTable.created_at, cutoff));
    }

    if (serverUuid) {
      conditions.push(eq(mcpActivityTable.server_uuid, serverUuid));
    }

    // Get top tools with success rate
    const topToolsData = await db
      .select({
        name: mcpActivityTable.item_name,
        serverName: sql<string>`
          CASE
            WHEN ${mcpServersTable.name} IS NOT NULL THEN ${mcpServersTable.name}
            WHEN ${mcpActivityTable.external_id} IS NOT NULL THEN ${mcpActivityTable.external_id}
            WHEN ${mcpActivityTable.server_uuid} IS NOT NULL THEN ${mcpActivityTable.server_uuid}::text || ' (Deleted)'
            ELSE 'Unknown'
          END
        `,
        count: count(),
        // Calculate actual success rate from status column
        successRate: sql<number>`
          ROUND(
            COUNT(CASE WHEN ${mcpActivityTable.status} = 'success' THEN 1 END) * 100.0 /
            NULLIF(COUNT(*), 0),
            1
          )`,
      })
      .from(mcpActivityTable)
      .leftJoin(mcpServersTable, eq(mcpActivityTable.server_uuid, mcpServersTable.uuid))
      .where(
        and(
          ...conditions,
          eq(mcpActivityTable.action, 'tool_call')
        )
      )
      .groupBy(
        mcpActivityTable.item_name,
        mcpActivityTable.external_id,
        mcpActivityTable.server_uuid,
        mcpServersTable.name
      )
      .orderBy(desc(count()))
      .limit(10);

    const topTools = topToolsData.map(t => ({
      name: t.name || 'Unknown',
      serverName: t.serverName,
      count: t.count,
      successRate: Number(t.successRate), // Will be actual rate once implemented
    }));

    // Get server activity breakdown
    const serverActivityData = await db
      .select({
        serverName: sql<string>`
          CASE
            WHEN ${mcpServersTable.name} IS NOT NULL THEN ${mcpServersTable.name}
            WHEN ${mcpActivityTable.external_id} IS NOT NULL THEN ${mcpActivityTable.external_id}
            WHEN ${mcpActivityTable.server_uuid} IS NOT NULL THEN ${mcpActivityTable.server_uuid}::text || ' (Deleted)'
            ELSE 'Unknown'
          END
        `,
        toolCalls: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'tool_call' THEN 1 END)`,
        resourceReads: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'resource_read' THEN 1 END)`,
        promptGets: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'prompt_get' THEN 1 END)`,
        totalActivity: count(),
      })
      .from(mcpActivityTable)
      .leftJoin(mcpServersTable, eq(mcpActivityTable.server_uuid, mcpServersTable.uuid))
      .where(and(...conditions))
      .groupBy(
        mcpActivityTable.external_id,
        mcpActivityTable.server_uuid,
        mcpServersTable.name
      )
      .orderBy(desc(count()));

    const serverActivity = serverActivityData.map(s => ({
      serverName: s.serverName,
      toolCalls: Number(s.toolCalls),
      resourceReads: Number(s.resourceReads),
      promptGets: Number(s.promptGets),
      totalActivity: s.totalActivity,
    }));

    // Get hourly distribution
    const hourlyData = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${mcpActivityTable.created_at})`,
        count: count(),
      })
      .from(mcpActivityTable)
      .where(and(...conditions))
      .groupBy(sql`EXTRACT(HOUR FROM ${mcpActivityTable.created_at})`)
      .orderBy(sql`EXTRACT(HOUR FROM ${mcpActivityTable.created_at})`);

    const hourlyDistribution = hourlyData.map(h => ({
      hour: Number(h.hour),
      count: h.count,
    }));

    // Get activity heatmap (last 90 days)
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
      .orderBy(sql`DATE(${mcpActivityTable.created_at})`);

    const activityHeatmap = heatmapData.map(d => ({
      date: d.date,
      count: d.count,
    }));

    return {
      topTools,
      serverActivity,
      hourlyDistribution,
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