import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  chatConversationsTable,
  conversationMemoriesTable,
  userMemoriesTable,
  embeddedChatsTable,
  projectsTable
} from '@/db/schema';
import { eq, and, or, desc, sql, inArray } from 'drizzle-orm';
import { getAuthSession } from '@/lib/auth';

interface RouteParamsPromise {
  params: Promise<{
    uuid: string;
  }>;
}

// GET /api/embedded-chat/[uuid]/memories
// Get all memories for an embedded chat
export async function GET(request: NextRequest, { params }: RouteParamsPromise) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const { uuid } = await params;
    const type = searchParams.get('type') || 'all';
    
    // Verify user owns the embedded chat
    const [chat] = await db
      .select()
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
    
    // Get all conversations for this chat
    const conversations = await db
      .select({ uuid: chatConversationsTable.uuid, visitor_id: chatConversationsTable.visitor_id })
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.embedded_chat_uuid, uuid));
    
    const conversationIds = conversations.map(c => c.uuid);
    const visitorIds = [...new Set(conversations.map(c => c.visitor_id))];
    
    const memories: any[] = [];
    
    // Get conversation memories
    if (type === 'conversation' || type === 'all') {
      const convMemories = await db
        .select()
        .from(conversationMemoriesTable)
        .where(inArray(conversationMemoriesTable.conversation_id, conversationIds))
        .orderBy(desc(conversationMemoriesTable.created_at))
        .limit(100);
      
      memories.push(...convMemories.map(m => ({
        id: m.id,
        kind: m.kind,
        content: (m.value_jsonb as any)?.content,
        factType: (m.value_jsonb as any)?.factType,
        importance: (m.value_jsonb as any)?.importance || m.salience,
        confidence: (m.value_jsonb as any)?.confidence,
        source: m.source,
        conversation_id: m.conversation_id,
        owner_id: m.owner_id,
        created_at: m.created_at,
        last_used_at: m.last_used_at,
        metadata: m.value_jsonb
      })));
    }
    
    // Get user memories
    if (type === 'user' || type === 'all') {
      const userMems = await db
        .select()
        .from(userMemoriesTable)
        .where(inArray(userMemoriesTable.owner_id, visitorIds))
        .orderBy(desc(userMemoriesTable.created_at))
        .limit(100);
      
      memories.push(...userMems.map(m => ({
        id: m.id,
        kind: m.kind,
        content: (m.value_jsonb as any)?.content,
        factType: (m.value_jsonb as any)?.factType,
        importance: (m.value_jsonb as any)?.importance || m.salience,
        confidence: (m.value_jsonb as any)?.confidence,
        source: m.source,
        conversation_id: null,
        owner_id: m.owner_id,
        created_at: m.created_at,
        last_used_at: m.last_used_at,
        metadata: m.value_jsonb
      })));
    }
    
    return NextResponse.json({ memories });
  } catch (error) {
    console.error('Error fetching memories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch memories' },
      { status: 500 }
    );
  }
}

// DELETE /api/embedded-chat/[uuid]/memories
// Delete a specific memory
export async function DELETE(request: NextRequest, { params }: RouteParamsPromise) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const { uuid } = await params;
    const memoryId = searchParams.get('id');
    
    if (!memoryId) {
      return NextResponse.json({ error: 'Memory ID required' }, { status: 400 });
    }
    
    // Verify user owns the embedded chat
    const [chat] = await db
      .select()
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
    
    // Try to delete from conversation memories first
    const convResult = await db
      .delete(conversationMemoriesTable)
      .where(eq(conversationMemoriesTable.id, memoryId));
    
    // If not found in conversation memories, try user memories
    if (!convResult.rowCount || convResult.rowCount === 0) {
      await db
        .delete(userMemoriesTable)
        .where(eq(userMemoriesTable.id, memoryId));
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting memory:', error);
    return NextResponse.json(
      { error: 'Failed to delete memory' },
      { status: 500 }
    );
  }
}