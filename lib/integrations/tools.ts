import { DynamicStructuredTool } from '@langchain/core/tools';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { createNotification } from '@/app/actions/notifications';
import { db } from '@/db';
import {
  chatConversationsTable,
  conversationMemoriesTable,
  conversationTasksTable,
  conversationWorkflowsTable,
  users
} from '@/db/schema';
import { getUserInfoFromAuth } from '@/lib/auth';
import { InformationOrchestrator } from '@/lib/workflows/info-orchestrator';
import { WorkflowBrain } from '@/lib/workflows/workflow-brain';

import { IntegrationManager } from './base-service';

// Tool context interface
export interface ToolContext {
  integrationManager: IntegrationManager & {
    integrationsConfig?: any; // Allow access to integrations config
    embeddedChatUuid?: string;
    clientContext?: {
      timezone: string;
      current_datetime: string;
      locale?: string;
    };
  };
  personaId: number;
  conversationId?: string; // May be missing for embedded chat; we resolve latest conversation if not provided
  profileUuid?: string; // Add profile UUID for notifications
  clientContext?: {
    timezone: string;
    current_datetime: string;
    locale?: string;
  };
  userId?: string;
  userEmail?: string;
}

// Helper function to send tool call notifications
async function sendToolNotification(
  profileUuid: string | undefined,
  toolName: string,
  action: string,
  success: boolean,
  details?: string,
  metadata?: any
) {
  if (!profileUuid) return; // Skip if no profile UUID
  
  try {
    await createNotification({
      profileUuid,
      type: 'INFO',
      title: `${toolName} - ${action}`,
      message: details || `${action} ${success ? 'completed successfully' : 'failed'}`,
      severity: success ? 'SUCCESS' : 'WARNING',
      metadata: {
        source: {
          type: 'mcp',
          mcpServer: 'persona_capability',
        },
        task: {
          action,
          success,
          ...metadata
        }
      },
      expiresInDays: 7
    });
  } catch (error) {
    console.error('Failed to send tool notification:', error);
  }
}

// Base tool factory function
export function createPersonaTools(context: ToolContext): DynamicStructuredTool[] {
  const tools: DynamicStructuredTool[] = [];

  // Get available capabilities from the integration manager
  const availableCapabilities = context.integrationManager.getAvailableCapabilities();

  // Create tools based on enabled capabilities
  const createdTools = new Set<string>(); // Track which tools we've already created
  
  for (const capability of availableCapabilities) {
    switch (capability.id) {
      case 'send_slack':
        if (!createdTools.has('slack')) {
          tools.push(createSlackMessageTool(context));
          createdTools.add('slack');
        }
        break;
      case 'schedule_meeting':
      case 'check_availability':
        // Both capabilities use the same calendar tool, only create once
        if (!createdTools.has('calendar')) {
          tools.push(createCalendarBookingTool(context));
          createdTools.add('calendar');
        }
        break;
      case 'send_email':
        if (!createdTools.has('email')) {
          tools.push(createEmailSendingTool(context));
          createdTools.add('email');
        }
        break;
      case 'create_lead':
        if (!createdTools.has('crm')) {
          tools.push(createCRMLeadTool(context));
          createdTools.add('crm');
        }
        break;
      case 'create_ticket':
        if (!createdTools.has('support')) {
          tools.push(createSupportTicketTool(context));
          createdTools.add('support');
        }
        break;
      default:
        break;
    }
  }

  // Add workflow intelligence tool for complex multi-step processes
  tools.push(createWorkflowTriggerTool(context));

  // Always include a generic conversation task tool for follow-ups
  tools.push(createConversationTaskTool(context));

  return tools;
}

