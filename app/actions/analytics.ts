'use server';

import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import {
  mcpActivityTable,
  mcpServersTable,
  docsTable,
  documentVersionsTable,
  documentModelAttributionsTable,
  profilesTable,
  projectsTable
} from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { rateLimiter } from '@/lib/rate-limiter';

export type TimePeriod = '7d' | '30d' | '90d' | 'all';

// Zod validation schemas
const uuidSchema = z.string().uuid('Invalid profile UUID');
const periodSchema = z.enum(['7d', '30d', '90d', 'all']);
const limitSchema = z.number().int().min(1).max(100);
const serverUuidSchema = z.string().uuid('Invalid server UUID').optional();

interface OverviewMetrics {
  totalToolCalls: number;
  toolCallsTrend: number; // percentage change from previous period
  totalDocuments: number;
  documentsTrend: number;
  totalRagSearches: number;
  ragSearchesTrend: number;
  mostUsedServer: { name: string; count: number } | null;
  storageUsed: number;
  dailyActivity: Array<{ date: string; toolCalls: number; ragSearches: number }>;
}

interface ToolAnalytics {
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
  hourlyDistribution: Array<{ hour: number; count: number }>;
  activityHeatmap: Array<{ date: string; count: number }>;
}

interface RagAnalytics {
  totalDocuments: number;
  aiGeneratedCount: number;
  uploadedCount: number;
  storageBreakdown: {
    files: number;
    ragVectors: number;
  };
  documentsByModel: Array<{ model: string; count: number }>;
  ragSearchFrequency: Array<{ date: string; count: number }>;
  mostAccessedDocs: Array<{ name: string; accessCount: number }>;
}

interface ProductivityMetrics {
  activeStreak: number;
  mostProductiveHour: number;
  mostProductiveDay: string;
  avgToolCallsPerDay: number;
  avgDocumentsPerWeek: number;
  toolCombinations: Array<{ tools: string[]; count: number }>;
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    achieved: boolean;
    progress?: number;
  }>;
}

// Helper to verify profile ownership
async function verifyProfileOwnership(
  profileUuid: string,
  userId: string
): Promise<boolean> {
  const profile = await db
    .select({ uuid: profilesTable.uuid })
    .from(profilesTable)
    .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
    .where(and(eq(profilesTable.uuid, profileUuid), eq(projectsTable.user_id, userId)))
    .limit(1);

  return profile.length > 0;
}

// Helper to get date cutoff based on period
function getDateCutoff(period: TimePeriod): Date | null {
  if (period === 'all') return null;

  const cutoff = new Date();
  switch (period) {
    case '7d':
      cutoff.setDate(cutoff.getDate() - 7);
      break;
    case '30d':
      cutoff.setDate(cutoff.getDate() - 30);
      break;
    case '90d':
      cutoff.setDate(cutoff.getDate() - 90);
      break;
  }
  return cutoff;
}

// Helper to get comparison period cutoff
function getComparisonCutoff(period: TimePeriod): { start: Date; end: Date } | null {
  if (period === 'all') return null;

  const end = getDateCutoff(period);
  if (!end) return null;

  const start = new Date(end);
  switch (period) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
  }

  return { start, end };
}

