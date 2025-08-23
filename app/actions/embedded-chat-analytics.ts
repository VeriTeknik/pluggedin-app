'use server';

import { and, count,desc, eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '@/db';
import { 
  chatAnalyticsTable,
  chatConversationsTable, 
  chatMessagesTable 
} from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

// Dashboard Metrics
export async function getDashboardMetrics(chatUuid: string) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get active conversations count - exclude stale ones
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const [activeCount] = await db
      .select({ count: count() })
      .from(chatConversationsTable)
      .where(and(
        eq(chatConversationsTable.embedded_chat_uuid, chatUuid),
        eq(chatConversationsTable.status, 'active'),
        gte(chatConversationsTable.last_heartbeat, thirtyMinutesAgo)
      ));

    // Get today's conversations
    const [todayConversations] = await db
      .select({ count: count() })
      .from(chatConversationsTable)
      .where(and(
        eq(chatConversationsTable.embedded_chat_uuid, chatUuid),
        gte(chatConversationsTable.started_at, today)
      ));

    // Get today's messages
    const todayMessages = await db
      .select({ 
        count: sql<number>`COUNT(${chatMessagesTable.id})` 
      })
      .from(chatMessagesTable)
      .innerJoin(
        chatConversationsTable,
        eq(chatMessagesTable.conversation_uuid, chatConversationsTable.uuid)
      )
      .where(and(
        eq(chatConversationsTable.embedded_chat_uuid, chatUuid),
        gte(chatMessagesTable.created_at, today)
      ));

    // Get analytics for today (if exists)
    const [todayAnalytics] = await db
      .select()
      .from(chatAnalyticsTable)
      .where(and(
        eq(chatAnalyticsTable.embedded_chat_uuid, chatUuid),
        eq(chatAnalyticsTable.date, today)
      ))
      .limit(1);

    return {
      success: true,
      data: {
        activeConversations: activeCount?.count || 0,
        todayConversations: todayConversations?.count || 0,
        todayMessages: todayMessages[0]?.count || 0,
        avgResponseTime: todayAnalytics?.avg_response_time || 0,
        humanInterventions: todayAnalytics?.human_interventions || 0,
        satisfactionScore: todayAnalytics?.conversation_completion_rate || 0,
      }
    };
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch metrics' 
    };
  }
}

// Get Recent Conversations
export async function getRecentConversations(chatUuid: string, limit: number = 20) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const conversations = await db
      .select({
        uuid: chatConversationsTable.uuid,
        visitor_id: chatConversationsTable.visitor_id,
        visitor_name: chatConversationsTable.visitor_name,
        visitor_email: chatConversationsTable.visitor_email,
        authenticated_user_id: chatConversationsTable.authenticated_user_id,
        authenticated_user_name: chatConversationsTable.authenticated_user_name,
        authenticated_user_avatar: chatConversationsTable.authenticated_user_avatar,
        started_at: chatConversationsTable.started_at,
        ended_at: chatConversationsTable.ended_at,
        status: chatConversationsTable.status,
        page_url: chatConversationsTable.page_url,
        last_heartbeat: chatConversationsTable.last_heartbeat,
        message_count: sql<number>`(
          SELECT COUNT(*) FROM ${chatMessagesTable} 
          WHERE ${chatMessagesTable.conversation_uuid} = ${chatConversationsTable.uuid}
        )`,
        last_message_at: sql<Date>`(
          SELECT MAX(${chatMessagesTable.created_at}) FROM ${chatMessagesTable} 
          WHERE ${chatMessagesTable.conversation_uuid} = ${chatConversationsTable.uuid}
        )`,
      })
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.embedded_chat_uuid, chatUuid))
      .orderBy(desc(chatConversationsTable.started_at))
      .limit(limit);

    // Fix status for stale conversations on the fly
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const processedConversations = conversations.map(conv => {
      // If conversation is marked as active but last heartbeat is over 30 minutes ago, mark it as ended
      if (conv.status === 'active' && conv.last_heartbeat && conv.last_heartbeat < thirtyMinutesAgo) {
        return { ...conv, status: 'ended' as const };
      }
      return conv;
    });

    return { success: true, data: processedConversations };
  } catch (error) {
    console.error('Error fetching recent conversations:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch conversations' 
    };
  }
}

// Get Active Conversations
export async function getActiveConversations(chatUuid: string) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Only get truly active conversations (heartbeat within last 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    const conversations = await db
      .select({
        uuid: chatConversationsTable.uuid,
        visitor_id: chatConversationsTable.visitor_id,
        visitor_name: chatConversationsTable.visitor_name,
        visitor_email: chatConversationsTable.visitor_email,
        authenticated_user_id: chatConversationsTable.authenticated_user_id,
        authenticated_user_name: chatConversationsTable.authenticated_user_name,
        authenticated_user_avatar: chatConversationsTable.authenticated_user_avatar,
        started_at: chatConversationsTable.started_at,
        status: chatConversationsTable.status,
        page_url: chatConversationsTable.page_url,
        last_heartbeat: chatConversationsTable.last_heartbeat,
        metadata: chatConversationsTable.metadata,
        message_count: sql<number>`(
          SELECT COUNT(*) FROM ${chatMessagesTable} 
          WHERE ${chatMessagesTable.conversation_uuid} = ${chatConversationsTable.uuid}
        )`,
        last_message_at: sql<Date>`(
          SELECT MAX(${chatMessagesTable.created_at}) FROM ${chatMessagesTable} 
          WHERE ${chatMessagesTable.conversation_uuid} = ${chatConversationsTable.uuid}
        )`,
      })
      .from(chatConversationsTable)
      .where(and(
        eq(chatConversationsTable.embedded_chat_uuid, chatUuid),
        eq(chatConversationsTable.status, 'active'),
        gte(chatConversationsTable.last_heartbeat, thirtyMinutesAgo)
      ))
      .orderBy(desc(chatConversationsTable.started_at));

    return { success: true, data: conversations };
  } catch (error) {
    console.error('Error fetching active conversations:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch active conversations' 
    };
  }
}

