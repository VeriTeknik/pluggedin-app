import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  chatConversationsTable,
  conversationMemoriesTable,
  userMemoriesTable,
  embeddedChatsTable,
  projectsTable
} from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getAuthSession } from '@/lib/auth';

interface RouteParamsPromise {
  params: Promise<{
    uuid: string;
  }>;
}

// DELETE /api/embedded-chat/[uuid]/memories/clear-all
// Clear all memories for an embedded chat (requires debug mode enabled)
export async function DELETE(request: NextRequest, { params }: RouteParamsPromise) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid } = await params;
    
    // Verify user owns the embedded chat and debug mode is enabled
    const [chat] = await db
      .select({
        uuid: embeddedChatsTable.uuid,
        debug_mode: embeddedChatsTable.debug_mode,
      })
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(and(
        eq(embeddedChatsTable.uuid, uuid),
        eq(projectsTable.user_id, session.user.id)
      ))
      .limit(1);
    
    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }
    
    // Check if debug mode is enabled
    if (!chat.debug_mode) {
      return NextResponse.json(
        { error: 'Debug mode must be enabled to clear all memories' },
        { status: 403 }
      );
    }
    
    // Get all conversations for this chat
    const conversations = await db
      .select({ uuid: chatConversationsTable.uuid, visitor_id: chatConversationsTable.visitor_id })
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.embedded_chat_uuid, uuid));
    
    const conversationIds = conversations.map(c => c.uuid);
    const visitorIds = [...new Set(conversations.map(c => c.visitor_id))];
    
    // Use transaction to ensure atomicity
    await db.transaction(async (tx) => {
      // Delete all conversation memories
      if (conversationIds.length > 0) {
        await tx
          .delete(conversationMemoriesTable)
          .where(inArray(conversationMemoriesTable.conversation_id, conversationIds));
      }
      
      // Delete all user memories for visitors who have used this chat
      if (visitorIds.length > 0) {
        await tx
          .delete(userMemoriesTable)
          .where(inArray(userMemoriesTable.owner_id, visitorIds));
      }
    });
    
    return NextResponse.json({ 
      success: true,
      message: 'All memories cleared successfully',
      cleared: {
        conversations: conversationIds.length,
        visitors: visitorIds.length
      }
    });
  } catch (error) {
    console.error('Error clearing memories:', error);
    return NextResponse.json(
      { error: 'Failed to clear memories' },
      { status: 500 }
    );
  }
}