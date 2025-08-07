import { and, eq, desc } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { 
  chatConversationsTable,
  chatMessagesTable,
  embeddedChatsTable,
  projectsTable 
} from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

const SendMessageSchema = z.object({
  content: z.string().min(1),
  role: z.enum(['human', 'system']).default('human'),
  created_by: z.enum(['human', 'system']).default('human'),
  is_internal: z.boolean().default(false),
});

// Get messages for a conversation
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string; conversationId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid, conversationId } = await params;

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

    // Verify conversation belongs to this chat
    const [conversation] = await db
      .select()
      .from(chatConversationsTable)
      .where(and(
        eq(chatConversationsTable.uuid, conversationId),
        eq(chatConversationsTable.embedded_chat_uuid, uuid)
      ))
      .limit(1);

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Get messages
    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.conversation_uuid, conversationId))
      .orderBy(chatMessagesTable.created_at);

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Send a message in a conversation
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string; conversationId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid, conversationId } = await params;
    const body = await req.json();
    const validatedData = SendMessageSchema.parse(body);

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

    // Verify conversation belongs to this chat and is human controlled
    const [conversation] = await db
      .select()
      .from(chatConversationsTable)
      .where(and(
        eq(chatConversationsTable.uuid, conversationId),
        eq(chatConversationsTable.embedded_chat_uuid, uuid)
      ))
      .limit(1);

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if (conversation.status !== 'human_controlled' && !validatedData.is_internal) {
      return NextResponse.json(
        { error: 'Can only send messages when conversation is under human control' },
        { status: 400 }
      );
    }

    // Insert the message
    const [newMessage] = await db
      .insert(chatMessagesTable)
      .values({
        conversation_uuid: conversationId,
        role: validatedData.role,
        content: validatedData.content,
        created_by: validatedData.created_by,
        human_user_id: session.user.id,
        is_internal: validatedData.is_internal,
      })
      .returning();

    // Update conversation's last heartbeat
    await db
      .update(chatConversationsTable)
      .set({
        last_heartbeat: new Date(),
      })
      .where(eq(chatConversationsTable.uuid, conversationId));

    return NextResponse.json({ 
      success: true, 
      message: newMessage 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Update typing status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string; conversationId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid, conversationId } = await params;
    const { isTyping } = await req.json();

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

    // Update typing status in conversation metadata
    await db
      .update(chatConversationsTable)
      .set({
        metadata: {
          agent_typing: isTyping,
          agent_typing_user_id: session.user.id,
          agent_typing_timestamp: new Date().toISOString(),
        }
      })
      .where(and(
        eq(chatConversationsTable.uuid, conversationId),
        eq(chatConversationsTable.embedded_chat_uuid, uuid)
      ));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating typing status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}