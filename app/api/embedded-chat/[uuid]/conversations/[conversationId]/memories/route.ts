import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  chatConversationsTable,
  conversationMemoriesTable,
  userMemoriesTable
} from '@/db/schema';
import { eq, and, or, ilike, desc, sql } from 'drizzle-orm';
import { MemoryStore } from '@/lib/chat-memory/memory-store';
import { normalizeUserId } from '@/lib/chat-memory/id-utils';

interface RouteParamsPromise {
  params: Promise<{
    uuid: string;
    conversationId: string;
  }>;
}

// GET /api/embedded-chat/[uuid]/conversations/[conversationId]/memories
// Get all memories for a conversation
export async function GET(request: NextRequest, { params }: RouteParamsPromise) {
  try {
    const { searchParams } = new URL(request.url);
    const { uuid, conversationId } = await params;
    
    // Check if conversation exists and get user info
    const [conversation] = await db
      .select()
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.uuid, conversationId))
      .limit(1);
    
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    // Get user ID from conversation or visitor info
    let userId = searchParams.get('userId');
    if (!userId) {
      if (conversation.visitor_id) {
        userId = conversation.visitor_id;
      } else {
        return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
      }
    }
    
    // Normalize user ID for database operations
    const normalizedUserId = normalizeUserId(userId);
    const type = searchParams.get('type'); // 'conversation' or 'user' or 'all'
    const search = searchParams.get('search');
    const factType = searchParams.get('factType');
    const sortBy = searchParams.get('sortBy') || 'lastAccessedAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Verify the user has access to this conversation
    // This is a simplified check - in production, you'd want to verify the user owns the conversation
    const memoryStore = new MemoryStore();

    const memories: any[] = [];

    if (type === 'conversation' || type === 'all') {
      // Build where conditions for conversation memories
      let whereConditions = and(
        eq(conversationMemoriesTable.conversation_id, conversationId),
        eq(conversationMemoriesTable.owner_id, normalizedUserId)
      );

      if (search) {
        whereConditions = and(
          whereConditions,
          or(
            ilike(conversationMemoriesTable.value_jsonb, `%${search}%`),
            ilike(sql`${conversationMemoriesTable.value_jsonb}->>'factType'`, `%${search}%`)
          )
        );
      }

      if (factType) {
        whereConditions = and(
          whereConditions,
          ilike(sql`${conversationMemoriesTable.value_jsonb}->>'factType'`, factType)
        );
      }

      // Build order by conditions
      let orderBy;
      if (sortBy === 'createdAt') {
        orderBy = sortOrder === 'desc' 
          ? desc(conversationMemoriesTable.created_at)
          : conversationMemoriesTable.created_at;
      } else if (sortBy === 'lastAccessedAt') {
        orderBy = sortOrder === 'desc' 
          ? desc(conversationMemoriesTable.last_used_at)
          : conversationMemoriesTable.last_used_at;
      } else {
        orderBy = sortOrder === 'desc' 
          ? desc(conversationMemoriesTable.salience)
          : conversationMemoriesTable.salience;
      }

      const conversationMemories = await db
        .select()
        .from(conversationMemoriesTable)
        .where(whereConditions)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      memories.push(...conversationMemories.map(m => ({
        ...m,
        source: 'conversation' as const,
        content: (m.value_jsonb as any)?.content,
        factType: (m.value_jsonb as any)?.factType,
        importance: (m.value_jsonb as any)?.importance,
        confidence: (m.value_jsonb as any)?.confidence,
        hash: m.novelty_hash,
        metadata: m.value_jsonb,
        createdAt: m.created_at,
        lastAccessedAt: m.last_used_at || m.created_at
      })));
    }

    if (type === 'user' || type === 'all') {
      // Build where conditions for user memories
      let whereConditions: any = eq(userMemoriesTable.owner_id, normalizedUserId);

      if (search) {
        whereConditions = and(
          whereConditions,
          or(
            ilike(userMemoriesTable.value_jsonb, `%${search}%`),
            ilike(sql`${userMemoriesTable.value_jsonb}->>'factType'`, `%${search}%`)
          )
        );
      }

      if (factType) {
        whereConditions = and(
          whereConditions,
          ilike(sql`${userMemoriesTable.value_jsonb}->>'factType'`, factType)
        );
      }

      // Build order by conditions
      let orderBy;
      if (sortBy === 'createdAt') {
        orderBy = sortOrder === 'desc'
          ? desc(userMemoriesTable.created_at)
          : userMemoriesTable.created_at;
      } else if (sortBy === 'lastAccessedAt') {
        orderBy = sortOrder === 'desc'
          ? desc(userMemoriesTable.last_used_at)
          : userMemoriesTable.last_used_at;
      } else {
        orderBy = sortOrder === 'desc'
          ? desc(userMemoriesTable.salience)
          : userMemoriesTable.salience;
      }

      const userMemoriesResult = await db
        .select()
        .from(userMemoriesTable)
        .where(whereConditions)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      memories.push(...userMemoriesResult.map(m => ({
        ...m,
        source: 'user' as const,
        content: (m.value_jsonb as any)?.content,
        factType: (m.value_jsonb as any)?.factType,
        importance: (m.value_jsonb as any)?.importance,
        confidence: (m.value_jsonb as any)?.confidence,
        hash: m.novelty_hash,
        metadata: m.value_jsonb,
        createdAt: m.created_at,
        lastAccessedAt: m.last_used_at || m.created_at
      })));
    }

    return NextResponse.json({
      memories,
      total: memories.length,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching memories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch memories' },
      { status: 500 }
    );
  }
}

