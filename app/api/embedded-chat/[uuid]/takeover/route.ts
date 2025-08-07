import { and, eq } from 'drizzle-orm';
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

const TakeoverSchema = z.object({
  conversationId: z.string().uuid(),
  action: z.enum(['takeover', 'release', 'assign']),
  agentId: z.string().optional(),
  reason: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid } = await params;
    const body = await req.json();
    const { conversationId, action, agentId, reason, priority } = TakeoverSchema.parse(body);

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

    // Get the conversation
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

    // Handle different actions
    switch (action) {
      case 'takeover':
        // Transition conversation to human control
        const [takenOverConversation] = await db
          .update(chatConversationsTable)
          .set({
            status: 'human_controlled',
            assigned_user_id: agentId || session.user.id,
            assigned_at: new Date(),
            takeover_at: new Date(),
            metadata: {
              ...(conversation.metadata as Record<string, any> || {}),
              takeover_reason: reason,
              takeover_by: session.user.id,
              priority: priority || 'medium',
            }
          })
          .where(eq(chatConversationsTable.uuid, conversationId))
          .returning();

        // Add system message about takeover
        await db
          .insert(chatMessagesTable)
          .values({
            conversation_uuid: conversationId,
            role: 'system',
            content: `Conversation taken over by human agent. Reason: ${reason || 'Manual takeover'}`,
            created_by: 'system',
            human_user_id: session.user.id,
            is_internal: true,
          });

        return NextResponse.json({ 
          success: true, 
          conversation: takenOverConversation,
          message: 'Conversation taken over successfully'
        });

      case 'release':
        // Release conversation back to AI
        const [releasedConversation] = await db
          .update(chatConversationsTable)
          .set({
            status: 'active',
            assigned_user_id: null,
            assigned_at: null,
            metadata: {
              ...(conversation.metadata as Record<string, any> || {}),
              released_by: session.user.id,
              released_at: new Date().toISOString(),
              release_reason: reason,
            }
          })
          .where(eq(chatConversationsTable.uuid, conversationId))
          .returning();

        // Add system message about release
        await db
          .insert(chatMessagesTable)
          .values({
            conversation_uuid: conversationId,
            role: 'system',
            content: `Conversation released back to AI. Reason: ${reason || 'Manual release'}`,
            created_by: 'system',
            human_user_id: session.user.id,
            is_internal: true,
          });

        return NextResponse.json({ 
          success: true, 
          conversation: releasedConversation,
          message: 'Conversation released back to AI'
        });

      case 'assign':
        if (!agentId) {
          return NextResponse.json({ error: 'Agent ID required for assignment' }, { status: 400 });
        }

        // Assign conversation to another agent
        const [assignedConversation] = await db
          .update(chatConversationsTable)
          .set({
            assigned_user_id: agentId,
            assigned_at: new Date(),
            metadata: {
              ...(conversation.metadata as Record<string, any> || {}),
              assigned_by: session.user.id,
              assignment_reason: reason,
              priority: priority || (conversation.metadata as any)?.priority || 'medium',
            }
          })
          .where(eq(chatConversationsTable.uuid, conversationId))
          .returning();

        // Add system message about assignment
        await db
          .insert(chatMessagesTable)
          .values({
            conversation_uuid: conversationId,
            role: 'system',
            content: `Conversation assigned to agent ${agentId}. Reason: ${reason || 'Manual assignment'}`,
            created_by: 'system',
            human_user_id: session.user.id,
            is_internal: true,
          });

        return NextResponse.json({ 
          success: true, 
          conversation: assignedConversation,
          message: 'Conversation assigned successfully'
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error handling takeover:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Get takeover status and available agents
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
    const conversationId = searchParams.get('conversationId');

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

    if (conversationId) {
      // Get specific conversation status
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

      return NextResponse.json({
        conversation: {
          uuid: conversation.uuid,
          status: conversation.status,
          assigned_user_id: conversation.assigned_user_id,
          assigned_at: conversation.assigned_at,
          takeover_at: conversation.takeover_at,
          metadata: conversation.metadata,
        }
      });
    }

    // Return general takeover capabilities
    return NextResponse.json({
      capabilities: {
        canTakeover: true,
        canAssign: true,
        canRelease: true,
        availableAgents: [
          // In a real implementation, this would come from a user management system
          { id: session.user.id, name: session.user.name || 'Current User', status: 'available' }
        ]
      }
    });
  } catch (error) {
    console.error('Error getting takeover status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}