import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { chatMessagesTable, chatConversationsTable } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

import { extractApiKey } from '@/lib/api-key';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid } = await params;
    const { messageId, content, conversationId } = await req.json();

    if (!messageId || !content || !conversationId) {
      return NextResponse.json(
        { error: 'Message ID, content, and conversation ID are required' },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Update the message
    const result = await db
      .update(chatMessagesTable)
      .set({
        content,
        metadata: {
          edited: true,
          edited_at: new Date().toISOString(),
        }
      })
      .where(and(
        eq(chatMessagesTable.id, parseInt(messageId)),
        eq(chatMessagesTable.conversation_uuid, conversationId)
      ))
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Message updated successfully',
      updatedMessage: result[0]
    });

  } catch (error) {
    console.error('Message edit error:', error);
    return NextResponse.json(
      { error: 'Failed to edit message' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid } = await params;
    const url = new URL(req.url);
    const messageId = url.searchParams.get('messageId');
    const conversationId = url.searchParams.get('conversationId');

    if (!messageId || !conversationId) {
      return NextResponse.json(
        { error: 'Message ID and conversation ID are required' },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Delete the message
    const result = await db
      .delete(chatMessagesTable)
      .where(and(
        eq(chatMessagesTable.id, parseInt(messageId)),
        eq(chatMessagesTable.conversation_uuid, conversationId)
      ))
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('Message delete error:', error);
    return NextResponse.json(
      { error: 'Failed to delete message' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid } = await params;
    const url = new URL(req.url);
    const conversationId = url.searchParams.get('conversationId');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Conversation ID required' },
        { status: 400 }
      );
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
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Get messages for the conversation
    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(and(
        eq(chatMessagesTable.conversation_uuid, conversationId),
        eq(chatMessagesTable.is_internal, false)
      ))
      .orderBy(desc(chatMessagesTable.created_at))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      success: true,
      messages: messages.reverse(), // Reverse to get chronological order
      conversation: {
        id: conversation.uuid,
        started_at: conversation.started_at,
        status: conversation.status,
      }
    });

  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json(
      { error: 'Failed to get messages' },
      { status: 500 }
    );
  }
}