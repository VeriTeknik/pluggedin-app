'use server';

import { and, desc,eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '@/db';
import { tokenUsageTable } from '@/db/schema';
import { formatCost, getModelDisplayName } from '@/lib/token-pricing';

/**
 * Get token usage summary for a profile
 */
export async function getProfileTokenUsage(
  profileUuid: string,
  startDate?: Date,
  endDate?: Date
) {
  try {
    const conditions = [eq(tokenUsageTable.profile_uuid, profileUuid)];
    
    if (startDate) {
      conditions.push(gte(tokenUsageTable.created_at, startDate));
    }
    if (endDate) {
      conditions.push(lte(tokenUsageTable.created_at, endDate));
    }
    
    // Get aggregated stats
    const stats = await db
      .select({
        totalTokens: sql<number>`SUM(${tokenUsageTable.total_tokens})`,
        totalCost: sql<number>`SUM(${tokenUsageTable.total_cost})`,
        totalRequests: sql<number>`COUNT(*)`,
        avgTokensPerRequest: sql<number>`AVG(${tokenUsageTable.total_tokens})`,
      })
      .from(tokenUsageTable)
      .where(and(...conditions));
    
    // Get breakdown by model
    const byModel = await db
      .select({
        provider: tokenUsageTable.provider,
        model: tokenUsageTable.model,
        totalTokens: sql<number>`SUM(${tokenUsageTable.total_tokens})`,
        totalCost: sql<number>`SUM(${tokenUsageTable.total_cost})`,
        requestCount: sql<number>`COUNT(*)`,
      })
      .from(tokenUsageTable)
      .where(and(...conditions))
      .groupBy(tokenUsageTable.provider, tokenUsageTable.model)
      .orderBy(desc(sql`SUM(${tokenUsageTable.total_cost})`));
    
    return {
      success: true,
      summary: {
        totalTokens: stats[0]?.totalTokens || 0,
        totalCost: stats[0]?.totalCost || 0,
        totalCostFormatted: formatCost(stats[0]?.totalCost || 0),
        totalRequests: stats[0]?.totalRequests || 0,
        avgTokensPerRequest: Math.round(stats[0]?.avgTokensPerRequest || 0),
      },
      byModel: byModel.map(m => ({
        ...m,
        modelDisplayName: getModelDisplayName(m.model),
        totalCostFormatted: formatCost(m.totalCost || 0),
        avgTokensPerRequest: Math.round((m.totalTokens || 0) / (m.requestCount || 1)),
      })),
    };
  } catch (error) {
    console.error('Failed to get profile token usage:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get token usage for an embedded chat
 */
export async function getEmbeddedChatTokenUsage(
  chatUuid: string,
  startDate?: Date,
  endDate?: Date
) {
  try {
    const conditions = [eq(tokenUsageTable.embedded_chat_uuid, chatUuid)];
    
    if (startDate) {
      conditions.push(gte(tokenUsageTable.created_at, startDate));
    }
    if (endDate) {
      conditions.push(lte(tokenUsageTable.created_at, endDate));
    }
    
    // Get aggregated stats
    const stats = await db
      .select({
        totalTokens: sql<number>`SUM(${tokenUsageTable.total_tokens})`,
        totalPromptTokens: sql<number>`SUM(${tokenUsageTable.prompt_tokens})`,
        totalCompletionTokens: sql<number>`SUM(${tokenUsageTable.completion_tokens})`,
        totalCost: sql<number>`SUM(${tokenUsageTable.total_cost})`,
        totalRequests: sql<number>`COUNT(*)`,
        uniqueConversations: sql<number>`COUNT(DISTINCT ${tokenUsageTable.conversation_uuid})`,
      })
      .from(tokenUsageTable)
      .where(and(...conditions));
    
    // Get daily usage trend (last 7 days)
    const dailyUsage = await db
      .select({
        date: sql<string>`DATE(${tokenUsageTable.created_at})`,
        totalTokens: sql<number>`SUM(${tokenUsageTable.total_tokens})`,
        totalCost: sql<number>`SUM(${tokenUsageTable.total_cost})`,
        requestCount: sql<number>`COUNT(*)`,
      })
      .from(tokenUsageTable)
      .where(and(...conditions))
      .groupBy(sql`DATE(${tokenUsageTable.created_at})`)
      .orderBy(sql`DATE(${tokenUsageTable.created_at})`);
    
    return {
      success: true,
      summary: {
        totalTokens: stats[0]?.totalTokens || 0,
        totalPromptTokens: stats[0]?.totalPromptTokens || 0,
        totalCompletionTokens: stats[0]?.totalCompletionTokens || 0,
        totalCost: stats[0]?.totalCost || 0,
        totalCostFormatted: formatCost(stats[0]?.totalCost || 0),
        totalRequests: stats[0]?.totalRequests || 0,
        uniqueConversations: stats[0]?.uniqueConversations || 0,
      },
      dailyUsage: dailyUsage.map(d => ({
        ...d,
        totalCostFormatted: formatCost(d.totalCost || 0),
      })),
    };
  } catch (error) {
    console.error('Failed to get embedded chat token usage:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get recent token usage entries
 */
export async function getRecentTokenUsage(
  profileUuid?: string,
  chatUuid?: string,
  limit = 50
) {
  try {
    const conditions = [];
    
    if (profileUuid) {
      conditions.push(eq(tokenUsageTable.profile_uuid, profileUuid));
    }
    if (chatUuid) {
      conditions.push(eq(tokenUsageTable.embedded_chat_uuid, chatUuid));
    }
    
    const usage = await db
      .select({
        id: tokenUsageTable.id,
        provider: tokenUsageTable.provider,
        model: tokenUsageTable.model,
        promptTokens: tokenUsageTable.prompt_tokens,
        completionTokens: tokenUsageTable.completion_tokens,
        totalTokens: tokenUsageTable.total_tokens,
        totalCost: tokenUsageTable.total_cost,
        contextType: tokenUsageTable.context_type,
        createdAt: tokenUsageTable.created_at,
        metadata: tokenUsageTable.metadata,
      })
      .from(tokenUsageTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tokenUsageTable.created_at))
      .limit(limit);
    
    return {
      success: true,
      usage: usage.map(u => ({
        ...u,
        modelDisplayName: getModelDisplayName(u.model),
        totalCostFormatted: formatCost(u.totalCost || 0),
      })),
    };
  } catch (error) {
    console.error('Failed to get recent token usage:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get token usage by provider
 */
export async function getTokenUsageByProvider(
  profileUuid?: string,
  startDate?: Date,
  endDate?: Date
) {
  try {
    const conditions = [];
    
    if (profileUuid) {
      conditions.push(eq(tokenUsageTable.profile_uuid, profileUuid));
    }
    if (startDate) {
      conditions.push(gte(tokenUsageTable.created_at, startDate));
    }
    if (endDate) {
      conditions.push(lte(tokenUsageTable.created_at, endDate));
    }
    
    const byProvider = await db
      .select({
        provider: tokenUsageTable.provider,
        totalTokens: sql<number>`SUM(${tokenUsageTable.total_tokens})`,
        totalPromptTokens: sql<number>`SUM(${tokenUsageTable.prompt_tokens})`,
        totalCompletionTokens: sql<number>`SUM(${tokenUsageTable.completion_tokens})`,
        totalCost: sql<number>`SUM(${tokenUsageTable.total_cost})`,
        requestCount: sql<number>`COUNT(*)`,
      })
      .from(tokenUsageTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(tokenUsageTable.provider)
      .orderBy(desc(sql`SUM(${tokenUsageTable.total_cost})`));
    
    return {
      success: true,
      byProvider: byProvider.map(p => ({
        ...p,
        totalCostFormatted: formatCost(p.totalCost || 0),
        avgTokensPerRequest: Math.round((p.totalTokens || 0) / (p.requestCount || 1)),
        promptCompletionRatio: p.totalPromptTokens && p.totalCompletionTokens
          ? (p.totalPromptTokens / p.totalCompletionTokens).toFixed(2)
          : 'N/A',
      })),
    };
  } catch (error) {
    console.error('Failed to get token usage by provider:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}