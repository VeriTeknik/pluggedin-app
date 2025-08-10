import { DynamicStructuredTool } from '@langchain/core/tools';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { createNotification } from '@/app/actions/notifications';
import { db } from '@/db';
import { chatConversationsTable, users } from '@/db/schema';
import { getUserInfoFromAuth } from '@/lib/auth';

import { IntegrationManager } from './base-service';

// Tool context interface
export interface ToolContext {
  integrationManager: IntegrationManager & {
    integrationsConfig?: any; // Allow access to integrations config
    embeddedChatUuid?: string;
  };
  personaId: number;
  conversationId?: string; // May be missing for embedded chat; we resolve latest conversation if not provided
  profileUuid?: string; // Add profile UUID for notifications
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
    }
  }

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
    func: async ({ channel, message, thread_ts }) => {
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

// Calendar Booking Tool
function createCalendarBookingTool(context: ToolContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'book_calendar_meeting',
    description: 'Book a meeting or check calendar availability',
    schema: z.object({
      action: z.enum(['book', 'check_availability']).describe('Whether to book a meeting or check availability'),
      title: z.string().describe('Meeting title'),
      startTime: z.string().describe('Start time in ISO format (e.g., 2024-01-01T10:00:00)'),
      endTime: z.string().describe('End time in ISO format (e.g., 2024-01-01T11:00:00)'),
      attendees: z.array(z.string()).optional().describe('List of attendee emails'),
      description: z.string().optional().describe('Meeting description'),
      location: z.string().optional().describe('Meeting location or virtual meeting link'),
      includeGoogleMeet: z.boolean().optional().describe('Include Google Meet link for virtual meetings (only for booking)'),
    }),
    func: async ({ action, title, startTime, endTime, attendees, description, location, includeGoogleMeet }) => {
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
    func: async ({ to, subject, message, personaName }) => {
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
    func: async ({ firstName, lastName, email, phone, company, title, source, notes }) => {
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
    func: async ({ title, description, priority, category, assignee }) => {
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