export async function getOverviewMetrics(
  profileUuid: string,
  period: TimePeriod = '7d'
): Promise<{ success: boolean; data?: OverviewMetrics; error?: string }> {
  try {
    // Validate inputs
    const validatedUuid = uuidSchema.parse(profileUuid);
    const validatedPeriod = periodSchema.parse(period);

    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Rate limiting - 30 requests per minute per user
    const rateLimitKey = `analytics:overview:${session.user.id}`;
    const rateLimit = await rateLimiter.check(rateLimitKey, 30, 60);
    if (!rateLimit.success) {
      return { success: false, error: 'Rate limit exceeded. Please try again later.' };
    }

    // Verify profile ownership
    const hasAccess = await verifyProfileOwnership(validatedUuid, session.user.id);
    if (!hasAccess) {
      return { success: false, error: 'Profile not found or unauthorized' };
    }

    const cutoff = getDateCutoff(validatedPeriod);
    const comparisonPeriod = getComparisonCutoff(validatedPeriod);

    // Get current period metrics
    const currentConditions = [eq(mcpActivityTable.profile_uuid, validatedUuid)];
    if (cutoff) {
      currentConditions.push(gte(mcpActivityTable.created_at, cutoff));
    }

    const [currentMetrics] = await db
      .select({
        totalToolCalls: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'tool_call' THEN 1 END)`,
        totalRagSearches: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'resource_read' AND ${mcpActivityTable.item_name} LIKE '%rag%' THEN 1 END)`,
      })
      .from(mcpActivityTable)
      .where(and(...currentConditions));

    // Get comparison metrics for trends
    let previousToolCalls = 0;
    let previousRagSearches = 0;

    if (comparisonPeriod) {
      const [previousMetrics] = await db
        .select({
          toolCalls: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'tool_call' THEN 1 END)`,
          ragSearches: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'resource_read' AND ${mcpActivityTable.item_name} LIKE '%rag%' THEN 1 END)`,
        })
        .from(mcpActivityTable)
        .where(
          and(
            eq(mcpActivityTable.profile_uuid, validatedUuid),
            gte(mcpActivityTable.created_at, comparisonPeriod.start),
            sql`${mcpActivityTable.created_at} < ${comparisonPeriod.end}`
          )
        );

      previousToolCalls = Number(previousMetrics?.toolCalls || 0);
      previousRagSearches = Number(previousMetrics?.ragSearches || 0);
    }

    // Calculate trends
    const toolCallsTrend = previousToolCalls > 0
      ? ((currentMetrics.totalToolCalls - previousToolCalls) / previousToolCalls) * 100
      : 0;
    const ragSearchesTrend = previousRagSearches > 0
      ? ((currentMetrics.totalRagSearches - previousRagSearches) / previousRagSearches) * 100
      : 0;

    // Get document counts
    const docConditions = [eq(docsTable.profile_uuid, validatedUuid)];
    if (cutoff) {
      docConditions.push(gte(docsTable.created_at, cutoff));
    }

    const [docMetrics] = await db
      .select({
        total: count(),
        totalSize: sql<number>`COALESCE(SUM(${docsTable.file_size}), 0)`,
      })
      .from(docsTable)
      .where(and(...docConditions));

    const totalDocuments = docMetrics?.total || 0;
    const storageUsed = Number(docMetrics?.totalSize || 0);

    // Get previous document count for trend
    let previousDocCount = 0;
    if (comparisonPeriod) {
      const [prevDocs] = await db
        .select({ count: count() })
        .from(docsTable)
        .where(
          and(
            eq(docsTable.profile_uuid, validatedUuid),
            gte(docsTable.created_at, comparisonPeriod.start),
            sql`${docsTable.created_at} < ${comparisonPeriod.end}`
          )
        );
      previousDocCount = prevDocs?.count || 0;
    }

    const documentsTrend = previousDocCount > 0
      ? ((totalDocuments - previousDocCount) / previousDocCount) * 100
      : 0;

    // Get most used server
    const serverActivity = await db
      .select({
        serverName: mcpServersTable.name,
        serverUuid: mcpActivityTable.server_uuid,
        count: count(),
      })
      .from(mcpActivityTable)
      .leftJoin(mcpServersTable, eq(mcpActivityTable.server_uuid, mcpServersTable.uuid))
      .where(and(...currentConditions))
      .groupBy(mcpServersTable.name, mcpActivityTable.server_uuid)
      .orderBy(desc(count()))
      .limit(1);

    const mostUsedServer = serverActivity[0]
      ? {
          name: serverActivity[0].serverName || serverActivity[0].serverUuid || 'Unknown',
          count: serverActivity[0].count,
        }
      : null;

    // Get daily activity for chart
    const dailyActivity = await db
      .select({
        date: sql<string>`DATE(${mcpActivityTable.created_at})`,
        toolCalls: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'tool_call' THEN 1 END)`,
        ragSearches: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'resource_read' AND ${mcpActivityTable.item_name} LIKE '%rag%' THEN 1 END)`,
      })
      .from(mcpActivityTable)
      .where(and(...currentConditions))
      .groupBy(sql`DATE(${mcpActivityTable.created_at})`)
      .orderBy(sql`DATE(${mcpActivityTable.created_at})`);

    return {
      success: true,
      data: {
        totalToolCalls: Number(currentMetrics.totalToolCalls),
        toolCallsTrend,
        totalDocuments,
        documentsTrend,
        totalRagSearches: Number(currentMetrics.totalRagSearches),
        ragSearchesTrend,
        mostUsedServer,
        storageUsed,
        dailyActivity: dailyActivity.map(d => ({
          date: d.date,
          toolCalls: Number(d.toolCalls),
          ragSearches: Number(d.ragSearches),
        })),
      },
    };
  } catch (error) {
    // Log detailed error server-side
    console.error('Error fetching overview metrics:', error);

    // Return generic error to client, specific error for validation
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Invalid input: ${error.errors[0].message}`,
      };
    }

    return {
      success: false,
      error: 'Failed to fetch analytics data. Please try again later.',
    };
  }
}

export async function getToolAnalytics(
  profileUuid: string,
  period: TimePeriod = '7d',
  serverUuid?: string
): Promise<{ success: boolean; data?: ToolAnalytics; error?: string }> {
  try {
    // Validate inputs
    const validatedUuid = uuidSchema.parse(profileUuid);
    const validatedPeriod = periodSchema.parse(period);
    const validatedServerUuid = serverUuid ? serverUuidSchema.parse(serverUuid) : undefined;

    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Rate limiting - 30 requests per minute per user
    const rateLimitKey = `analytics:tools:${session.user.id}`;
    const rateLimit = await rateLimiter.check(rateLimitKey, 30, 60);
    if (!rateLimit.success) {
      return { success: false, error: 'Rate limit exceeded. Please try again later.' };
    }

    // Verify profile ownership
    const hasAccess = await verifyProfileOwnership(validatedUuid, session.user.id);
    if (!hasAccess) {
      return { success: false, error: 'Profile not found or unauthorized' };
    }

    const cutoff = getDateCutoff(validatedPeriod);
    const conditions = [eq(mcpActivityTable.profile_uuid, validatedUuid)];

    if (cutoff) {
      conditions.push(gte(mcpActivityTable.created_at, cutoff));
    }

    if (validatedServerUuid) {
      conditions.push(eq(mcpActivityTable.server_uuid, validatedServerUuid));
    }

    // Get top tools
    const topToolsData = await db
      .select({
        name: mcpActivityTable.item_name,
        serverName: sql<string>`COALESCE(${mcpActivityTable.external_id}, ${mcpActivityTable.server_uuid}::text, 'Unknown')`,
        count: count(),
      })
      .from(mcpActivityTable)
      .where(
        and(
          ...conditions,
          eq(mcpActivityTable.action, 'tool_call'),
          sql`${mcpActivityTable.item_name} IS NOT NULL`
        )
      )
      .groupBy(mcpActivityTable.item_name, sql`COALESCE(${mcpActivityTable.external_id}, ${mcpActivityTable.server_uuid}::text, 'Unknown')`)
      .orderBy(desc(count()))
      .limit(10);

    const topTools = topToolsData.map(t => ({
      name: t.name || 'Unknown',
      serverName: t.serverName,
      count: t.count,
      successRate: 100, // TODO: Track success/failure in activity table
    }));

    // Get server activity breakdown
    const serverActivityData = await db
      .select({
        serverName: sql<string>`COALESCE(${mcpActivityTable.external_id}, ${mcpActivityTable.server_uuid}::text, 'Unknown')`,
        toolCalls: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'tool_call' THEN 1 END)`,
        resourceReads: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'resource_read' THEN 1 END)`,
        promptGets: sql<number>`COUNT(CASE WHEN ${mcpActivityTable.action} = 'prompt_get' THEN 1 END)`,
        totalActivity: count(),
      })
      .from(mcpActivityTable)
      .where(and(...conditions))
      .groupBy(sql`COALESCE(${mcpActivityTable.external_id}, ${mcpActivityTable.server_uuid}::text, 'Unknown')`)
      .orderBy(desc(count()))
      .limit(10);

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
          eq(mcpActivityTable.profile_uuid, validatedUuid),
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
      success: true,
      data: {
        topTools,
        serverActivity,
        hourlyDistribution,
        activityHeatmap,
      },
    };
  } catch (error) {
    // Log detailed error server-side
    console.error('Error fetching tool analytics:', error);

    // Return generic error to client, specific error for validation
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: `Invalid input: ${error.errors[0].message}`,
      };
    }

    return {
      success: false,
      error: 'Failed to fetch analytics data. Please try again later.',
    };
  }
}

export async function getRagAnalytics(
  profileUuid: string,
  period: TimePeriod = '7d'
): Promise<{ success: boolean; data?: RagAnalytics; error?: string }> {
  try {
    // Validate inputs
    const validatedUuid = uuidSchema.parse(profileUuid);
    const validatedPeriod = periodSchema.parse(period);

    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Rate limiting - 30 requests per minute per user
    const rateLimitKey = `analytics:rag:${session.user.id}`;
    const rateLimit = await rateLimiter.check(rateLimitKey, 30, 60);
    if (!rateLimit.success) {
      return { success: false, error: 'Rate limit exceeded. Please try again later.' };
    }

    // Verify profile ownership
    const hasAccess = await verifyProfileOwnership(validatedUuid, session.user.id);
    if (!hasAccess) {
      return { success: false, error: 'Profile not found or unauthorized' };
    }

    const cutoff = getDateCutoff(validatedPeriod);
    const docConditions = [eq(docsTable.profile_uuid, validatedUuid)];

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

    // Get RAG search frequency from activity log
    const ragSearchData = await db
      .select({
        date: sql<string>`DATE(${mcpActivityTable.created_at})`,
        count: count(),
      })
      .from(mcpActivityTable)
      .where(
        and(
          eq(mcpActivityTable.profile_uuid, validatedUuid),
          eq(mcpActivityTable.action, 'resource_read'),
          sql`${mcpActivityTable.item_name} LIKE '%rag%' OR ${mcpActivityTable.item_name} LIKE '%search%'`,
          cutoff ? gte(mcpActivityTable.created_at, cutoff) : sql`true`
        )
      )
      .groupBy(sql`DATE(${mcpActivityTable.created_at})`)
      .orderBy(sql`DATE(${mcpActivityTable.created_at})`);

    const ragSearchFrequency = ragSearchData.map(d => ({
      date: d.date,
      count: d.count,
    }));

    // Get most accessed documents (approximation based on activity)
    const mostAccessedDocs = await db
      .select({
        name: docsTable.name,
        count: sql<number>`1`, // Placeholder - need to track actual access
      })
      .from(docsTable)
      .where(and(...docConditions))
      .orderBy(desc(docsTable.created_at))
      .limit(10);

    return {
      success: true,
      data: {
        totalDocuments: docStats?.total || 0,
        aiGeneratedCount: Number(docStats?.aiGenerated || 0),
        uploadedCount: Number(docStats?.uploaded || 0),
        storageBreakdown: {
          files: Number(docStats?.totalSize || 0),
          ragVectors: 0, // TODO: Get from RAG service
        },
        documentsByModel,
        ragSearchFrequency,
        mostAccessedDocs: mostAccessedDocs.map(d => ({
          name: d.name,
          accessCount: Number(d.count),
        })),
      },
    };
  } catch (error) {
    console.error('Error fetching RAG analytics:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: `Invalid input: ${error.errors[0].message}` };
    }
    return { success: false, error: 'Failed to fetch analytics data. Please try again later.' };
  }
}

export async function getProductivityMetrics(
  profileUuid: string,
  period: TimePeriod = '30d'
): Promise<{ success: boolean; data?: ProductivityMetrics; error?: string }> {
  try {
    // Validate inputs
    const validatedUuid = uuidSchema.parse(profileUuid);
    const validatedPeriod = periodSchema.parse(period);

    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Rate limiting - 30 requests per minute per user
    const rateLimitKey = `analytics:productivity:${session.user.id}`;
    const rateLimit = await rateLimiter.check(rateLimitKey, 30, 60);
    if (!rateLimit.success) {
      return { success: false, error: 'Rate limit exceeded. Please try again later.' };
    }

    // Verify profile ownership
    const hasAccess = await verifyProfileOwnership(validatedUuid, session.user.id);
    if (!hasAccess) {
      return { success: false, error: 'Profile not found or unauthorized' };
    }

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
          eq(mcpActivityTable.profile_uuid, validatedUuid),
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
      .where(eq(mcpActivityTable.profile_uuid, validatedUuid))
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
      .where(eq(mcpActivityTable.profile_uuid, validatedUuid))
      .groupBy(sql`TO_CHAR(${mcpActivityTable.created_at}, 'Day')`)
      .orderBy(desc(count()))
      .limit(1);

    const mostProductiveDay = dayData?.day?.trim() || 'Monday';

    // Calculate averages
    const cutoff = getDateCutoff(validatedPeriod);
    const conditions = [eq(mcpActivityTable.profile_uuid, validatedUuid)];
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

    // Get document creation rate
    const [docStats] = await db
      .select({
        count: count(),
        days: sql<number>`EXTRACT(EPOCH FROM AGE(CURRENT_DATE, MIN(${docsTable.created_at}))) / 86400`,
      })
      .from(docsTable)
      .where(eq(docsTable.profile_uuid, validatedUuid));

    const avgDocumentsPerWeek = docStats?.days && Number(docStats.days) > 0
      ? (docStats.count / (Number(docStats.days) / 7))
      : 0;

    // Define achievements
    const achievements = [
      {
        id: 'first_tool_call',
        title: 'First Steps',
        description: 'Make your first tool call',
        achieved: Number(activityStats?.totalToolCalls || 0) > 0,
      },
      {
        id: 'tool_master',
        title: 'Tool Master',
        description: 'Make 100 tool calls',
        achieved: Number(activityStats?.totalToolCalls || 0) >= 100,
        progress: Math.min(Number(activityStats?.totalToolCalls || 0) / 100 * 100, 100),
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
      success: true,
      data: {
        activeStreak,
        mostProductiveHour,
        mostProductiveDay,
        avgToolCallsPerDay: Math.round(avgToolCallsPerDay * 10) / 10,
        avgDocumentsPerWeek: Math.round(avgDocumentsPerWeek * 10) / 10,
        toolCombinations: [], // TODO: Implement tool combination tracking
        achievements,
      },
    };
  } catch (error) {
    console.error('Error fetching productivity metrics:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: `Invalid input: ${error.errors[0].message}` };
    }
    return { success: false, error: 'Failed to fetch analytics data. Please try again later.' };
  }
}

interface ToolCallLogEntry {
  id: number;
  timestamp: Date;
  action: string;
  tool_name: string | null;
  server_name: string | null;
  server_uuid: string | null;
  external_id: string | null;
}

export async function getRecentToolCalls(
  profileUuid: string,
  limit: number = 50
): Promise<{ success: boolean; data?: ToolCallLogEntry[]; error?: string }> {
  try {
    // Validate inputs
    const validatedUuid = uuidSchema.parse(profileUuid);
    const validatedLimit = limitSchema.parse(limit);

    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Rate limiting - 30 requests per minute per user
    const rateLimitKey = `analytics:toolCalls:${session.user.id}`;
    const rateLimit = await rateLimiter.check(rateLimitKey, 30, 60);
    if (!rateLimit.success) {
      return { success: false, error: 'Rate limit exceeded. Please try again later.' };
    }

    // Verify profile ownership
    const hasAccess = await verifyProfileOwnership(validatedUuid, session.user.id);
    if (!hasAccess) {
      return { success: false, error: 'Profile not found or unauthorized' };
    }

    // Get recent tool call activity
    const recentCalls = await db
      .select({
        id: mcpActivityTable.id,
        timestamp: mcpActivityTable.created_at,
        action: mcpActivityTable.action,
        tool_name: mcpActivityTable.item_name,
        server_name: mcpServersTable.name,
        server_uuid: mcpActivityTable.server_uuid,
        external_id: mcpActivityTable.external_id,
      })
      .from(mcpActivityTable)
      .leftJoin(mcpServersTable, eq(mcpActivityTable.server_uuid, mcpServersTable.uuid))
      .where(
        and(
          eq(mcpActivityTable.profile_uuid, validatedUuid),
          eq(mcpActivityTable.action, 'tool_call')
        )
      )
      .orderBy(desc(mcpActivityTable.created_at))
      .limit(validatedLimit);

    return {
      success: true,
      data: recentCalls.map(call => ({
        id: call.id,
        timestamp: call.timestamp,
        action: call.action,
        tool_name: call.tool_name,
        server_name: call.server_name,
        server_uuid: call.server_uuid,
        external_id: call.external_id,
      })),
    };
  } catch (error) {
    console.error('Error fetching recent tool calls:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: `Invalid input: ${error.errors[0].message}` };
    }
    return { success: false, error: 'Failed to fetch analytics data. Please try again later.' };
  }
}