// Slack Message Tool
function createSlackMessageTool(context: ToolContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'send_slack_message',
    description: 'Send a message to Slack. If channel is omitted, the pre-configured default channel will be used automatically. Do not ask the user for a channel when one is configured.',
    schema: z.object({
      channel: z.string().optional().describe('The Slack channel to send the message to (e.g., #general). If not specified, uses the default channel.'),
      message: z.string().describe('The message content to send'),
      thread_ts: z.string().optional().describe('Thread timestamp to reply to (optional)'),
    }),
    func: async ({ channel, message, thread_ts }: { channel?: string; message: string; thread_ts?: string }) => {
      try {
        let userInfo = await getUserInfoFromAuth();
        // If no session, try conversation -> authenticated user fallback
        if (!userInfo) {
          // Resolve latest conversation for this embedded chat if conversationId is missing
          let conversationId = context.conversationId;
          if (!conversationId && (context.integrationManager as any).embeddedChatUuid) {
            const { chatConversationsTable } = await import('@/db/schema');
            const { desc, eq } = await import('drizzle-orm');
            const rows = await db
              .select({ uuid: chatConversationsTable.uuid })
              .from(chatConversationsTable)
              .where(eq(chatConversationsTable.embedded_chat_uuid, (context.integrationManager as any).embeddedChatUuid))
              .orderBy(desc(chatConversationsTable.created_at))
              .limit(1);
            conversationId = rows?.[0]?.uuid;
          }
          if (conversationId) {
            try {
              const conv = await db.query.chatConversationsTable.findFirst({
                where: eq(chatConversationsTable.uuid, conversationId),
                columns: { authenticated_user_id: true }
              });
              if (conv?.authenticated_user_id) {
                const dbUser = await db.query.users.findFirst({
                  where: eq(users.id, conv.authenticated_user_id),
                  columns: { id: true, name: true, email: true, image: true }
                });
                if (dbUser) {
                  userInfo = { id: dbUser.id, name: dbUser.name, email: dbUser.email, image: (dbUser as any).image } as any;
                }
              }
            } catch {}
          }
        }
        // Fallback to DB if email is missing but id exists
        if (userInfo && !userInfo.email && userInfo.id) {
          try {
            const dbUser = await db.query.users.findFirst({
              where: eq(users.id, userInfo.id),
              columns: { name: true, email: true }
            });
            if (dbUser) {
              userInfo = { ...userInfo, name: userInfo.name || dbUser.name, email: dbUser.email } as any;
            }
      } catch (_e) {
            // ignore fallback errors
          }
        }
        
        // Get default channel from integration configuration
        const defaultChannel = context.integrationManager?.integrationsConfig?.communication?.slack?.config?.channel;
        const finalChannel = defaultChannel || channel || '#general';
        
        const action = {
          type: 'send_slack',
          payload: {
            channel: finalChannel,
            text: message, // SlackService expects 'text' not 'message'
            thread_ts,
            senderInfo: userInfo ? {
              name: userInfo.name || (userInfo as any).username,
              email: userInfo.email,
              avatar: (userInfo as any).image || undefined,
            } : null,
          },
          personaId: context.personaId,
          conversationId: context.conversationId,
        };

        const result = await context.integrationManager.executeAction(action);
        
        // Send notification
        await sendToolNotification(
          context.profileUuid,
          'Slack',
          'Send Message',
          result.success,
          result.success 
            ? `Message sent to ${finalChannel}: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`
            : `Failed to send message: ${result.error}`,
          {
            channel: finalChannel,
            messageLength: message.length,
            hasThread: !!thread_ts
          }
        );
        
        if (result.success) {
          return {
            success: true,
            message: 'Message sent successfully to Slack',
            data: result.data,
          };
        } else {
          return {
            success: false,
            error: result.error || 'Failed to send Slack message',
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    },
  });
}

// Conversation Task Tool
function createConversationTaskTool(context: ToolContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'create_conversation_task',
    description: 'Create a follow-up task tied to the current conversation (for tracking next steps).',
    schema: z.object({
      title: z.string().describe('Short task title'),
      description: z.string().optional().describe('Details of the task'),
      priority: z.enum(['low','medium','high','urgent']).optional().describe('Priority'),
      dueDate: z.string().optional().describe('Due date/time in ISO format')
    }),
    func: async ({ title, description, priority, dueDate }: { title: string; description?: string; priority?: 'low'|'medium'|'high'|'urgent'; dueDate?: string }) => {
      try {
        const conversationId = context.conversationId;
        const embeddedChatUuid = (context.integrationManager as any).embeddedChatUuid as string | undefined;
        if (!conversationId || !embeddedChatUuid) {
          return { success: false, error: 'No conversation context available' };
        }
        // Direct DB insert to avoid session dependency
        await db.insert(conversationTasksTable).values({
          conversation_id: conversationId,
          title: title.trim(),
          description: description || '',
          priority: (priority as any) || 'medium',
          due_date: dueDate ? new Date(dueDate) : null,
          status: 'todo',
          created_at: new Date(),
          updated_at: new Date(),
        });
        await sendToolNotification(context.profileUuid, 'Tasks', 'Create Task', true, `Task created: ${title}`, { priority: priority || 'medium' });
        return { success: true, message: 'Task created' };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
      }
    }
  });
}

