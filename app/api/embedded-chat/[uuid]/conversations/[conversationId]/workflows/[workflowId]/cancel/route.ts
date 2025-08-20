import { and,eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { db } from '@/db';
import { 
  chatConversationsTable, 
  conversationWorkflowsTable
} from '@/db/schema';
import { isVisitorId,normalizeUserId } from '@/lib/chat-memory/id-utils';

// POST /api/embedded-chat/[uuid]/conversations/[conversationId]/workflows/[workflowId]/cancel
export async function POST(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ uuid: string; conversationId: string; workflowId: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const session = await getServerSession();
    
    // Allow both authenticated users and visitor users
    if (!session?.user?.id && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // For visitor users, normalize the ID
    const effectiveUserId = session?.user?.id || (userId && isVisitorId(userId) ? normalizeUserId(userId) : null);
    if (!effectiveUserId) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const params = await paramsPromise;
    const { uuid, conversationId, workflowId } = params;

    // Verify the conversation belongs to the user
    const conversation = await db.query.chatConversationsTable.findFirst({
      where: and(
        eq(chatConversationsTable.uuid, conversationId),
        eq(chatConversationsTable.embedded_chat_uuid, uuid)
      )
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Verify the workflow exists and belongs to this conversation
    const workflow = await db.query.conversationWorkflowsTable.findFirst({
      where: and(
        eq(conversationWorkflowsTable.id, workflowId),
        eq(conversationWorkflowsTable.conversation_id, conversationId)
      )
    });

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // Cancel the workflow
    await db.update(conversationWorkflowsTable)
      .set({ 
        status: 'cancelled',
        completed_at: new Date(),
        failure_reason: 'Cancelled by user'
      })
      .where(eq(conversationWorkflowsTable.id, workflowId));

    return NextResponse.json({ 
      success: true,
      message: 'Workflow cancelled successfully' 
    });
  } catch (error) {
    console.error('Error cancelling workflow:', error);
    return NextResponse.json({ error: 'Failed to cancel workflow' }, { status: 500 });
  }
}