// Get Conversation by ID
export async function getConversationById(conversationUuid: string) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const [conversation] = await db
      .select()
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.uuid, conversationUuid))
      .limit(1);

    if (!conversation) {
      return { success: false, error: 'Conversation not found' };
    }

    // Get messages
    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.conversation_uuid, conversationUuid))
      .orderBy(chatMessagesTable.created_at);

    return { 
      success: true, 
      data: {
        conversation,
        messages
      }
    };
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch conversation' 
    };
  }
}

// Get Analytics by Date Range
export async function getAnalyticsByDateRange(
  chatUuid: string, 
  startDate: Date, 
  endDate: Date
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const analytics = await db
      .select()
      .from(chatAnalyticsTable)
      .where(and(
        eq(chatAnalyticsTable.embedded_chat_uuid, chatUuid),
        gte(chatAnalyticsTable.date, startDate),
        lte(chatAnalyticsTable.date, endDate)
      ))
      .orderBy(chatAnalyticsTable.date);

    // Aggregate data
    const totals = analytics.reduce((acc, day) => ({
      conversations: acc.conversations + (day.conversations_started || 0),
      messages_sent: acc.messages_sent + (day.messages_sent || 0),
      messages_received: acc.messages_received + (day.messages_received || 0),
      rag_queries: acc.rag_queries + (day.rag_queries || 0),
      human_interventions: acc.human_interventions + (day.human_interventions || 0),
      tokens_used: acc.tokens_used + Object.values(day.tokens_used || {}).reduce((sum: number, val: any) => sum + val, 0),
      estimated_cost: acc.estimated_cost + Number(day.estimated_cost || 0),
    }), {
      conversations: 0,
      messages_sent: 0,
      messages_received: 0,
      rag_queries: 0,
      human_interventions: 0,
      tokens_used: 0,
      estimated_cost: 0,
    });

    return { 
      success: true, 
      data: {
        daily: analytics,
        totals
      }
    };
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch analytics' 
    };
  }
}

// Search Conversations
export async function searchConversations(
  chatUuid: string,
  query: string,
  filters?: {
    status?: string;
    startDate?: Date;
    endDate?: Date;
    hasHumanIntervention?: boolean;
  }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    const baseQuery = db
      .select({
        uuid: chatConversationsTable.uuid,
        visitor_id: chatConversationsTable.visitor_id,
        visitor_name: chatConversationsTable.visitor_name,
        visitor_email: chatConversationsTable.visitor_email,
        started_at: chatConversationsTable.started_at,
        ended_at: chatConversationsTable.ended_at,
        status: chatConversationsTable.status,
        page_url: chatConversationsTable.page_url,
        message_count: sql<number>`(
          SELECT COUNT(*) FROM ${chatMessagesTable} 
          WHERE ${chatMessagesTable.conversation_uuid} = ${chatConversationsTable.uuid}
        )`,
      })
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.embedded_chat_uuid, chatUuid));

    // Apply filters
    const conditions = [eq(chatConversationsTable.embedded_chat_uuid, chatUuid)];

    if (filters?.status) {
      conditions.push(eq(chatConversationsTable.status, filters.status as any));
    }

    if (filters?.startDate) {
      conditions.push(gte(chatConversationsTable.started_at, filters.startDate));
    }

    if (filters?.endDate) {
      conditions.push(lte(chatConversationsTable.started_at, filters.endDate));
    }

    // Search in visitor info
    if (query) {
      conditions.push(
        sql`(
          ${chatConversationsTable.visitor_name} ILIKE ${`%${query}%`} OR
          ${chatConversationsTable.visitor_email} ILIKE ${`%${query}%`} OR
          ${chatConversationsTable.visitor_id} ILIKE ${`%${query}%`}
        )`
      );
    }

    const conversations = await db
      .select({
        uuid: chatConversationsTable.uuid,
        visitor_id: chatConversationsTable.visitor_id,
        visitor_name: chatConversationsTable.visitor_name,
        visitor_email: chatConversationsTable.visitor_email,
        started_at: chatConversationsTable.started_at,
        ended_at: chatConversationsTable.ended_at,
        status: chatConversationsTable.status,
        page_url: chatConversationsTable.page_url,
        message_count: sql<number>`(
          SELECT COUNT(*) FROM ${chatMessagesTable} 
          WHERE ${chatMessagesTable.conversation_uuid} = ${chatConversationsTable.uuid}
        )`,
      })
      .from(chatConversationsTable)
      .where(and(...conditions))
      .orderBy(desc(chatConversationsTable.started_at))
      .limit(100);

    return { success: true, data: conversations };
  } catch (error) {
    console.error('Error searching conversations:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to search conversations' 
    };
  }
}