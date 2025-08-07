import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { IntegrationManager } from './base-service';
import { getUserInfoFromAuth } from '@/lib/auth';

// Tool context interface
export interface ToolContext {
  integrationManager: IntegrationManager;
  personaId: number;
  conversationId?: string;
}

// Base tool factory function
export function createPersonaTools(context: ToolContext): DynamicStructuredTool[] {
  const tools: DynamicStructuredTool[] = [];

  // Get available capabilities from the integration manager
  const availableCapabilities = context.integrationManager.getAvailableCapabilities();

  // Create tools based on enabled capabilities
  for (const capability of availableCapabilities) {
    switch (capability.id) {
      case 'send_slack':
        tools.push(createSlackMessageTool(context));
        break;
      case 'schedule_meeting':
      case 'check_availability':
        tools.push(createCalendarBookingTool(context));
        break;
      case 'send_email':
        tools.push(createEmailSendingTool(context));
        break;
      case 'create_lead':
        tools.push(createCRMLeadTool(context));
        break;
      case 'create_ticket':
        tools.push(createSupportTicketTool(context));
        break;
    }
  }

  return tools;
}

// Slack Message Tool
function createSlackMessageTool(context: ToolContext): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'send_slack_message',
    description: 'Send a message to a Slack channel',
    schema: z.object({
      channel: z.string().describe('The Slack channel to send the message to (e.g., #general)'),
      message: z.string().describe('The message content to send'),
      thread_ts: z.string().optional().describe('Thread timestamp to reply to (optional)'),
    }),
    func: async ({ channel, message, thread_ts }) => {
      try {
        const userInfo = await getUserInfoFromAuth();
        
        const action = {
          type: 'send_message',
          payload: {
            channel,
            message,
            thread_ts,
            senderInfo: userInfo ? {
              name: userInfo.name || userInfo.username,
              email: userInfo.email,
            } : null,
          },
          personaId: context.personaId,
          conversationId: context.conversationId,
        };

        const result = await context.integrationManager.executeAction(action);
        
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
    }),
    func: async ({ action, title, startTime, endTime, attendees, description, location }) => {
      try {
        const userInfo = await getUserInfoFromAuth();
        
        const actionPayload = {
          action,
          title,
          startTime,
          endTime,
          attendees: attendees || [],
          description,
          location,
          organizerInfo: userInfo ? {
            name: userInfo.name || userInfo.username,
            email: userInfo.email,
          } : null,
        };

        const calendarAction = {
          type: action === 'book' ? 'create_event' : 'check_availability',
          payload: actionPayload,
          personaId: context.personaId,
          conversationId: context.conversationId,
        };

        const result = await context.integrationManager.executeAction(calendarAction);
        
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
        const userInfo = await getUserInfoFromAuth();
        
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
        const userInfo = await getUserInfoFromAuth();
        
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