// Calendar Booking Tool
function createCalendarBookingTool(context: ToolContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'book_calendar_meeting',
    description: 'Book a meeting or check availability. For relative times like "next week 2 PM", calculate the specific date and pass it as proposedDateTime with needsConfirmation=true. Never guess email addresses - leave attendees empty for names like "Cem".',
    schema: z.object({
      action: z.enum(['book', 'check_availability']).describe('Whether to book a meeting or check availability'),
      title: z.string().describe('Meeting title - OK to fill from request'),
      proposedDateTime: z.string().optional().describe('Your interpretation of the date/time in ISO format (e.g., next week 2PM → specific date)'),
      startTime: z.string().optional().describe('Confirmed ISO timestamp - only if user already confirmed'),
      endTime: z.string().optional().describe('Confirmed ISO timestamp - only if user already confirmed'),
      attendees: z.array(z.string()).optional().describe('Email addresses ONLY - LEAVE EMPTY for names. Never guess emails.'),
      description: z.string().optional().describe('Meeting description'),
      location: z.string().optional().describe('Meeting location or virtual meeting link'),
      includeGoogleMeet: z.boolean().optional().describe('Include Google Meet link for virtual meetings (only for booking)'),
      needsConfirmation: z.boolean().optional().describe('Set true when proposing a date/time interpretation'),
      duration: z.number().optional().default(60).describe('Meeting duration in minutes (default: 60)'),
    }),
    func: async ({ action, title, proposedDateTime, startTime, endTime, attendees, description, location, includeGoogleMeet, needsConfirmation, duration = 60 }: { 
      action: 'book' | 'check_availability'; 
      title: string; 
      proposedDateTime?: string; 
      startTime?: string; 
      endTime?: string; 
      attendees?: string[]; 
      description?: string; 
      location?: string; 
      includeGoogleMeet?: boolean; 
      needsConfirmation?: boolean; 
      duration?: number 
    }) => {
      try {
        // Normalize proposedDateTime into concrete start/end when provided
        if (action === 'book' && proposedDateTime && (!startTime || !endTime)) {
          const proposed = new Date(proposedDateTime);
          
          // Handle relative date expressions like "next week 2 PM"
          // Check if the proposedDateTime is a relative expression that needs proper calculation
          const isRelativeDate = isNaN(proposed.getTime()) ||
                                proposedDateTime.toLowerCase().includes('next week') ||
                                proposedDateTime.toLowerCase().includes('tomorrow') ||
                                proposedDateTime.toLowerCase().includes('today');
          
          if (isRelativeDate) {
            // Calculate the correct date for relative expressions
            const now = new Date();
            let calculatedDate: Date;
            
            if (proposedDateTime.toLowerCase().includes('next week')) {
              // For "next week", calculate Monday of the following week
              const currentDayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
              // Calculate days until next Monday
              let daysUntilNextMonday;
              if (currentDayOfWeek === 0) {
                // If today is Sunday, next Monday is in 1 day
                daysUntilNextMonday = 1;
              } else {
                // Otherwise, next Monday is in (8 - currentDayOfWeek) days
                daysUntilNextMonday = 8 - currentDayOfWeek;
              }
              calculatedDate = new Date(now.getTime() + (daysUntilNextMonday * 24 * 60 * 60 * 1000));
              
              // Parse the time from the proposedDateTime if provided (e.g., "2 PM")
              const timeMatch = proposedDateTime.match(/(\d{1,2})\s*(AM|PM)/i);
              if (timeMatch) {
                let hours = parseInt(timeMatch[1]);
                const period = timeMatch[2].toUpperCase();
                
                if (period === 'PM' && hours !== 12) {
                  hours += 12;
                } else if (period === 'AM' && hours === 12) {
                  hours = 0;
                }
                
                calculatedDate.setHours(hours, 0, 0, 0);
              }
            } else if (proposedDateTime.toLowerCase().includes('tomorrow')) {
              // For "tomorrow", add 1 day
              calculatedDate = new Date(now.getTime() + (24 * 60 * 60 * 1000));
              
              // Parse the time if provided
              const timeMatch = proposedDateTime.match(/(\d{1,2})\s*(AM|PM|am|pm)/i);
              if (timeMatch) {
                let hours = parseInt(timeMatch[1]);
                const period = timeMatch[2].toUpperCase();
                
                if (period === 'PM' && hours !== 12) {
                  hours += 12;
                } else if (period === 'AM' && hours === 12) {
                  hours = 0;
                }
                
                calculatedDate.setHours(hours, 0, 0, 0);
              }
            } else {
              // For other relative expressions, use the proposed date as-is if valid
              calculatedDate = proposed;
            }
            
            // Use the calculated date if it's valid
            if (!isNaN(calculatedDate.getTime())) {
              startTime = startTime || calculatedDate.toISOString();
              endTime = endTime || new Date(calculatedDate.getTime() + duration * 60000).toISOString();
            } else {
              // Fallback to original logic
              startTime = startTime || proposed.toISOString();
              endTime = endTime || new Date(proposed.getTime() + duration * 60000).toISOString();
            }
          } else {
            // For absolute dates, use the original logic
            startTime = startTime || proposed.toISOString();
            endTime = endTime || new Date(proposed.getTime() + duration * 60000).toISOString();
          }
        }
        
        // ALWAYS use workflow for booking actions to ensure proper validation and availability checks
        // Workflows provide: 1) Availability checking to prevent double bookings
        // 2) Data validation, 3) Proper error handling, 4) Transaction safety
        const shouldUseWorkflow = (action === 'book');
        
        const needsUserInfo = action === 'book' && 
          !context.integrationManager.embeddedChatUuid && 
          (!context.userId || !context.userEmail);

        console.log('[CalendarTool] Workflow detection:', {
          action,
          hasAttendees: !!attendees && attendees.length > 0,
          hasStartTime: !!startTime,
          hasEndTime: !!endTime,
          shouldUseWorkflow,
          needsUserInfo
        });
        
        // For booking actions, ALWAYS use workflow if info is missing
        if (shouldUseWorkflow || needsUserInfo) {
          console.log('[CalendarTool] Triggering workflow system - missing required information');
          
          // Use the workflow system for complex scheduling
          const workflowBrain = new WorkflowBrain();
          const intent = `Schedule a meeting titled "${title}"`;
          const template = await workflowBrain.detectWorkflowNeed(intent);
          
          if (template) {
            // Get conversation context
            let conversationId = context.conversationId;
            if (!conversationId && (context.integrationManager as any).embeddedChatUuid) {
              const latestConvo = await db.query.chatConversationsTable.findFirst({
                where: eq(chatConversationsTable.embedded_chat_uuid, (context.integrationManager as any).embeddedChatUuid),
                orderBy: (conversations, { desc }) => [desc(conversations.created_at)]
              });
              conversationId = latestConvo?.uuid;
            }
            
            if (conversationId) {
              // Check for existing active workflow for this conversation
              const existingWorkflow = await db.query.conversationWorkflowsTable.findFirst({
                where: and(
                  eq(conversationWorkflowsTable.conversation_id, conversationId),
                  eq(conversationWorkflowsTable.template_id, 'meeting_scheduler'),
                  eq(conversationWorkflowsTable.status, 'active')
                )
              });
              
              // Create workflow context
              const memories = await db.select()
                .from(conversationMemoriesTable)
                .where(eq(conversationMemoriesTable.conversation_id, conversationId))
                .limit(20);
              
              const capabilities = context.integrationManager.getAvailableCapabilities().map(c => c.id);
              
              // If we have an existing workflow, merge new data with existing data
              let workflowContext: any;
              let workflow: any;
              
              if (existingWorkflow) {
                console.log('[CalendarTool] Found existing workflow, updating with new data:', {
                  workflowId: existingWorkflow.id,
                  existingContext: existingWorkflow.context
                });
                
                // Merge new data with existing workflow context
                const existingContext = existingWorkflow.context as any || {};
                const existingData = existingContext.existingData || {};
                workflowContext = {
                  conversationId,
                  userId: await getUserIdFromConversation(conversationId),
                  existingData: {
                    ...existingData, // Keep existing data
                    title: title || existingData.title,
                    description: description || existingData.description,
                    location: location || existingData.location,
                    includeGoogleMeet: includeGoogleMeet !== undefined ? includeGoogleMeet : existingData.includeGoogleMeet,
                    attendees: attendees && attendees.length > 0 ? attendees : existingData.attendees || [],
                    startTime: startTime || existingData.startTime || proposedDateTime || existingData.proposedDateTime,
                    endTime: endTime || existingData.endTime || (proposedDateTime ? new Date(new Date(proposedDateTime).getTime() + 60 * 60000).toISOString() : existingData.endTime),
                    proposedDateTime: proposedDateTime || existingData.proposedDateTime,
                    needsConfirmation: needsConfirmation !== undefined ? needsConfirmation : existingData.needsConfirmation
                  },
                  memories,
                  capabilities,
                  timezone: context.clientContext?.timezone || context.integrationManager.clientContext?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                  language: context.clientContext?.locale?.split('-')[0] || 'en'
                };
                
                // Update the existing workflow with new context
                await db.update(conversationWorkflowsTable)
                  .set({ 
                    context: workflowContext,
                    updated_at: new Date()
                  })
                  .where(eq(conversationWorkflowsTable.id, existingWorkflow.id));
                
                workflow = existingWorkflow;
                workflow.context = workflowContext; // Update local copy
                
                console.log('[CalendarTool] Updated existing workflow with merged data:', {
                  workflowId: workflow.id,
                  mergedData: workflowContext.existingData
                });
              } else {
                // No existing workflow, create new one
                workflowContext = {
                  conversationId,
                  userId: await getUserIdFromConversation(conversationId),
                  existingData: { 
                    title, 
                    description, 
                    location, 
                    includeGoogleMeet,
                    attendees: attendees || [],
                    startTime: startTime || proposedDateTime,
                    endTime: endTime || (proposedDateTime ? new Date(new Date(proposedDateTime).getTime() + 60 * 60000).toISOString() : undefined),
                    proposedDateTime,
                    needsConfirmation
                  },
                  memories,
                  capabilities,
                  timezone: context.clientContext?.timezone || context.integrationManager.clientContext?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                  language: context.clientContext?.locale?.split('-')[0] || 'en'
                };
                
                workflow = await workflowBrain.generateWorkflow(template, workflowContext);
              }
              
              console.log('[CalendarTool] Workflow created:', {
                workflowId: workflow.id,
                conversationId,
                status: workflow.status,
                stepsCount: workflow.steps?.length
              });
              
              // Only auto-execute when all required info is present
              const haveTimes = !!(workflowContext.existingData.startTime && workflowContext.existingData.endTime);
              const haveAttendees = Array.isArray(workflowContext.existingData.attendees) && workflowContext.existingData.attendees.length > 0;
              const haveTitle = workflowContext.existingData.title && workflowContext.existingData.title !== 'Meeting' && workflowContext.existingData.title !== 'Meeting Discussion';
              
              // Auto-execute when we have times, attendees, and either a good title or we're updating an existing workflow
              // For existing workflows with "Meeting" as title, auto-execute if we now have all the core data
              const canAutoExecute = haveTimes && haveAttendees && (haveTitle || !!existingWorkflow);
              
              console.log('[CalendarTool] Checking if can auto-execute:', {
                haveTimes,
                haveAttendees,
                haveTitle,
                isExistingWorkflow: !!existingWorkflow,
                canAutoExecute,
                existingData: workflowContext.existingData
              });
              
              if (canAutoExecute) {
                console.log('[CalendarTool] All required info present, executing workflow now');
                const { WorkflowExecutor } = await import('@/lib/workflows/workflow-executor');
                const executor = new WorkflowExecutor({
                  workflowId: workflow.id,
                  conversationId,
                  integrationManager: context.integrationManager,
                  debug: true
                });
                
                // Execute the workflow synchronously and wait for result
                const result = await executor.execute();
                
                if (result.success) {
                  console.log('[CalendarTool] Workflow executed successfully');
                  // Return success with the booking details
                  return {
                    success: true,
                    workflowCreated: true,
                    workflowId: workflow.id,
                    workflowStatus: 'completed',
                    message: `✅ Meeting successfully booked!\n\n📅 **Meeting Details:**\n• Title: ${workflowContext.existingData.title}\n• Date & Time: ${new Date(workflowContext.existingData.startTime).toLocaleString()}\n• Attendees: ${workflowContext.existingData.attendees.join(', ')}\n${workflowContext.existingData.includeGoogleMeet ? '• Google Meet link will be included in the invitation\n' : ''}\nCalendar invitations have been sent to all attendees.`,
                    stopProcessing: false // Allow AI to continue if needed
                  };
                } else {
                  console.error('[CalendarTool] Workflow execution failed:', result.error);
                  return {
                    success: false,
                    error: result.error || 'Failed to execute booking workflow',
                    workflowId: workflow.id,
                    stopProcessing: true
                  };
                }
              } else {
                console.log('[CalendarTool] Workflow waiting for required info before execution', {
                  haveTimes,
                  haveAttendees,
                  haveTitle,
                  missingInfo: {
                    needsTimes: !haveTimes,
                    needsAttendees: !haveAttendees,
                    needsTitle: !haveTitle && !existingWorkflow
                  }
                });
              }
              
              // Format a user-friendly response
              let formattedResponse = '';
              
              // Use the data from workflowContext which has the merged data
              const finalData = workflowContext.existingData;
              
              if ((finalData.proposedDateTime || finalData.startTime) && finalData.needsConfirmation) {
                const proposed = new Date(finalData.proposedDateTime || finalData.startTime);
                const formattedDate = proposed.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric',
                  year: 'numeric'
                });
                const formattedTime = proposed.toLocaleTimeString('en-US', { 
                  hour: 'numeric', 
                  minute: '2-digit',
                  hour12: true 
                });
                
                formattedResponse = `📅 **Proposed Meeting Time**\n`;
                formattedResponse += `• Date: ${formattedDate}\n`;
                formattedResponse += `• Time: ${formattedTime}\n`;
                formattedResponse += `• Duration: ${finalData.duration || duration || 60} minutes\n`;
                
                if (finalData.title && finalData.title !== 'Meeting' && finalData.title !== 'Meeting Discussion') {
                  formattedResponse += `• Title: ${finalData.title}\n`;
                }
                
                let needsInfo = false;
                let infoRequests = `\nℹ️ To complete the booking, I need:\n`;
                
                if (!finalData.attendees || finalData.attendees.length === 0) {
                  infoRequests += `• Email addresses of attendees\n`;
                  needsInfo = true;
                }
                
                if (!finalData.title || finalData.title === 'Meeting' || finalData.title === 'Meeting Discussion') {
                  infoRequests += `• Meeting title/subject\n`;
                  needsInfo = true;
                }
                
                if (needsInfo) {
                  formattedResponse += infoRequests;
                  formattedResponse += `\nPlease provide the missing details to continue.`;
                } else {
                  // All info present, proceed
                  formattedResponse += `\nAll details look good. Proceeding to check availability...`;
                  return {
                    success: true,
                    workflowCreated: true,
                    workflowId: workflow.id,
                    message: formattedResponse,
                    stopProcessing: false  // Allow continuation
                  };
                }
              } else {
                // No proposed time, need more info
                formattedResponse = `📅 I'll help you schedule a meeting.\n\n`;
                formattedResponse += `Please provide:\n`;
                
                if (!finalData.startTime && !finalData.proposedDateTime) {
                  formattedResponse += `• Specific date and time\n`;
                }
                
                if (!finalData.attendees || finalData.attendees.length === 0) {
                  formattedResponse += `• Email addresses of attendees\n`;
                }
                
                if (!finalData.title || finalData.title === 'Meeting' || finalData.title === 'Meeting Discussion') {
                  formattedResponse += `• Meeting title/subject\n`;
                }
              }
              
              // Add workflow status to response
              const workflowStatusMessage = `\n\n📊 **Workflow Status**: ${existingWorkflow ? 'Updated' : 'Created'}\n`;
              
              // Determine if we should stop processing
              // Only stop if we're genuinely waiting for more required info
              const missingCriticalInfo = !haveTimes || !haveAttendees;
              
              if (missingCriticalInfo) {
                return {
                  success: true,
                  workflowCreated: true,
                  workflowId: workflow.id,
                  workflowStatus: 'waiting_for_info',
                  message: formattedResponse + workflowStatusMessage + 
                    `\nℹ️ Workflow is waiting for the missing information before it can proceed with booking.`,
                  stopProcessing: true // Only stop when we need more info from user
                };
              } else {
                // We have all info but may need confirmation
                return {
                  success: true,
                  workflowCreated: true,
                  workflowId: workflow.id,
                  workflowStatus: 'ready',
                  message: formattedResponse + workflowStatusMessage + 
                    `\n✅ All information collected. The workflow will now proceed to book the meeting.`,
                  stopProcessing: false // Don't stop - let AI continue
                };
              }
            }
          }
        }
        
        // Otherwise proceed with direct booking/checking
        console.log('[CalendarTool] Proceeding with direct calendar action');
        
        let userInfo = await getUserInfoFromAuth();
        if (!userInfo && context.conversationId) {
          try {
            const conv = await db.query.chatConversationsTable.findFirst({
              where: eq(chatConversationsTable.uuid, context.conversationId),
              columns: { authenticated_user_id: true }
            });
            if (conv?.authenticated_user_id) {
              const dbUser = await db.query.users.findFirst({
                where: eq(users.id, conv.authenticated_user_id),
                columns: { id: true, name: true, email: true }
              });
              if (dbUser) {
                userInfo = { id: dbUser.id, name: dbUser.name, email: dbUser.email } as any;
              }
            }
          } catch {}
        }
        if (userInfo && !userInfo.email && userInfo.id) {
          try {
            const dbUser = await db.query.users.findFirst({
              where: eq(users.id, userInfo.id),
              columns: { name: true, email: true }
            });
            if (dbUser) {
              userInfo = { ...userInfo, name: userInfo.name || dbUser.name, email: dbUser.email } as any;
            }
          } catch {}
        }
        
        const actionPayload = {
          action,
          title,
          startTime,
          endTime,
          attendees: attendees || [],
          description,
          location,
          includeGoogleMeet: action === 'book' ? includeGoogleMeet : undefined,
          organizerInfo: userInfo ? {
            name: userInfo.name || userInfo.username,
            email: userInfo.email,
          } : null,
        };

        const calendarAction = {
          type: action === 'book' ? 'schedule_meeting' : 'check_availability',
          payload: actionPayload,
          personaId: context.personaId,
          conversationId: context.conversationId,
        };

        const result = await context.integrationManager.executeAction(calendarAction);
        
        // Send notification
        await sendToolNotification(
          context.profileUuid,
          'Calendar',
          action === 'book' ? 'Book Meeting' : 'Check Availability',
          result.success,
          result.success 
            ? action === 'book' 
              ? `Meeting booked: "${title}" from ${startTime} to ${endTime}`
              : `Availability checked for ${startTime} to ${endTime}`
            : `Failed to ${action === 'book' ? 'book meeting' : 'check availability'}: ${result.error}`,
          {
            action,
            title,
            startTime,
            endTime,
            attendeesCount: attendees?.length || 0,
            location,
            includeGoogleMeet: action === 'book' ? includeGoogleMeet : undefined
          }
        );
        
        if (result.success) {
          return {
            success: true,
            message: action === 'book' ? 'Meeting booked successfully' : 'Availability checked successfully',
            data: result.data,
          };
        } else {
          return {
            success: false,
            error: result.error || 'Failed to perform calendar action',
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    },
  });
}

