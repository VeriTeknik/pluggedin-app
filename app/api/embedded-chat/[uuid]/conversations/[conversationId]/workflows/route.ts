import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { db } from '@/db';
import { eq, and, desc, or, isNull } from 'drizzle-orm';
import { 
  chatConversationsTable, 
  conversationWorkflowsTable,
  workflowTasksTable,
  workflowTemplatesTable
} from '@/db/schema';
import { normalizeUserId, isVisitorId } from '@/lib/chat-memory/id-utils';

// GET /api/embedded-chat/[uuid]/conversations/[conversationId]/workflows - Get all workflows for a conversation
export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ uuid: string; conversationId: string }> }
) {
  try {
    const params = await paramsPromise;
    const { uuid, conversationId } = params;
    
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const session = await getServerSession();
    
    console.log('[WorkflowAPI] GET request:', {
      conversationId,
      uuid,
      userId,
      hasSession: !!session?.user?.id
    });
    
    // Allow both authenticated users and visitor users
    if (!session?.user?.id && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // For visitor users, normalize the ID
    const effectiveUserId = session?.user?.id || (userId && isVisitorId(userId) ? normalizeUserId(userId) : null);
    if (!effectiveUserId) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }
    
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

    // Get all workflows for this conversation with their tasks
    const workflows = await db
      .select({
        workflow: conversationWorkflowsTable,
        template: {
          id: workflowTemplatesTable.id,
          name: workflowTemplatesTable.name,
          description: workflowTemplatesTable.description,
          category: workflowTemplatesTable.category
        }
      })
      .from(conversationWorkflowsTable)
      .leftJoin(
        workflowTemplatesTable,
        eq(conversationWorkflowsTable.template_id, workflowTemplatesTable.id)
      )
      .where(eq(conversationWorkflowsTable.conversation_id, conversationId))
      .orderBy(desc(conversationWorkflowsTable.created_at));

    // Get tasks for each workflow
    const workflowsWithTasks = await Promise.all(
      workflows.map(async ({ workflow, template }) => {
        let tasks = [];
        try {
          tasks = await db
            .select()
            .from(workflowTasksTable)
            .where(eq(workflowTasksTable.workflow_id, workflow.id))
            .orderBy(workflowTasksTable.created_at);
        } catch (error) {
          console.error('[WorkflowAPI] Error fetching tasks for workflow:', workflow.id, error);
          tasks = [];
        }

        return {
          ...workflow,
          template_name: template?.name,
          template_description: template?.description,
          template_category: template?.category,
          tasks: Array.isArray(tasks) ? tasks : []
        };
      })
    );

    console.log('[WorkflowAPI] Found workflows:', {
      count: workflowsWithTasks.length,
      workflows: workflowsWithTasks.map(w => ({
        id: w.id,
        status: w.status,
        template_name: w.template_name,
        tasksCount: w.tasks.length
      }))
    });

    return NextResponse.json({ workflows: workflowsWithTasks });
  } catch (error) {
    console.error('Error fetching workflows:', error);
    return NextResponse.json({ error: 'Failed to fetch workflows' }, { status: 500 });
  }
}

// POST /api/embedded-chat/[uuid]/conversations/[conversationId]/workflows - Create a new workflow
export async function POST(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ uuid: string; conversationId: string }> }
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
    const { uuid, conversationId } = params;
    const body = await request.json();
    const { templateId, context } = body;

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

    // Create the workflow using WorkflowBrain
    const { WorkflowBrain } = await import('@/lib/workflows/workflow-brain');
    const workflowBrain = new WorkflowBrain();
    
    // Get the template
    const template = await db.query.workflowTemplatesTable.findFirst({
      where: eq(workflowTemplatesTable.id, templateId)
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Generate the workflow
    const workflowContext = {
      conversationId,
      userId: effectiveUserId,
      existingData: context?.existingData || {},
      memories: [],
      capabilities: context?.capabilities || [],
      timezone: context?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: context?.language || 'en'
    };

    const workflow = await workflowBrain.generateWorkflow(
      {
        id: template.id,
        name: template.name,
        category: template.category,
        baseStructure: template.base_structure,  // Fixed column name
        requiredCapabilities: template.required_capabilities
      },
      workflowContext
    );

    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    console.error('Error creating workflow:', error);
    return NextResponse.json({ error: 'Failed to create workflow' }, { status: 500 });
  }
}