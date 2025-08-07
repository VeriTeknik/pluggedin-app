import { PersonaCapability,PersonaIntegrations } from './types';

export interface PersonaPromptConfig {
  personaName: string;
  personaRole: string;
  personaDescription?: string;
  integrations: PersonaIntegrations;
  capabilities: PersonaCapability[];
  customInstructions?: string;
  conversationContext?: {
    userId?: string;
    userName?: string;
    previousMessages?: number;
  };
}

export function generatePersonaSystemPrompt(config: PersonaPromptConfig): string {
  const { 
    personaName, 
    personaRole, 
    personaDescription,
    integrations, 
    capabilities,
    customInstructions,
    conversationContext
  } = config;

  const enabledCapabilities = capabilities.filter(cap => cap.enabled);
  
  let prompt = `You are ${personaName}, acting as ${personaRole}.`;
  
  if (personaDescription) {
    prompt += ` ${personaDescription}`;
  }

  prompt += '\n\n## Your Capabilities\n\n';
  prompt += 'You have been granted the following abilities to assist users:\n\n';

  // Calendar capabilities
  const calendarCaps = enabledCapabilities.filter(c => c.category === 'calendar');
  if (calendarCaps.length > 0 && integrations.calendar?.enabled) {
    prompt += '### Calendar Management\n';
    prompt += `You can interact with ${integrations.calendar.provider.replace('_', ' ')} to:\n`;
    calendarCaps.forEach(cap => {
      prompt += `- ${cap.description}\n`;
    });
    prompt += '\n';
    prompt += generateCalendarInstructions(integrations.calendar.provider);
    prompt += '\n';
  }

  // Communication capabilities
  const commCaps = enabledCapabilities.filter(c => c.category === 'communication');
  if (commCaps.length > 0) {
    prompt += '### Communication\n';
    
    if (integrations.communication?.slack?.enabled) {
      prompt += 'You can send messages via Slack to:\n';
      prompt += '- Notify team members about important updates\n';
      prompt += '- Send direct messages to specific users\n';
      prompt += '- Post to designated channels\n';
      if (integrations.communication.slack.config.channel) {
        prompt += `- Default channel: #${integrations.communication.slack.config.channel}\n`;
      }
      prompt += '\n';
    }

    if (integrations.communication?.email?.enabled) {
      prompt += 'You can send emails to:\n';
      prompt += '- Send follow-up emails after meetings\n';
      prompt += '- Notify users about scheduled appointments\n';
      prompt += '- Send important updates and reminders\n';
      prompt += '\n';
    }
  }

  // CRM capabilities
  const crmCaps = enabledCapabilities.filter(c => c.category === 'crm');
  if (crmCaps.length > 0 && integrations.crm?.enabled) {
    prompt += '### CRM Management\n';
    prompt += `You can interact with ${integrations.crm.provider} to:\n`;
    crmCaps.forEach(cap => {
      prompt += `- ${cap.description}\n`;
    });
    prompt += '\n';
  }

  // Support capabilities
  const supportCaps = enabledCapabilities.filter(c => c.category === 'support');
  if (supportCaps.length > 0 && integrations.support?.enabled) {
    prompt += '### Support Management\n';
    supportCaps.forEach(cap => {
      prompt += `- ${cap.description}\n`;
    });
    prompt += '\n';
  }

  // Tool usage instructions
  prompt += '## How to Use Your Capabilities\n\n';
  prompt += generateToolInstructions(enabledCapabilities);
  prompt += '\n';

  // Behavioral guidelines
  prompt += '## Behavioral Guidelines\n\n';
  prompt += '1. **Be Proactive**: When users mention scheduling, meetings, or appointments, offer to help using your calendar capabilities.\n';
  prompt += '2. **Confirm Before Acting**: Always confirm details with the user before scheduling meetings or sending messages.\n';
  prompt += '3. **Provide Clear Feedback**: After completing an action, clearly communicate what was done.\n';
  prompt += '4. **Handle Errors Gracefully**: If an integration fails, explain the issue and suggest alternatives.\n';
  prompt += '5. **Respect Privacy**: Only access and share information the user has explicitly authorized.\n';
  prompt += '6. **Time Zone Awareness**: Always clarify time zones when scheduling meetings.\n';
  prompt += '7. **Professional Communication**: Maintain a professional tone in all automated messages.\n\n';

  // Context awareness
  if (conversationContext) {
    prompt += '## Current Context\n\n';
    if (conversationContext.userName) {
      prompt += `You are currently assisting ${conversationContext.userName}.\n`;
    }
    if (conversationContext.previousMessages) {
      prompt += `This conversation has ${conversationContext.previousMessages} previous messages.\n`;
    }
    prompt += '\n';
  }

  // Custom instructions
  if (customInstructions) {
    prompt += '## Additional Instructions\n\n';
    prompt += customInstructions;
    prompt += '\n';
  }

  // Response format
  prompt += '## Response Format\n\n';
  prompt += 'When using your capabilities:\n';
  prompt += '1. First, acknowledge the user\'s request\n';
  prompt += '2. Clarify any missing details\n';
  prompt += '3. Execute the action using the appropriate tool\n';
  prompt += '4. Provide confirmation with relevant details (meeting link, message sent, etc.)\n';
  prompt += '5. Offer follow-up assistance if needed\n\n';

  prompt += 'Remember: You are an AI assistant with real capabilities to interact with external systems. Use these powers responsibly and always in the user\'s best interest.';

  return prompt;
}

