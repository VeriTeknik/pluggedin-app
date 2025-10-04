import { and, count, desc, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/db';
import { mcpActivityTable, docsTable } from '@/db/schema';
import { withAnalytics, analyticsSchemas, type TimePeriod } from '../analytics-hof';
import { getDateCutoff } from './shared';

export interface ProductivityMetrics {
  activeStreak: number;
  mostProductiveHour: number;
  mostProductiveDay: string;
  avgToolCallsPerDay: number;
  avgDocumentsPerWeek: number;
  toolCombinations: Array<{
    tool1: string;
    tool2: string;
    count: number;
  }>;
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    achieved: boolean;
    progress?: number;
  }>;
}

export const getProductivityMetrics = withAnalytics(
  // Parse and validate inputs
  (profileUuid: string, period: TimePeriod = '30d') => ({
    profileUuid: analyticsSchemas.profileUuid.parse(profileUuid),
    period: analyticsSchemas.period.parse(period),
  }),

  // Rate limit key
  (userId) => `analytics:productivity:${userId}`,

  // Handler with business logic
  async ({ profileUuid, period }) => {
    // Calculate active streak (consecutive days with activity)
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const dailyActivity = await db
      .select({
        date: sql<string>`DATE(${mcpActivityTable.created_at})`,
        count: count(),
      })
      .from(mcpActivityTable)
      .where(
        and(
          eq(mcpActivityTable.profile_uuid, profileUuid),
          gte(mcpActivityTable.created_at, last30Days)
        )
      )
      .groupBy(sql`DATE(${mcpActivityTable.created_at})`)
      .orderBy(desc(sql`DATE(${mcpActivityTable.created_at})`));

    // Calculate streak
    let activeStreak = 0;
    const today = new Date().toISOString().split('T')[0];
    for (let i = 0; i < dailyActivity.length; i++) {
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() - i);
      const expected = expectedDate.toISOString().split('T')[0];

      if (dailyActivity[i]?.date === expected) {
        activeStreak++;
      } else {
        break;
      }
    }

    // Get most productive hour
    const [hourData] = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${mcpActivityTable.created_at})`,
        count: count(),
      })
      .from(mcpActivityTable)
      .where(eq(mcpActivityTable.profile_uuid, profileUuid))
      .groupBy(sql`EXTRACT(HOUR FROM ${mcpActivityTable.created_at})`)
      .orderBy(desc(count()))
      .limit(1);

    const mostProductiveHour = Number(hourData?.hour || 9);

    // Get most productive day
    const [dayData] = await db
      .select({
        day: sql<string>`TO_CHAR(${mcpActivityTable.created_at}, 'Day')`,
        count: count(),
      })
      .from(mcpActivityTable)
      .where(eq(mcpActivityTable.profile_uuid, profileUuid))
      .groupBy(sql`TO_CHAR(${mcpActivityTable.created_at}, 'Day')`)
      .orderBy(desc(count()))
      .limit(1);

    const mostProductiveDay = dayData?.day?.trim() || 'Monday';

    // Calculate averages (period-based)
    const cutoff = getDateCutoff(period);
    const conditions = [eq(mcpActivityTable.profile_uuid, profileUuid)];
    if (cutoff) {
      conditions.push(gte(mcpActivityTable.created_at, cutoff));
    }

    const [activityStats] = await db
      .select({
        totalToolCalls: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'tool_call' THEN 1 END)`,
        totalDays: sql<number>`COUNT(DISTINCT DATE(${mcpActivityTable.created_at}))`,
      })
      .from(mcpActivityTable)
      .where(and(...conditions));

    const avgToolCallsPerDay = activityStats?.totalDays
      ? Number(activityStats.totalToolCalls) / Number(activityStats.totalDays)
      : 0;

    // Get lifetime stats for achievements (no time filter)
    const [lifetimeStats] = await db
      .select({
        totalToolCalls: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'tool_call' THEN 1 END)`,
      })
      .from(mcpActivityTable)
      .where(eq(mcpActivityTable.profile_uuid, profileUuid));

    // Get document creation rate
    const [docStats] = await db
      .select({
        count: count(),
        days: sql<number>`EXTRACT(EPOCH FROM AGE(CURRENT_DATE, MIN(${docsTable.created_at}))) / 86400`,
      })
      .from(docsTable)
      .where(eq(docsTable.profile_uuid, profileUuid));

    const avgDocumentsPerWeek = docStats?.days && Number(docStats.days) > 0
      ? (docStats.count / (Number(docStats.days) / 7))
      : 0;

    // Get tool combinations (tools used together within 5-minute windows)
    const toolCombinations = await getToolCombinations(profileUuid, period);

    // Define achievements (using lifetime stats)
    const achievements = [
      {
        id: 'first_tool_call',
        title: 'First Steps',
        description: 'Make your first tool call',
        achieved: Number(lifetimeStats?.totalToolCalls || 0) > 0,
      },
      {
        id: 'tool_master',
        title: 'Tool Master',
        description: 'Make 100 tool calls',
        achieved: Number(lifetimeStats?.totalToolCalls || 0) >= 100,
        progress: Math.min(Number(lifetimeStats?.totalToolCalls || 0) / 100 * 100, 100),
      },
      {
        id: 'week_streak',
        title: 'Week Warrior',
        description: 'Stay active for 7 consecutive days',
        achieved: activeStreak >= 7,
        progress: Math.min(activeStreak / 7 * 100, 100),
      },
      {
        id: 'document_creator',
        title: 'Document Creator',
        description: 'Create 50 documents',
        achieved: (docStats?.count || 0) >= 50,
        progress: Math.min((docStats?.count || 0) / 50 * 100, 100),
      },
    ];

    return {
      activeStreak,
      mostProductiveHour,
      mostProductiveDay,
      avgToolCallsPerDay: Math.round(avgToolCallsPerDay * 10) / 10,
      avgDocumentsPerWeek: Math.round(avgDocumentsPerWeek * 10) / 10,
      toolCombinations,
      achievements,
    };
  }
);

/**
 * Get tool combinations - tools frequently used together
 */
async function getToolCombinations(
  profileUuid: string,
  period: TimePeriod
): Promise<Array<{ tool1: string; tool2: string; count: number }>> {
  const cutoff = getDateCutoff(period);

  // Use window functions to find sequential tool calls within 5 minutes
  const sequentialTools = await db
    .select({
      tool1: mcpActivityTable.item_name,
      tool2: sql<string>`LEAD(${mcpActivityTable.item_name}) OVER (
        PARTITION BY ${mcpActivityTable.profile_uuid}
        ORDER BY ${mcpActivityTable.created_at}
      )`,
      timeDiff: sql<number>`EXTRACT(EPOCH FROM (
        LEAD(${mcpActivityTable.created_at}) OVER (
          PARTITION BY ${mcpActivityTable.profile_uuid}
          ORDER BY ${mcpActivityTable.created_at}
        ) - ${mcpActivityTable.created_at}
      ))`,
    })
    .from(mcpActivityTable)
    .where(
      and(
        eq(mcpActivityTable.profile_uuid, profileUuid),
        eq(mcpActivityTable.action, 'tool_call'),
        cutoff ? gte(mcpActivityTable.created_at, cutoff) : sql`true`
      )
    );

  // Count combinations within 5-minute windows
  const combinations: Record<string, number> = {};

  sequentialTools.forEach((row) => {
    if (row.tool2 && row.timeDiff && row.timeDiff < 300) { // 5 minutes = 300 seconds
      const key = `${row.tool1}→${row.tool2}`;
      combinations[key] = (combinations[key] || 0) + 1;
    }
  });

  // Return top 5 combinations
  return Object.entries(combinations)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pair, count]) => {
      const [tool1, tool2] = pair.split('→');
      return { tool1, tool2, count };
    });
}