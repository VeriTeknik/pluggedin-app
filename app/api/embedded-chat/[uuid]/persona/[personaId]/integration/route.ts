import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { accounts, chatPersonasTable, embeddedChatsTable, projectsTable } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';
import { GoogleCalendarService } from '@/lib/integrations/calendar/google-calendar';
import { SlackService } from '@/lib/integrations/communication/slack';
import { EmailService } from '@/lib/integrations/communication/email';
import { CalendarIntegration,IntegrationAction, PersonaIntegrations } from '@/lib/integrations/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string; personaId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid: chatUuid, personaId } = await params;
    
    // Verify ownership through project
    const chatWithProject = await db
      .select({
        chat: embeddedChatsTable,
        project: projectsTable,
      })
      .from(embeddedChatsTable)
      .innerJoin(projectsTable, eq(embeddedChatsTable.project_uuid, projectsTable.uuid))
      .where(and(
        eq(embeddedChatsTable.uuid, chatUuid),
        eq(projectsTable.user_id, session.user.id)
      ))
      .limit(1);

    if (chatWithProject.length === 0) {
      return NextResponse.json({ error: 'Chat not found or access denied' }, { status: 404 });
    }

    const chat = chatWithProject[0].chat;

    // Get persona with integrations
    const persona = await db.query.chatPersonasTable.findFirst({
      where: and(
        eq(chatPersonasTable.id, parseInt(personaId)),
        eq(chatPersonasTable.embedded_chat_uuid, chatUuid)
      ),
    });

    if (!persona) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    const body = await req.json();
    console.log('[INTEGRATION] Request body:', JSON.stringify(body, null, 2));
    
    const { action, type } = body;

    // Check if this is a test request first
    if (type === 'test') {
      const { integration: integrationName } = body;
      const integrations = (persona.integrations as PersonaIntegrations) || {};
      
      switch (integrationName) {
        case 'calendar': {
          if (!integrations.calendar?.enabled) {
            return NextResponse.json({ error: 'Calendar integration not configured' }, { status: 400 });
          }

          if (integrations.calendar.provider === 'google_calendar') {
            const googleAccount = await db.query.accounts.findFirst({
              where: and(
                eq(accounts.userId, session.user.id),
                eq(accounts.provider, 'google')
              ),
            });

            if (!googleAccount || !googleAccount.access_token) {
              return NextResponse.json({
                success: false,
                error: 'Google account not connected with calendar permissions',
              });
            }

            const calendarIntegration: CalendarIntegration = {
              ...integrations.calendar,
              config: {
                ...integrations.calendar.config,
                accessToken: googleAccount.access_token,
              }
            };

            const calendarService = new GoogleCalendarService(calendarIntegration);
            const result = await calendarService.test();
            return NextResponse.json(result);
          }
          break;
        }

        case 'slack': {
          if (!integrations.communication?.slack?.enabled) {
            return NextResponse.json({ error: 'Slack integration not configured' }, { status: 400 });
          }

          const slackService = new SlackService(integrations.communication.slack);
          const result = await slackService.test();
          return NextResponse.json(result);
        }

        case 'email': {
          if (!integrations.communication?.email?.enabled) {
            return NextResponse.json({ error: 'Email integration not configured' }, { status: 400 });
          }

          const emailService = new EmailService(integrations.communication.email);
          const result = await emailService.test();
          return NextResponse.json(result);
        }

        case 'crm': {
          // CRM test not yet implemented, return a placeholder response
          return NextResponse.json({ 
            success: false, 
            error: 'CRM integration test not yet implemented' 
          });
        }

        default:
          return NextResponse.json({ error: 'Unknown integration to test' }, { status: 400 });
      }
    }

    // For non-test requests, require action and type
    if (type !== 'test' && (!action || !type)) {
      console.log('[INTEGRATION] Missing action or type:', { action, type });
      return NextResponse.json({ error: 'Missing action or type', details: { action, type } }, { status: 400 });
    }

    const integrations = (persona.integrations as PersonaIntegrations) || {};
    const capabilities = (persona.capabilities as any[]) || [];
    
    // Check if the requested action is enabled in persona capabilities
    const actionCapability = capabilities.find((cap: any) => cap.id === action.type && cap.enabled);
    if (!actionCapability) {
      console.log('[INTEGRATION] Action not enabled in persona capabilities:', action.type);
      return NextResponse.json({
        error: `Action '${action.type}' is not enabled for this persona`,
        details: {
          requestedAction: action.type,
          availableCapabilities: capabilities.filter((cap: any) => cap.enabled).map((cap: any) => cap.id)
        }
      }, { status: 400 });
    }
    
    // Check if required integrations are available for this capability
    if (actionCapability.requiredIntegrations && actionCapability.requiredIntegrations.length > 0) {
      const missingIntegrations = actionCapability.requiredIntegrations.filter((req: string) => {
        const parts = req.split('.');
        if (parts.length === 1) {
          return !(integrations as any)[parts[0]]?.enabled;
        } else {
          return !(integrations as any)[parts[0]]?.[parts[1]]?.enabled;
        }
      });
      
      if (missingIntegrations.length > 0) {
        console.log('[INTEGRATION] Missing required integrations for capability:', missingIntegrations);
        return NextResponse.json({
          error: `Required integrations not available for '${action.type}'`,
          details: {
            missingIntegrations,
            requiredIntegrations: actionCapability.requiredIntegrations
          }
        }, { status: 400 });
      }
    }
    
    // Handle different integration types
    switch (type) {
      case 'calendar': {
        console.log('[INTEGRATION] Processing calendar action:', action.type);
        console.log('[INTEGRATION] Calendar integration status:', integrations.calendar?.enabled);
        
        if (!integrations.calendar?.enabled) {
          console.log('[INTEGRATION] Calendar integration not enabled');
          return NextResponse.json({ error: 'Calendar integration not enabled' }, { status: 400 });
        }

        // Get user's Google OAuth tokens if using Google Calendar
        if (integrations.calendar.provider === 'google_calendar') {
          console.log('[INTEGRATION] Checking Google account for calendar access');
          const googleAccount = await db.query.accounts.findFirst({
            where: and(
              eq(accounts.userId, session.user.id),
              eq(accounts.provider, 'google')
            ),
          });

          console.log('[INTEGRATION] Google account found:', !!googleAccount);
          console.log('[INTEGRATION] Google account has access token:', !!googleAccount?.access_token);
          console.log('[INTEGRATION] Google account scopes:', googleAccount?.scope);

          if (!googleAccount || !googleAccount.access_token) {
            console.log('[INTEGRATION] Google Calendar not connected');
            return NextResponse.json(
              { error: 'Google Calendar not connected. Please reconnect your Google account with calendar permissions.' },
              { status: 400 }
            );
          }

          // Check for required least-privilege scopes
          const requiredScopes = ['calendar.app.created', 'calendarlist.readonly', 'calendar.freebusy'];
          const missingScopes = requiredScopes.filter(scope =>
            !googleAccount.scope?.includes(scope)
          );

          if (missingScopes.length > 0) {
            console.log('[INTEGRATION] Missing required scopes:', missingScopes);
            return NextResponse.json(
              {
                error: 'Insufficient Google Calendar permissions. Please reconnect with the required scopes.',
                details: {
                  missingScopes,
                  requiredScopes,
                  message: 'The dedicated calendar approach requires these specific scopes for security and privacy.'
                }
              },
              { status: 400 }
            );
          }

          // Update integration config with current access token
          const calendarIntegration: CalendarIntegration = {
            ...integrations.calendar,
            config: {
              ...integrations.calendar.config,
              accessToken: googleAccount.access_token,
              refreshToken: googleAccount.refresh_token || undefined,
            }
          };

          const calendarService = new GoogleCalendarService(calendarIntegration);
          
          // Execute the action
          const integrationAction: IntegrationAction = {
            type: action.type,
            payload: action.payload,
            personaId: parseInt(personaId),
            userId: session.user.id,
          };

          console.log('[INTEGRATION] Executing calendar action:', integrationAction.type);
          console.log('[INTEGRATION] Action payload:', JSON.stringify(integrationAction.payload, null, 2));

          const result = await calendarService.execute(integrationAction);
          console.log('[INTEGRATION] Calendar action result:', result);
          
          return NextResponse.json(result);
        }
        break;
      }

      case 'slack': {
        if (!integrations.communication?.slack?.enabled) {
          return NextResponse.json({ error: 'Slack integration not enabled' }, { status: 400 });
        }

        const slackService = new SlackService(integrations.communication.slack);
        
        const integrationAction: IntegrationAction = {
          type: action.type,
          payload: action.payload,
          personaId: parseInt(personaId),
          userId: session.user.id,
        };

        const result = await slackService.execute(integrationAction);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: 'Unknown integration type' }, { status: 400 });
    }

    return NextResponse.json({ error: 'Action not implemented' }, { status: 501 });
  } catch (error) {
    console.error('Integration API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to check integration status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string; personaId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid: chatUuid, personaId } = await params;
    
    // Get persona
    const persona = await db.query.chatPersonasTable.findFirst({
      where: and(
        eq(chatPersonasTable.id, parseInt(personaId)),
        eq(chatPersonasTable.embedded_chat_uuid, chatUuid)
      ),
    });

    if (!persona) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    const integrations = (persona.integrations as PersonaIntegrations) || {};
    const status: any = {};

    // Check Google Calendar status
    if (integrations.calendar?.enabled && integrations.calendar.provider === 'google_calendar') {
      const googleAccount = await db.query.accounts.findFirst({
        where: and(
          eq(accounts.userId, session.user.id),
          eq(accounts.provider, 'google')
        ),
      });

      // Check for the new least-privilege scopes required for dedicated calendar approach
      const requiredScopes = ['calendar.app.created', 'calendarlist.readonly', 'calendar.freebusy'];
      const hasRequiredScopes = requiredScopes.every(scope =>
        googleAccount?.scope?.includes(scope)
      );
      
      status.googleCalendar = {
        connected: !!googleAccount?.access_token,
        hasRequiredScopes,
        missingScopes: hasRequiredScopes ? [] : requiredScopes.filter(scope =>
          !googleAccount?.scope?.includes(scope)
        ),
        // Legacy check for backward compatibility
        hasLegacyCalendarScope: googleAccount?.scope?.includes('calendar') || false,
      };
    }

    return NextResponse.json({ status, integrations });
  } catch (error) {
    console.error('Integration status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}