// POST /api/embedded-chat/[uuid]/conversations/[conversationId]/memories
// Create a new memory
export async function POST(request: NextRequest, { params }: RouteParamsPromise) {
  try {
    const { content, factType, importance = 5, confidence = 0.8, source = 'user' } = await request.json();
    const { uuid, conversationId } = await params;
    
    // Check if conversation exists and get user info
    const [conversation] = await db
      .select()
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.uuid, conversationId))
      .limit(1);
    
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    // Get user ID from conversation or visitor info
    let userId;
    if (conversation.visitor_id) {
      userId = conversation.visitor_id;
    } else {
      return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    if (!content || !factType) {
      return NextResponse.json(
        { error: 'Content and factType are required' },
        { status: 400 }
      );
    }

    const memoryStore = new MemoryStore();
    
    // Generate a hash for the memory
    const hash = memoryStore['generateHash'](content); // Access private method for now

    // Determine which table to insert into based on source
    const table = source === 'user' ? userMemoriesTable : conversationMemoriesTable;
    const tableData = source === 'user'
      ? { owner_id: userId }
      : { conversation_id: conversationId, owner_id: userId };

    const [newMemory] = await db
      .insert(table)
      .values({
        ...tableData,
        kind: 'fact',
        value_jsonb: {
          content,
          factType,
          importance,
          confidence,
          temporality: 'persistent',
          subject: '',
          entities: [],
          relatedTopics: []
        },
        salience: importance,
        novelty_hash: hash,
        source: 'user',
        language_code: 'en'
      })
      .returning();

    return NextResponse.json({
      ...newMemory,
      content: (newMemory.value_jsonb as any)?.content,
      factType: (newMemory.value_jsonb as any)?.factType,
      importance: (newMemory.value_jsonb as any)?.importance,
      confidence: (newMemory.value_jsonb as any)?.confidence,
      hash: newMemory.novelty_hash,
      metadata: newMemory.value_jsonb,
      createdAt: newMemory.created_at,
      lastAccessedAt: newMemory.last_used_at || newMemory.created_at
    });
  } catch (error) {
    console.error('Error creating memory:', error);
    return NextResponse.json(
      { error: 'Failed to create memory' },
      { status: 500 }
    );
  }
}

