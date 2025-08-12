import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { db } from '@/db';
import { eq, and, desc } from 'drizzle-orm';
import { chatConversationsTable, conversationTasksTable } from '@/db/schema';

// GET /api/embedded-chat/[uuid]/conversations/[conversationId]/tasks - Get all tasks for a conversation
export async function GET(
  request: NextRequest,
  { params }: { params: { uuid: string; conversationId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid, conversationId } = params;
    
    // Verify the conversation belongs to the user
    const conversation = await db.query.chatConversationsTable.findFirst({
      where: and(
        eq(chatConversationsTable.uuid, conversationId),
        eq(chatConversationsTable.uuid, uuid)
      )
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Get all tasks for this conversation
    const tasks = await db
      .select()
      .from(conversationTasksTable)
      .where(eq(conversationTasksTable.conversation_id, conversationId))
      .orderBy(desc(conversationTasksTable.created_at));

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

// POST /api/embedded-chat/[uuid]/conversations/[conversationId]/tasks - Create a new task
export async function POST(
  request: NextRequest,
  { params }: { params: { uuid: string; conversationId: string } }
) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid, conversationId } = params;
    const body = await request.json();
    const { title, description, priority, dueDate, memoryId } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Verify the conversation belongs to the user
    const conversation = await db.query.chatConversationsTable.findFirst({
      where: and(
        eq(chatConversationsTable.uuid, conversationId),
        eq(chatConversationsTable.uuid, uuid)
      )
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Create the task
    const newTask = await db
      .insert(conversationTasksTable)
      .values({
        conversation_id: conversationId,
        title: title.trim(),
        description: description || '',
        priority: priority || 'medium',
        due_date: dueDate || null,
        memory_id: memoryId || null,
        status: 'todo',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning();

    return NextResponse.json({ task: newTask[0] }, { status: 201 });
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}

// PUT /api/embedded-chat/[uuid]/conversations/[conversationId]/tasks/[taskId] - Update a task
export async function PUT(
  request: NextRequest,
  { params }: { params: { uuid: string; conversationId: string; taskId: string } }
) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid, conversationId, taskId } = params;
    const body = await request.json();
    const { title, description, priority, dueDate, status } = body;

    // Verify the conversation belongs to the user
    const conversation = await db.query.chatConversationsTable.findFirst({
      where: and(
        eq(chatConversationsTable.uuid, conversationId),
        eq(chatConversationsTable.uuid, uuid)
      )
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Update the task
    const updatedTask = await db
      .update(conversationTasksTable)
      .set({
        title: title ? title.trim() : undefined,
        description: description !== undefined ? description : undefined,
        priority: priority || undefined,
        due_date: dueDate !== undefined ? dueDate : undefined,
        status: status || undefined,
        updated_at: new Date(),
      })
      .where(eq(conversationTasksTable.id, taskId))
      .returning();

    if (updatedTask.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ task: updatedTask[0] });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE /api/embedded-chat/[uuid]/conversations/[conversationId]/tasks/[taskId] - Delete a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: { uuid: string; conversationId: string; taskId: string } }
) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid, conversationId, taskId } = params;

    // Verify the conversation belongs to the user
    const conversation = await db.query.chatConversationsTable.findFirst({
      where: and(
        eq(chatConversationsTable.uuid, conversationId),
        eq(chatConversationsTable.uuid, uuid)
      )
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Delete the task
    const deletedTask = await db
      .delete(conversationTasksTable)
      .where(eq(conversationTasksTable.id, taskId))
      .returning();

    if (deletedTask.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting task:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}