import { and, eq, gte, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { 
  chatConversationsTable, 
  chatMessagesTable,
  embeddedChatsTable,
  projectsTable 
} from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid } = await params;
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversation');

    // Verify ownership
    const ownership = await db
      .select()
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(and(
        eq(embeddedChatsTable.uuid, uuid),
        eq(projectsTable.user_id, session.user.id)
      ))
      .limit(1);

    if (ownership.length === 0) {
      return NextResponse.json({ error: 'Embedded chat not found' }, { status: 404 });
    }

    // If specific conversation requested, get its details
    if (conversationId) {
      const conversation = await db
        .select({
          uuid: chatConversationsTable.uuid,
          visitor_id: chatConversationsTable.visitor_id,
          visitor_name: chatConversationsTable.visitor_name,
          visitor_email: chatConversationsTable.visitor_email,
          authenticated_user_id: chatConversationsTable.authenticated_user_id,
          authenticated_user_name: chatConversationsTable.authenticated_user_name,
          started_at: chatConversationsTable.started_at,
          status: chatConversationsTable.status,
          page_url: chatConversationsTable.page_url,
          last_heartbeat: chatConversationsTable.last_heartbeat,
          assigned_user_id: chatConversationsTable.assigned_user_id,
          metadata: chatConversationsTable.metadata,
          message_count: sql<number>`(
            SELECT COUNT(*) FROM ${chatMessagesTable} 
            WHERE ${chatMessagesTable.conversation_uuid} = ${chatConversationsTable.uuid}
          )`,
          last_message: sql<string>`(
            SELECT ${chatMessagesTable.content} FROM ${chatMessagesTable} 
            WHERE ${chatMessagesTable.conversation_uuid} = ${chatConversationsTable.uuid}
            ORDER BY ${chatMessagesTable.created_at} DESC
            LIMIT 1
          )`,
          last_message_at: sql<Date>`(
            SELECT MAX(${chatMessagesTable.created_at}) FROM ${chatMessagesTable} 
            WHERE ${chatMessagesTable.conversation_uuid} = ${chatConversationsTable.uuid}
          )`,
          agent_typing: sql<boolean>`FALSE` // Will be updated with real typing status
        })
        .from(chatConversationsTable)
        .where(and(
          eq(chatConversationsTable.uuid, conversationId),
          eq(chatConversationsTable.embedded_chat_uuid, uuid)
        ))
        .limit(1);

      if (conversation.length === 0) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }

      return NextResponse.json({ conversation: conversation[0] });
    }

    // Get all active conversations for monitoring
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    const conversations = await db
      .select({
        uuid: chatConversationsTable.uuid,
        visitor_id: chatConversationsTable.visitor_id,
        visitor_name: chatConversationsTable.visitor_name,
        visitor_email: chatConversationsTable.visitor_email,
        authenticated_user_id: chatConversationsTable.authenticated_user_id,
        authenticated_user_name: chatConversationsTable.authenticated_user_name,
        started_at: chatConversationsTable.started_at,
        status: chatConversationsTable.status,
        page_url: chatConversationsTable.page_url,
        last_heartbeat: chatConversationsTable.last_heartbeat,
        assigned_user_id: chatConversationsTable.assigned_user_id,
        metadata: chatConversationsTable.metadata,
        message_count: sql<number>`(
          SELECT COUNT(*) FROM ${chatMessagesTable} 
          WHERE ${chatMessagesTable.conversation_uuid} = ${chatConversationsTable.uuid}
        )`,
        last_message: sql<string>`(
          SELECT ${chatMessagesTable.content} FROM ${chatMessagesTable} 
          WHERE ${chatMessagesTable.conversation_uuid} = ${chatConversationsTable.uuid}
          ORDER BY ${chatMessagesTable.created_at} DESC
          LIMIT 1
        )`,
        last_message_at: sql<Date>`(
          SELECT MAX(${chatMessagesTable.created_at}) FROM ${chatMessagesTable} 
          WHERE ${chatMessagesTable.conversation_uuid} = ${chatConversationsTable.uuid}
        )`,
        agent_typing: sql<boolean>`FALSE` // Will be updated with real typing status
      })
      .from(chatConversationsTable)
      .where(and(
        eq(chatConversationsTable.embedded_chat_uuid, uuid),
        gte(chatConversationsTable.last_heartbeat, thirtyMinutesAgo)
      ))
      .orderBy(chatConversationsTable.started_at);

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('Error fetching monitor data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}