import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { 
  chatConversationsTable, 
  embeddedChatsTable, 
  projectsTable,
  chatMessagesTable 
} from '@/db/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { createApiError } from '@/lib/api-errors';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        createApiError('Unauthorized', 401),
        { status: 401 }
      );
    }
    
    // Get user's projects
    const userProjects = await db
      .select({ uuid: projectsTable.uuid })
      .from(projectsTable)
      .where(eq(projectsTable.user_id, session.user.id));
    
    if (userProjects.length === 0) {
      return NextResponse.json({ conversations: [] });
    }
    
    const projectUuids = userProjects.map(p => p.uuid);
    
    // Get active conversations from user's embedded chats
    // Include conversations from the last 24 hours
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const conversations = await db
      .select({
        conversation: chatConversationsTable,
        chat: {
          uuid: embeddedChatsTable.uuid,
          name: embeddedChatsTable.name,
        },
        message_count: sql<number>`(
          SELECT COUNT(*) 
          FROM ${chatMessagesTable} 
          WHERE ${chatMessagesTable.conversation_uuid} = ${chatConversationsTable.uuid}
        )`.as('message_count'),
        last_message: sql<string>`(
          SELECT ${chatMessagesTable.content}
          FROM ${chatMessagesTable}
          WHERE ${chatMessagesTable.conversation_uuid} = ${chatConversationsTable.uuid}
          ORDER BY ${chatMessagesTable.created_at} DESC
          LIMIT 1
        )`.as('last_message'),
      })
      .from(chatConversationsTable)
      .innerJoin(
        embeddedChatsTable,
        eq(chatConversationsTable.embedded_chat_uuid, embeddedChatsTable.uuid)
      )
      .where(
        and(
          sql`${embeddedChatsTable.project_uuid} = ANY(${projectUuids})`,
          gte(chatConversationsTable.started_at, cutoffTime)
        )
      )
      .orderBy(desc(chatConversationsTable.last_heartbeat))
      .limit(50);
    
    // Format response
    const formattedConversations = conversations.map(({ conversation, chat, message_count, last_message }) => ({
      ...conversation,
      chat_name: chat.name,
      message_count,
      last_message,
    }));
    
    return NextResponse.json({ 
      conversations: formattedConversations,
      total: formattedConversations.length 
    });
    
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      createApiError('Failed to fetch conversations'),
      { status: 500 }
    );
  }
}