function generateCalendarInstructions(provider: string): string {
  const baseInstructions = `
When scheduling meetings:
1. Always confirm the date, time, and duration
2. Ask for attendee email addresses if not provided
3. Clarify the time zone (default to user's local time if known)
4. Provide a clear meeting title and description
5. Share the meeting link after successful scheduling`;

  switch (provider) {
    case 'google_calendar':
      return baseInstructions + `
6. Mention that invites will be sent via Google Calendar
7. Attendees will receive email notifications`;
    
    case 'calendly':
      return baseInstructions + `
6. Provide the Calendly booking link
7. Let users know they can reschedule through Calendly`;
    
    case 'cal_com':
      return baseInstructions + `
6. Share the Cal.com booking page
7. Mention available time slots`;
    
    default:
      return baseInstructions;
  }
}

function generateToolInstructions(capabilities: PersonaCapability[]): string {
  let instructions = 'To use your capabilities, you will need to call specific functions:\n\n';

  const capabilityMap: Record<string, string> = {
    'schedule_meeting': 'Use `schedule_meeting` with parameters: title, description, startTime, endTime, attendees, location',
    'check_availability': 'Use `check_availability` with parameters: startTime, endTime, duration',
    'send_slack': 'Use `send_slack` with parameters: text, channel (optional), attachments (optional)',
    'send_email': 'Use `send_email` with parameters: to, subject, body, cc (optional)',
    'create_lead': 'Use `create_lead` with parameters: name, email, company, notes',
    'create_ticket': 'Use `create_ticket` with parameters: title, description, priority, category',
    'notify_team': 'Use `notify_team` with parameters: message, urgency, channels',
  };

  capabilities.forEach(cap => {
    if (capabilityMap[cap.id]) {
      instructions += `- **${cap.name}**: ${capabilityMap[cap.id]}\n`;
    }
  });

  instructions += '\nThese functions will be executed through the integration system, and results will be returned to you to share with the user.';
  
  return instructions;
}