// PUT /api/embedded-chat/[uuid]/conversations/[conversationId]/memories
// Update an existing memory
export async function PUT(request: NextRequest, { params }: RouteParamsPromise) {
  try {
    const { id, content, factType, importance, confidence } = await request.json();
    const { uuid, conversationId } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Memory ID is required' },
        { status: 400 }
      );
    }

    // Check if conversation exists and get user info
    const [conversation] = await db
      .select()
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.uuid, conversationId))
      .limit(1);
    
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    // Get user ID from conversation or visitor info
    let userId;
    if (conversation.visitor_id) {
      userId = conversation.visitor_id;
    } else {
      return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    // Check if memory exists and belongs to user
    let memory;
    const [conversationMemory] = await db
      .select()
      .from(conversationMemoriesTable)
      .where(
        and(
          eq(conversationMemoriesTable.id, id),
          eq(conversationMemoriesTable.owner_id, userId)
        )
      )
      .limit(1);

    if (conversationMemory) {
      memory = conversationMemory;
    } else {
      const [userMemory] = await db
        .select()
        .from(userMemoriesTable)
        .where(
          and(
            eq(userMemoriesTable.id, id),
            eq(userMemoriesTable.owner_id, userId)
          )
        )
        .limit(1);
      
      if (userMemory) {
        memory = userMemory;
      }
    }

    if (!memory) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    // Determine which table to update
    const table = 'conversation_id' in memory ? conversationMemoriesTable : userMemoriesTable;
    
    // Update the memory
    const [updatedMemory] = await db
      .update(table)
      .set({
        value_jsonb: {
          ...(memory.value_jsonb as any),
          content: content || (memory.value_jsonb as any)?.content,
          factType: factType || (memory.value_jsonb as any)?.factType,
          importance: importance !== undefined ? importance : (memory.value_jsonb as any)?.importance,
          confidence: confidence !== undefined ? confidence : (memory.value_jsonb as any)?.confidence,
        },
        salience: importance !== undefined ? importance : memory.salience,
        last_used_at: new Date()
      })
      .where(eq(table.id, id))
      .returning();

    return NextResponse.json({
      ...updatedMemory,
      content: (updatedMemory.value_jsonb as any)?.content,
      factType: (updatedMemory.value_jsonb as any)?.factType,
      importance: (updatedMemory.value_jsonb as any)?.importance,
      confidence: (updatedMemory.value_jsonb as any)?.confidence,
      hash: updatedMemory.novelty_hash,
      metadata: updatedMemory.value_jsonb,
      createdAt: updatedMemory.created_at,
      lastAccessedAt: updatedMemory.last_used_at || updatedMemory.created_at
    });
  } catch (error) {
    console.error('Error updating memory:', error);
    return NextResponse.json(
      { error: 'Failed to update memory' },
      { status: 500 }
    );
  }
}

// DELETE /api/embedded-chat/[uuid]/conversations/[conversationId]/memories
// Delete a memory
export async function DELETE(request: NextRequest, { params }: RouteParamsPromise) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const { uuid, conversationId } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: 'Memory ID is required' },
        { status: 400 }
      );
    }

    // Check if conversation exists and get user info
    const [conversation] = await db
      .select()
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.uuid, conversationId))
      .limit(1);
    
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    
    // Get user ID from conversation or visitor info
    let userId;
    if (conversation.visitor_id) {
      userId = conversation.visitor_id;
    } else {
      return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    // Check if memory exists and belongs to user
    let memory;
    const [conversationMemory] = await db
      .select()
      .from(conversationMemoriesTable)
      .where(
        and(
          eq(conversationMemoriesTable.id, id),
          eq(conversationMemoriesTable.owner_id, userId)
        )
      )
      .limit(1);

    if (conversationMemory) {
      memory = conversationMemory;
    } else {
      const [userMemory] = await db
        .select()
        .from(userMemoriesTable)
        .where(
          and(
            eq(userMemoriesTable.id, id),
            eq(userMemoriesTable.owner_id, userId)
          )
        )
        .limit(1);
      
      if (userMemory) {
        memory = userMemory;
      }
    }

    if (!memory) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    // Determine which table to delete from
    const table = 'conversation_id' in memory ? conversationMemoriesTable : userMemoriesTable;
    
    // Delete the memory
    await db
      .delete(table)
      .where(eq(table.id, id));

    return NextResponse.json({ success: true, message: 'Memory deleted successfully' });
  } catch (error) {
    console.error('Error deleting memory:', error);
    return NextResponse.json(
      { error: 'Failed to delete memory' },
      { status: 500 }
    );
  }
}