import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { mcpActivityTable, McpServerSource } from '@/db/schema';

export interface TrendingServer {
  server_id: string; // server_uuid or external_id
  source: McpServerSource;
  install_count: number;
  tool_call_count: number;
  total_activity_count: number;
  trending_score: number;
  last_activity: Date;
}

export interface TrendingPeriod {
  hours: number;
  label: string;
}

export const TRENDING_PERIODS: Record<string, TrendingPeriod> = {
  '24h': { hours: 24, label: 'Last 24 hours' },
  '7d': { hours: 168, label: 'Last 7 days' },
  '30d': { hours: 720, label: 'Last 30 days' },
};

/**
 * Calculate trending servers based on activity metrics
 * @param source - Filter by source (REGISTRY/COMMUNITY) or null for all
 * @param period - Time period to calculate trending for (24h, 7d, 30d)
 * @param limit - Maximum number of results to return
 */
export async function calculateTrendingServers(
  source: McpServerSource | null,
  period: string = '7d',
  limit: number = 10
): Promise<TrendingServer[]> {
  const periodConfig = TRENDING_PERIODS[period] || TRENDING_PERIODS['7d'];
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - periodConfig.hours);

  // Build WHERE conditions
  const conditions = [gte(mcpActivityTable.created_at, cutoffDate)];
  if (source) {
    conditions.push(eq(mcpActivityTable.source, source));
  }

  // Query to aggregate activity by server
  // For registry servers, group by external_id; for others, group by server_uuid
  const activityQuery = db
    .select({
      server_uuid: sql<string | null>`MAX(${mcpActivityTable.server_uuid}::text)::uuid`,
      external_id: sql<string | null>`MAX(${mcpActivityTable.external_id}::text)`,
      source: mcpActivityTable.source,
      server_key: sql<string>`CASE 
        WHEN ${mcpActivityTable.source} = 'REGISTRY' AND ${mcpActivityTable.external_id} IS NOT NULL 
        THEN ${mcpActivityTable.external_id}
        ELSE COALESCE(${mcpActivityTable.server_uuid}::text, ${mcpActivityTable.external_id})
      END`,
      install_count: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'install' THEN 1 END)`,
      uninstall_count: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'uninstall' THEN 1 END)`,
      tool_call_count: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'tool_call' THEN 1 END)`,
      resource_count: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'resource_read' THEN 1 END)`,
      prompt_count: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'prompt_get' THEN 1 END)`,
      total_count: count(),
      last_activity: sql<Date>`MAX(${mcpActivityTable.created_at})`,
    })
    .from(mcpActivityTable)
    .where(and(...conditions))
    .groupBy(
      sql`CASE 
        WHEN ${mcpActivityTable.source} = 'REGISTRY' AND ${mcpActivityTable.external_id} IS NOT NULL 
        THEN ${mcpActivityTable.external_id}
        ELSE COALESCE(${mcpActivityTable.server_uuid}::text, ${mcpActivityTable.external_id})
      END`,
      mcpActivityTable.source
    );

  const results = await activityQuery;

  // Calculate trending scores and format results
  const trendingServers: TrendingServer[] = results
    .map((row) => {
      // Net installs (installs - uninstalls)
      const netInstalls = row.install_count - row.uninstall_count;
      
      // Activity score (tool calls, resources, prompts)
      const activityScore = row.tool_call_count + row.resource_count + row.prompt_count;
      
      // Recency factor (boost recent activity)
      const hoursSinceLastActivity = 
        (new Date().getTime() - new Date(row.last_activity).getTime()) / (1000 * 60 * 60);
      const recencyMultiplier = Math.max(0.5, 1 - (hoursSinceLastActivity / periodConfig.hours));
      
      // Calculate weighted trending score
      const trendingScore = 
        (netInstalls * 40) + // 40% weight for installs
        (activityScore * 40) + // 40% weight for usage
        (recencyMultiplier * 20); // 20% weight for recency

      return {
        server_id: row.server_key as string, // Use the aggregated key
        source: row.source,
        install_count: netInstalls,
        tool_call_count: Number(row.tool_call_count),
        total_activity_count: row.total_count,
        trending_score: Math.round(trendingScore),
        last_activity: row.last_activity,
      };
    })
    .filter(server => server.trending_score > 0) // Only include servers with positive scores
    .sort((a, b) => b.trending_score - a.trending_score)
    .slice(0, limit);

  return trendingServers;
}

/**
 * Get activity metrics for a specific server
 * @param serverId - server_uuid or external_id
 * @param source - Server source
 * @param period - Time period to get metrics for
 */
export async function getServerActivityMetrics(
  serverId: string,
  source: McpServerSource,
  period: string = '7d'
): Promise<{
  install_count: number;
  tool_call_count: number;
  total_activity_count: number;
  daily_activity: Array<{ date: string; count: number }>;
}> {
  const periodConfig = TRENDING_PERIODS[period] || TRENDING_PERIODS['7d'];
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - periodConfig.hours);

  // Determine which field to use based on source
  const serverField = source === McpServerSource.COMMUNITY 
    ? mcpActivityTable.server_uuid 
    : mcpActivityTable.external_id;

  // Get aggregate metrics
  const metricsQuery = await db
    .select({
      install_count: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'install' THEN 1 END) - COUNT(CASE WHEN ${mcpActivityTable.action} = 'uninstall' THEN 1 END)`,
      tool_call_count: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'tool_call' THEN 1 END)`,
      total_count: count(),
    })
    .from(mcpActivityTable)
    .where(
      and(
        eq(serverField, serverId),
        eq(mcpActivityTable.source, source),
        gte(mcpActivityTable.created_at, cutoffDate)
      )
    );

  // Get daily activity breakdown
  const dailyActivityQuery = await db
    .select({
      date: sql<string>`DATE(${mcpActivityTable.created_at})`,
      count: count(),
    })
    .from(mcpActivityTable)
    .where(
      and(
        eq(serverField, serverId),
        eq(mcpActivityTable.source, source),
        gte(mcpActivityTable.created_at, cutoffDate)
      )
    )
    .groupBy(sql`DATE(${mcpActivityTable.created_at})`)
    .orderBy(sql`DATE(${mcpActivityTable.created_at})`);

  return {
    install_count: metricsQuery[0]?.install_count || 0,
    tool_call_count: metricsQuery[0]?.tool_call_count || 0,
    total_activity_count: metricsQuery[0]?.total_count || 0,
    daily_activity: dailyActivityQuery.map(row => ({
      date: row.date,
      count: row.count,
    })),
  };
}