// Email Sending Tool
function createEmailSendingTool(context: ToolContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'send_email',
    description: 'Send an email using the beautiful email template',
    schema: z.object({
      to: z.string().describe('Recipient email address'),
      subject: z.string().describe('Email subject'),
      message: z.string().describe('Email body content'),
      personaName: z.string().optional().describe('Name of the persona sending the email'),
    }),
    func: async ({ to, subject, message, personaName }: { to: string; subject: string; message: string; personaName?: string }) => {
      try {
        let userInfo = await getUserInfoFromAuth();
        if (!userInfo && context.conversationId) {
          try {
            const conv = await db.query.chatConversationsTable.findFirst({
              where: eq(chatConversationsTable.uuid, context.conversationId),
              columns: { authenticated_user_id: true }
            });
            if (conv?.authenticated_user_id) {
              const dbUser = await db.query.users.findFirst({
                where: eq(users.id, conv.authenticated_user_id),
                columns: { id: true, name: true, email: true }
              });
              if (dbUser) {
                userInfo = { id: dbUser.id, name: dbUser.name, email: dbUser.email } as any;
              }
            }
          } catch {}
        }
        if (userInfo && !userInfo.email && userInfo.id) {
          try {
            const dbUser = await db.query.users.findFirst({
              where: eq(users.id, userInfo.id),
              columns: { name: true, email: true }
            });
            if (dbUser) {
              userInfo = { ...userInfo, name: userInfo.name || dbUser.name, email: dbUser.email } as any;
            }
          } catch {}
        }
        
        const action = {
          type: 'send_email',
          payload: {
            to,
            subject,
            message,
            personaName: personaName || 'AI Assistant',
          },
          personaId: context.personaId,
          conversationId: context.conversationId,
        };

        const result = await context.integrationManager.executeAction(action);
        
        // Send notification
        await sendToolNotification(
          context.profileUuid,
          'Email',
          'Send Email',
          result.success,
          result.success 
            ? `Email sent to ${to}: "${subject}"`
            : `Failed to send email: ${result.error}`,
          {
            recipient: to,
            subject,
            messageLength: message.length,
            personaName: personaName || 'AI Assistant'
          }
        );
        
        if (result.success) {
          return {
            success: true,
            message: 'Email sent successfully',
            data: result.data,
          };
        } else {
          return {
            success: false,
            error: result.error || 'Failed to send email',
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    },
  });
}

// CRM Lead Tool
function createCRMLeadTool(context: ToolContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'create_crm_lead',
    description: 'Create a new lead in the CRM system',
    schema: z.object({
      firstName: z.string().describe('Lead first name'),
      lastName: z.string().describe('Lead last name'),
      email: z.string().email().describe('Lead email address'),
      phone: z.string().optional().describe('Lead phone number'),
      company: z.string().optional().describe('Lead company name'),
      title: z.string().optional().describe('Lead job title'),
      source: z.string().optional().describe('Lead source'),
      notes: z.string().optional().describe('Additional notes about the lead'),
    }),
    func: async ({ firstName, lastName, email, phone, company, title, source, notes }: { 
      firstName: string; 
      lastName: string; 
      email: string; 
      phone?: string; 
      company?: string; 
      title?: string; 
      source?: string; 
      notes?: string 
    }) => {
      try {
        let userInfo = await getUserInfoFromAuth();
        if (!userInfo && context.conversationId) {
          try {
            const conv = await db.query.chatConversationsTable.findFirst({
              where: eq(chatConversationsTable.uuid, context.conversationId),
              columns: { authenticated_user_id: true }
            });
            if (conv?.authenticated_user_id) {
              const dbUser = await db.query.users.findFirst({
                where: eq(users.id, conv.authenticated_user_id),
                columns: { id: true, name: true, email: true }
              });
              if (dbUser) {
                userInfo = { id: dbUser.id, name: dbUser.name, email: dbUser.email } as any;
              }
            }
          } catch {}
        }
        if (userInfo && !userInfo.email && userInfo.id) {
          try {
            const dbUser = await db.query.users.findFirst({
              where: eq(users.id, userInfo.id),
              columns: { name: true, email: true }
            });
            if (dbUser) {
              userInfo = { ...userInfo, name: userInfo.name || dbUser.name, email: dbUser.email } as any;
            }
          } catch {}
        }
        
        const action = {
          type: 'create_lead',
          payload: {
            firstName,
            lastName,
            email,
            phone,
            company,
            title,
            source: source || 'Plugged.in Chat',
            notes,
            createdBy: userInfo ? {
              name: userInfo.name || userInfo.username,
              email: userInfo.email,
            } : null,
          },
          personaId: context.personaId,
          conversationId: context.conversationId,
        };

        const result = await context.integrationManager.executeAction(action);
        
        // Send notification
        await sendToolNotification(
          context.profileUuid,
          'CRM',
          'Create Lead',
          result.success,
          result.success 
            ? `Lead created: ${firstName} ${lastName} (${email})${company ? ` from ${company}` : ''}`
            : `Failed to create lead: ${result.error}`,
          {
            leadName: `${firstName} ${lastName}`,
            email,
            company,
            source: source || 'Plugged.in Chat'
          }
        );
        
        if (result.success) {
          return {
            success: true,
            message: 'CRM lead created successfully',
            data: result.data,
          };
        } else {
          return {
            success: false,
            error: result.error || 'Failed to create CRM lead',
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    },
  });
}

// Support Ticket Tool
function createSupportTicketTool(context: ToolContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'create_support_ticket',
    description: 'Create a new support ticket',
    schema: z.object({
      title: z.string().describe('Ticket title'),
      description: z.string().describe('Ticket description'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().describe('Ticket priority'),
      category: z.string().optional().describe('Ticket category'),
      assignee: z.string().optional().describe('Ticket assignee email'),
    }),
    func: async ({ title, description, priority, category, assignee }: { 
      title: string; 
      description: string; 
      priority?: 'low' | 'medium' | 'high' | 'urgent'; 
      category?: string; 
      assignee?: string 
    }) => {
      try {
        const userInfo = await getUserInfoFromAuth();
        
        const action = {
          type: 'create_ticket',
          payload: {
            title,
            description,
            priority: priority || 'medium',
            category: category || 'General',
            assignee,
            requester: userInfo ? {
              name: userInfo.name || userInfo.username,
              email: userInfo.email,
            } : null,
          },
          personaId: context.personaId,
          conversationId: context.conversationId,
        };

        const result = await context.integrationManager.executeAction(action);
        
        // Send notification
        await sendToolNotification(
          context.profileUuid,
          'Support',
          'Create Ticket',
          result.success,
          result.success 
            ? `Support ticket created: "${title}" (${priority || 'medium'} priority)`
            : `Failed to create ticket: ${result.error}`,
          {
            title,
            priority: priority || 'medium',
            category: category || 'General',
            assignee
          }
        );
        
        if (result.success) {
          return {
            success: true,
            message: 'Support ticket created successfully',
            data: result.data,
          };
        } else {
          return {
            success: false,
            error: result.error || 'Failed to create support ticket',
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    },
  });
}
// Workflow Trigger Tool - Intelligently manages multi-step processes
function createWorkflowTriggerTool(context: ToolContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'manage_workflow',
    description: 'Intelligently manages complex multi-step workflows like scheduling meetings, creating support tickets, etc. This tool detects when a workflow is needed and orchestrates the entire process.',
    schema: z.object({
      intent: z.string().describe('The user\'s intent or request (e.g., "schedule a meeting with the team")'),
      existingData: z.record(z.any()).optional().describe('Any data already collected from the conversation'),
      action: z.enum(['detect', 'create', 'continue', 'status']).describe('Action to take: detect if workflow needed, create new workflow, continue existing, or get status'),
      workflowId: z.string().optional().describe('ID of existing workflow to continue or check status'),
    }),
    func: async ({ intent, existingData = {}, action, workflowId }: { 
      intent: string; 
      existingData?: Record<string, any>; 
      action: 'detect' | 'create' | 'continue' | 'status'; 
      workflowId?: string 
    }) => {
      try {
        const workflowBrain = new WorkflowBrain();
        const infoOrchestrator = new InformationOrchestrator();
        
        // Get conversation context
        let conversationId = context.conversationId;
        if (!conversationId && (context.integrationManager as any).embeddedChatUuid) {
          const latestConvo = await db.query.chatConversationsTable.findFirst({
            where: eq(chatConversationsTable.embedded_chat_uuid, (context.integrationManager as any).embeddedChatUuid),
            orderBy: (conversations, { desc }) => [desc(conversations.created_at)]
          });
          conversationId = latestConvo?.uuid;
        }
        
        if (!conversationId) {
          return { success: false, error: 'No conversation context available' };
        }
        
        switch (action) {
          case 'detect': {
            // Detect if a workflow is needed
            const template = await workflowBrain.detectWorkflowNeed(intent);
            
            if (template) {
              // Get existing memories and data
              const memories = await db.select()
                .from(conversationMemoriesTable)
                .where(eq(conversationMemoriesTable.conversation_id, conversationId))
                .orderBy(desc(conversationMemoriesTable.created_at))
                .limit(20);
              
              // Get user capabilities
              const capabilities = context.integrationManager.getAvailableCapabilities().map(c => c.id);
              
              // Create workflow context
              const workflowContext = {
                conversationId,
                userId: await getUserIdFromConversation(conversationId),
                existingData,
                memories,
                capabilities,
                timezone: context.clientContext?.timezone || context.integrationManager.clientContext?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
                language: context.clientContext?.locale?.split('-')[0] || 'en'
              };
              
              // Generate optimized workflow
              const workflow = await workflowBrain.generateWorkflow(template, workflowContext);
              
              // Get first task to execute
              const nextTask = await workflowBrain.getNextTask(workflow.id);
              
              if (nextTask) {
                // Identify what information is needed
                const missingInfo = await infoOrchestrator.identifyMissingInfo(workflow, nextTask.id);
                
                if (missingInfo.length > 0) {
                  // Generate prompts for missing information
                  const prompts = await Promise.all(
                    missingInfo.map(info => infoOrchestrator.generatePrompt(info, { 
                      purpose: template.name,
                      action: intent 
                    }))
                  );
                  
                  return {
                    success: true,
                    workflowId: workflow.id,
                    templateName: template.name,
                    status: 'gathering_information',
                    nextStep: nextTask.title,
                    requiredInfo: missingInfo.map(info => info.field),
                    prompts: prompts.map(p => p.message),
                    message: `I'll help you ${template.name.toLowerCase()}. ${prompts[0]?.message || 'Let me gather some information first.'}`
                  };
                } else {
                  // All information available, proceed with execution
                  return {
                    success: true,
                    workflowId: workflow.id,
                    templateName: template.name,
                    status: 'ready',
                    nextStep: nextTask.title,
                    message: `Great! I have all the information needed. Starting ${template.name.toLowerCase()}...`
                  };
                }
              }
              
              return {
                success: true,
                workflowId: workflow.id,
                templateName: template.name,
                status: 'created',
                message: `Workflow created for ${template.name.toLowerCase()}`
              };
            } else {
              return {
                success: true,
                workflowNeeded: false,
                message: 'No complex workflow detected for this request'
              };
            }
          }
          
          case 'create': {
            // Explicitly create a workflow
            const template = await workflowBrain.detectWorkflowNeed(intent);
            
            if (!template) {
              return { success: false, error: 'Could not determine appropriate workflow for this request' };
            }
            
            const memories = await db.select()
              .from(conversationMemoriesTable)
              .where(eq(conversationMemoriesTable.conversation_id, conversationId))
              .limit(20);
            
            const capabilities = context.integrationManager.getAvailableCapabilities().map(c => c.id);
            
            const workflowContext = {
              conversationId,
              userId: await getUserIdFromConversation(conversationId),
              existingData,
              memories,
              capabilities,
              timezone: context.clientContext?.timezone || context.integrationManager.clientContext?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
              language: context.clientContext?.locale?.split('-')[0] || 'en'
            };
            
            const workflow = await workflowBrain.generateWorkflow(template, workflowContext);
            
            await sendToolNotification(
              context.profileUuid,
              'Workflow',
              'Create Workflow',
              true,
              `Workflow created: ${template.name}`,
              { workflowId: workflow.id, template: template.name }
            );
            
            // Auto-execute the workflow if it's a booking workflow and we have all data
            if (template.category === 'scheduling' && existingData.startTime && existingData.endTime) {
              try {
                const { WorkflowExecutor } = await import('@/lib/workflows/workflow-executor');
                
                console.log('[WorkflowTrigger] Auto-executing workflow with integration manager:', {
                  hasIntegrationManager: !!context.integrationManager,
                  capabilities: context.integrationManager?.getAvailableCapabilities?.()
                });
                
                const executor = new WorkflowExecutor({
                  workflowId: workflow.id,
                  conversationId,
                  integrationManager: context.integrationManager,
                  debug: true
                });
                
                const executionResult = await executor.execute();
                
                console.log('[WorkflowTrigger] Execution result:', executionResult);
                
                if (executionResult.success) {
                  return {
                    success: true,
                    workflowId: workflow.id,
                    templateName: template.name,
                    status: 'completed',
                    stepsCount: workflow.steps.length,
                    message: `${template.name} workflow executed successfully. Meeting has been booked.`,
                    autoExecuted: true
                  };
                }
              } catch (execError) {
                console.error('[WorkflowTrigger] Auto-execution failed:', execError);
                // Continue with normal flow if auto-execution fails
              }
            }
            
            return {
              success: true,
              workflowId: workflow.id,
              templateName: template.name,
              status: 'created',
              stepsCount: workflow.steps.length,
              message: `Created ${template.name} workflow with ${workflow.steps.length} steps`
            };
          }
          
          case 'continue': {
            // Continue an existing workflow
            if (!workflowId) {
              return { success: false, error: 'Workflow ID required to continue' };
            }
            
            // If caller supplied new data, merge it into workflow context
            if (existingData && Object.keys(existingData).length > 0) {
              try {
                const current = await db.query.conversationWorkflowsTable.findFirst({
                  where: eq(conversationWorkflowsTable.id, workflowId),
                  columns: { context: true }
                });
                const currentContext = (current?.context as any) || {};
                const mergedContext = {
                  ...currentContext,
                  existingData: {
                    ...(currentContext.existingData || {}),
                    ...existingData
                  }
                };
                await db.update(conversationWorkflowsTable)
                  .set({ context: mergedContext, updated_at: new Date() })
                  .where(eq(conversationWorkflowsTable.id, workflowId));
              } catch (mergeErr) {
                console.error('[WorkflowTrigger] Failed to merge existingData into workflow context:', mergeErr);
              }
            }
            
            const nextTask = await workflowBrain.getNextTask(workflowId);
            
            if (!nextTask) {
              return {
                success: true,
                workflowId,
                status: 'completed',
                message: 'All workflow tasks have been completed'
              };
            }
            
            // Check for missing information
            const workflow = { id: workflowId, conversationId };
            const missingInfo = await infoOrchestrator.identifyMissingInfo(workflow, nextTask.id);
            
            if (missingInfo.length > 0) {
              const prompts = await Promise.all(
                missingInfo.map(info => infoOrchestrator.generatePrompt(info))
              );
              
              return {
                success: true,
                workflowId,
                status: 'gathering_information',
                currentTask: nextTask.title,
                requiredInfo: missingInfo.map(info => info.field),
                prompts: prompts.map(p => p.message),
                message: prompts[0]?.message || 'Please provide the required information'
              };
            }
            
            // No missing info → auto-execute the workflow now
            try {
              const { WorkflowExecutor } = await import('@/lib/workflows/workflow-executor');
              const executor = new WorkflowExecutor({
                workflowId,
                conversationId: conversationId!,
                integrationManager: context.integrationManager,
                debug: true
              });
              const execResult = await executor.execute();
              return execResult.success
                ? {
                    success: true,
                    workflowId,
                    status: 'completed',
                    message: 'All workflow tasks have been completed'
                  }
                : {
                    success: false,
                    error: execResult.error || 'Workflow execution failed'
                  };
            } catch (err) {
              return {
                success: false,
                error: err instanceof Error ? err.message : 'Failed to execute workflow'
              };
            }
          }
          
          case 'status': {
            // Get workflow status
            if (!workflowId) {
              return { success: false, error: 'Workflow ID required for status check' };
            }
            
            const workflow = await db.query.conversationWorkflowsTable.findFirst({
              where: eq(conversationWorkflowsTable.id, workflowId),
              with: {
                tasks: true,
                template: true
              }
            });
            
            if (!workflow) {
              return { success: false, error: 'Workflow not found' };
            }
            
            const completedTasks = workflow.tasks.filter(t => t.status === 'completed').length;
            const totalTasks = workflow.tasks.length;
            const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
            
            return {
              success: true,
              workflowId,
              templateName: (workflow.template as any)?.name,
              status: workflow.status,
              progress: Math.round(progress),
              completedTasks,
              totalTasks,
              currentTask: workflow.tasks.find(t => t.status === 'active')?.title,
              message: `Workflow is ${workflow.status}: ${completedTasks}/${totalTasks} tasks completed (${Math.round(progress)}%)`
            };
          }
          
          default:
            return { success: false, error: `Unknown action: ${action}` };
        }
      } catch (error) {
        console.error('Workflow management error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Workflow management failed',
        };
      }
    },
  });
}

// Helper function to get user ID from conversation
async function getUserIdFromConversation(conversationId: string): Promise<string | undefined> {
  const conversation = await db.query.chatConversationsTable.findFirst({
    where: eq(chatConversationsTable.uuid, conversationId),
    columns: { authenticated_user_id: true }
  });
  return conversation?.authenticated_user_id || undefined;
}
