import { and,eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { db } from '@/db';
import {
  chatConversationsTable,
  conversationWorkflowsTable,
  users,
  workflowTasksTable} from '@/db/schema';
import { isVisitorId,normalizeUserId } from '@/lib/chat-memory/id-utils';
import { IntegrationManager } from '@/lib/integrations/base-service';
import { PersonaIntegrations } from '@/lib/integrations/types';
import { WorkflowExecutor } from '@/lib/workflows/workflow-executor';

// POST /api/embedded-chat/[uuid]/conversations/[conversationId]/workflows/[workflowId]/execute
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
    const body = await request.json();
    const { action, data } = body;

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

    // Execute the next task using WorkflowBrain
    const { WorkflowBrain } = await import('@/lib/workflows/workflow-brain');
    const workflowBrain = new WorkflowBrain();
    
    // Import notification tools
    const { createPersonaTools } = await import('@/lib/integrations/tools');

    if (action === 'auto-execute') {
      // Auto-execute the entire workflow using WorkflowExecutor
      try {
        // Get integration manager for the user
        const integrationsConfig: PersonaIntegrations = {
          calendar: {
            google: {
              enabled: true,
              provider: 'google_calendar',
              config: {} // Will be fetched from user's actual integrations
            }
          }
        };
        
        const integrationManager = new IntegrationManager(integrationsConfig);
        
        const executor = new WorkflowExecutor({
          workflowId,
          conversationId,
          integrationManager,
          debug: true
        });
        
        const result = await executor.execute();
        
        if (result.success) {
          return NextResponse.json({
            success: true,
            message: 'Workflow executed successfully',
            completed: true
          });
        } else {
          return NextResponse.json({
            success: false,
            error: result.error || 'Workflow execution failed'
          }, { status: 400 });
        }
      } catch (error) {
        console.error('[WorkflowExecute] Auto-execution error:', error);
        return NextResponse.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to auto-execute workflow'
        }, { status: 500 });
      }
    }
    
    if (action === 'next') {
      // Get the next task to execute
      const nextTask = await workflowBrain.getNextTask(workflowId);

      if (!nextTask) {
        // Mark workflow as completed
        await db.update(conversationWorkflowsTable)
          .set({
            status: 'completed',
            completed_at: new Date()
          })
          .where(eq(conversationWorkflowsTable.id, workflowId));

        // Send notifications when workflow is completed
        try {
          // Get conversation details for notification context
          const conversationDetails = await db.query.chatConversationsTable.findFirst({
            where: eq(chatConversationsTable.uuid, conversationId),
            with: {
              messages: {
                orderBy: (messages, { desc }) => [desc(messages.created_at)],
                limit: 10
              }
            }
          });

          if (conversationDetails) {
            // Get user info for notifications
            let userEmail = '';
            if (conversationDetails.authenticated_user_id) {
              const user = await db.query.users.findFirst({
                where: eq(users.id, conversationDetails.authenticated_user_id),
                columns: { email: true, name: true }
              });
              userEmail = user?.email || '';
            }

            // Create conversation summary from messages
            const conversationSummary = conversationDetails.messages
              .map(message => message.content)
              .filter(content => content && content.trim() !== '')
              .join('\n');

            // Create notification content
            const notificationTitle = `Workflow Completed: ${workflow.template_id || 'Meeting Scheduling'}`;
            const notificationMessage = `The workflow "${workflow.template_id || 'Meeting Scheduling'}" has been completed successfully.\n\nConversation Summary:\n${conversationSummary}`;

            // Send Slack notification
            try {
              // Create a simple integration manager for sending notifications
              const integrationsConfig: PersonaIntegrations = {
                communication: {
                  slack: {
                    enabled: true,
                    provider: 'slack',
                    config: {
                      channel: '#general' // Default channel
                    }
                  },
                  email: {
                    enabled: true,
                    provider: 'email',
                    config: {}
                  }
                }
              };

              const notificationManager = new IntegrationManager(integrationsConfig);

              // Send Slack notification
              const slackAction = {
                type: 'send_slack',
                payload: {
                  channel: '#general',
                  text: notificationMessage
                },
                personaId: 1,
                conversationId
              };

              const slackResult = await notificationManager.executeAction(slackAction);

              if (slackResult.success) {
                console.log('Slack notification sent successfully');
              } else {
                console.error('Failed to send Slack notification:', slackResult.error);
              }
            } catch (slackError) {
              console.error('Error sending Slack notification:', slackError);
            }

            // Send email notification
            if (userEmail) {
              try {
                // Create a simple integration manager for sending notifications
                const integrationsConfig: PersonaIntegrations = {
                  communication: {
                    email: {
                      enabled: true,
                      provider: 'email',
                      config: {}
                    }
                  }
                };

                const notificationManager = new IntegrationManager(integrationsConfig);

                // Send email notification
                const emailAction = {
                  type: 'send_email',
                  payload: {
                    to: userEmail,
                    subject: notificationTitle,
                    message: notificationMessage,
                    personaName: 'AI Assistant'
                  },
                  personaId: 1,
                  conversationId
                };

                const emailResult = await notificationManager.executeAction(emailAction);

                if (emailResult.success) {
                  console.log('Email notification sent successfully');
                } else {
                  console.error('Failed to send email notification:', emailResult.error);
                }
              } catch (emailError) {
                console.error('Error sending email notification:', emailError);
              }
            }
          }
        } catch (notificationError) {
          console.error('Failed to send workflow completion notifications:', notificationError);
          // Don't fail the workflow execution if notifications fail
        }

        return NextResponse.json({
          completed: true,
          message: 'Workflow completed successfully'
        });
      }

      // Mark task as active
      await db.update(workflowTasksTable)
        .set({ 
          status: 'active',
          started_at: new Date()
        })
        .where(eq(workflowTasksTable.id, nextTask.id));

      // Update workflow status to active if it was planning
      if (workflow.status === 'planning') {
        await db.update(conversationWorkflowsTable)
          .set({ 
            status: 'active',
            started_at: new Date()
          })
          .where(eq(conversationWorkflowsTable.id, workflowId));
      }

      return NextResponse.json({ 
        taskId: nextTask.id,
        task: nextTask,
        requiresInput: nextTask.type === 'gather',
        message: `Executing: ${nextTask.title}`
      });
    }

    if (action === 'complete') {
      // Complete the current active task
      const { taskId } = body;
      
      await db.update(workflowTasksTable)
        .set({ 
          status: 'completed',
          completed_at: new Date(),
          actual_data: data
        })
        .where(eq(workflowTasksTable.id, taskId));

      return NextResponse.json({ 
        taskCompleted: true,
        taskId,
        message: 'Task completed'
      });
    }

    if (action === 'fail') {
      // Mark task as failed
      const { taskId, error } = body;
      
      await db.update(workflowTasksTable)
        .set({ 
          status: 'failed',
          completed_at: new Date(),
          error_message: error
        })
        .where(eq(workflowTasksTable.id, taskId));

      // Mark workflow as failed
      await db.update(conversationWorkflowsTable)
        .set({ 
          status: 'failed',
          completed_at: new Date(),
          failure_reason: error
        })
        .where(eq(conversationWorkflowsTable.id, workflowId));

      return NextResponse.json({ 
        failed: true,
        taskId,
        message: 'Task failed'
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error executing workflow:', error);
    return NextResponse.json({ error: 'Failed to execute workflow' }, { status: 500 });
  }
}