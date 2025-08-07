import { and, asc,eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { db } from '@/db';
import { 
  chatConversationsTable,
  chatMessagesTable,
  embeddedChatsTable,
  projectsTable
} from '@/db/schema';
import { createApiError } from '@/lib/api-errors';
import { authOptions } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        createApiError('Unauthorized', 401),
        { status: 401 }
      );
    }
    
    const { conversationId } = params;
    
    // Verify user has access to this conversation
    const [conversation] = await db
      .select({
        conversation: chatConversationsTable,
        project_user_id: projectsTable.user_id,
      })
      .from(chatConversationsTable)
      .innerJoin(
        embeddedChatsTable,
        eq(chatConversationsTable.embedded_chat_uuid, embeddedChatsTable.uuid)
      )
      .innerJoin(
        projectsTable,
        eq(embeddedChatsTable.project_uuid, projectsTable.uuid)
      )
      .where(
        and(
          eq(chatConversationsTable.uuid, conversationId),
          eq(projectsTable.user_id, session.user.id)
        )
      )
      .limit(1);
    
    if (!conversation) {
      return NextResponse.json(
        createApiError('Conversation not found', 404),
        { status: 404 }
      );
    }
    
    // Get messages for this conversation
    const messages = await db
      .select({
        id: chatMessagesTable.id,
        conversation_uuid: chatMessagesTable.conversation_uuid,
        role: chatMessagesTable.role,
        content: chatMessagesTable.content,
        created_at: chatMessagesTable.created_at,
        created_by: chatMessagesTable.created_by,
        is_internal: chatMessagesTable.is_internal,
        model_provider: chatMessagesTable.model_provider,
        model_name: chatMessagesTable.model_name,
      })
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.conversation_uuid, conversationId))
      .orderBy(asc(chatMessagesTable.created_at));
    
    return NextResponse.json({ 
      messages,
      conversation: conversation.conversation,
      total: messages.length 
    });
    
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      createApiError('Failed to fetch messages'),
      { status: 500 }
    );
  }
}