export function generateToolDefinitions(capabilities: PersonaCapability[]): any[] {
  const tools: any[] = [];

  capabilities.forEach(cap => {
    if (!cap.enabled) return;

    switch (cap.id) {
      case 'schedule_meeting':
        tools.push({
          type: 'function',
          function: {
            name: 'schedule_meeting',
            description: 'Schedule a meeting using the connected calendar service',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Meeting title' },
                description: { type: 'string', description: 'Meeting description' },
                startTime: { type: 'string', description: 'Start time in ISO format' },
                endTime: { type: 'string', description: 'End time in ISO format' },
                attendees: { 
                  type: 'array', 
                  items: { type: 'string' },
                  description: 'Email addresses of attendees' 
                },
                location: { type: 'string', description: 'Meeting location or video link' },
                timeZone: { type: 'string', description: 'Time zone (e.g., America/New_York)' }
              },
              required: ['title', 'startTime', 'endTime']
            }
          }
        });
        break;

      case 'check_availability':
        tools.push({
          type: 'function',
          function: {
            name: 'check_availability',
            description: 'Check calendar availability for scheduling',
            parameters: {
              type: 'object',
              properties: {
                startTime: { type: 'string', description: 'Start of time range in ISO format' },
                endTime: { type: 'string', description: 'End of time range in ISO format' },
                duration: { type: 'number', description: 'Meeting duration in minutes' }
              },
              required: ['startTime', 'endTime']
            }
          }
        });
        break;

      case 'send_slack':
        tools.push({
          type: 'function',
          function: {
            name: 'send_slack',
            description: 'Send a message to Slack',
            parameters: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'Message text' },
                channel: { type: 'string', description: 'Channel name or ID (optional)' },
                thread_ts: { type: 'string', description: 'Thread timestamp for replies' },
                attachments: { 
                  type: 'array',
                  description: 'Rich message attachments'
                }
              },
              required: ['text']
            }
          }
        });
        break;

      case 'send_email':
        tools.push({
          type: 'function',
          function: {
            name: 'send_email',
            description: 'Send an email',
            parameters: {
              type: 'object',
              properties: {
                to: { 
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Recipient email addresses'
                },
                subject: { type: 'string', description: 'Email subject' },
                body: { type: 'string', description: 'Email body (HTML supported)' },
                cc: { 
                  type: 'array',
                  items: { type: 'string' },
                  description: 'CC recipients'
                },
                bcc: { 
                  type: 'array',
                  items: { type: 'string' },
                  description: 'BCC recipients'
                }
              },
              required: ['to', 'subject', 'body']
            }
          }
        });
        break;

      case 'create_lead':
        tools.push({
          type: 'function',
          function: {
            name: 'create_lead',
            description: 'Create a new lead in the CRM',
            parameters: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Lead name' },
                email: { type: 'string', description: 'Lead email' },
                company: { type: 'string', description: 'Company name' },
                phone: { type: 'string', description: 'Phone number' },
                notes: { type: 'string', description: 'Additional notes' },
                source: { type: 'string', description: 'Lead source' }
              },
              required: ['name', 'email']
            }
          }
        });
        break;

      case 'create_ticket':
        tools.push({
          type: 'function',
          function: {
            name: 'create_ticket',
            description: 'Create a support ticket',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Ticket title' },
                description: { type: 'string', description: 'Ticket description' },
                priority: { 
                  type: 'string',
                  enum: ['low', 'medium', 'high', 'urgent'],
                  description: 'Ticket priority'
                },
                category: { type: 'string', description: 'Ticket category' },
                assignee: { type: 'string', description: 'Assigned to (email or ID)' }
              },
              required: ['title', 'description']
            }
          }
        });
        break;

      case 'notify_team':
        tools.push({
          type: 'function',
          function: {
            name: 'notify_team',
            description: 'Send urgent notification to team',
            parameters: {
              type: 'object',
              properties: {
                message: { type: 'string', description: 'Notification message' },
                urgency: { 
                  type: 'string',
                  enum: ['low', 'medium', 'high', 'critical'],
                  description: 'Message urgency level'
                },
                channels: { 
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Channels to notify (slack, email, etc.)'
                }
              },
              required: ['message']
            }
          }
        });
        break;
    }
  });

  return tools;
}