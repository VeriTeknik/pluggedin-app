// Integration Types and Interfaces

export type IntegrationType = 'calendar' | 'communication' | 'crm' | 'support';

export type CalendarProvider = 'google_calendar' | 'calendly' | 'cal_com';
export type CommunicationProvider = 'slack' | 'email' | 'discord' | 'teams';
export type CRMProvider = 'hubspot' | 'salesforce' | 'pipedrive';

export interface BaseIntegration {
  enabled: boolean;
  provider: string;
  config: Record<string, any>;
  lastSync?: Date;
  status?: 'active' | 'error' | 'inactive';
}

export interface CalendarIntegration extends BaseIntegration {
  provider: CalendarProvider;
  config: {
    accessToken?: string;
    refreshToken?: string;
    calendarId?: string;
    webhookUrl?: string;
    apiKey?: string;
  };
}

export interface SlackIntegration extends BaseIntegration {
  provider: 'slack';
  config: {
    webhookUrl?: string;
    botToken?: string;
    channel?: string;
    teamId?: string;
  };
}

export interface EmailIntegration extends BaseIntegration {
  provider: 'email';
  config: {
    smtp?: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
    sendgridApiKey?: string;
    templates?: Record<string, string>;
  };
}

export interface CRMIntegration extends BaseIntegration {
  provider: CRMProvider;
  config: {
    apiKey?: string;
    accessToken?: string;
    refreshToken?: string;
    accountId?: string;
    pipelineId?: string;
  };
}

export interface PersonaIntegrations {
  calendar?: CalendarIntegration;
  communication?: {
    slack?: SlackIntegration;
    email?: EmailIntegration;
    discord?: BaseIntegration;
    teams?: BaseIntegration;
  };
  crm?: CRMIntegration;
  support?: BaseIntegration;
}

export interface PersonaCapability {
  id: string;
  name: string;
  description: string;
  category: IntegrationType;
  enabled: boolean;
  requiredIntegrations?: string[];
  configuration?: Record<string, any>;
}

export const DEFAULT_CAPABILITIES: PersonaCapability[] = [
  {
    id: 'schedule_meeting',
    name: 'Schedule Meetings',
    description: 'Check calendar availability and book meetings',
    category: 'calendar',
    enabled: false,
    requiredIntegrations: ['calendar'],
  },
  {
    id: 'send_slack',
    name: 'Send Slack Messages',
    description: 'Send notifications to Slack channels',
    category: 'communication',
    enabled: false,
    requiredIntegrations: ['communication.slack'],
  },
  {
    id: 'send_email',
    name: 'Send Emails',
    description: 'Send email notifications and follow-ups',
    category: 'communication',
    enabled: false,
    requiredIntegrations: ['communication.email'],
  },
  {
    id: 'create_lead',
    name: 'Create CRM Lead',
    description: 'Create new leads in the CRM system',
    category: 'crm',
    enabled: false,
    requiredIntegrations: ['crm'],
  },
  {
    id: 'create_ticket',
    name: 'Create Support Ticket',
    description: 'Create support tickets for customer issues',
    category: 'support',
    enabled: false,
    requiredIntegrations: ['support'],
  },
  {
    id: 'check_availability',
    name: 'Check Calendar Availability',
    description: 'Check available time slots for meetings',
    category: 'calendar',
    enabled: false,
    requiredIntegrations: ['calendar'],
  },
  {
    id: 'notify_team',
    name: 'Notify Team',
    description: 'Send urgent notifications to the team',
    category: 'communication',
    enabled: false,
    requiredIntegrations: ['communication.slack', 'communication.email'],
  },
];

export interface IntegrationAction {
  type: string;
  payload: Record<string, any>;
  personaId: number;
  conversationId?: string;
  userId?: string;
}

export interface IntegrationResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}