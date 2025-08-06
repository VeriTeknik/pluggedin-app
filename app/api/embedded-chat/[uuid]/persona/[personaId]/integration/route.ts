import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { db } from '@/db';
import { chatPersonasTable, embeddedChatsTable, accounts, projectsTable } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { GoogleCalendarService } from '@/lib/integrations/calendar/google-calendar';
import { SlackService } from '@/lib/integrations/communication/slack';
import { IntegrationManager } from '@/lib/integrations/base-service';
import { PersonaIntegrations, IntegrationAction, CalendarIntegration } from '@/lib/integrations/types';

export async function POST(
  req: NextRequest,
  { params }: { params: { uuid: string; personaId: string } }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid: chatUuid, personaId } = params;
    
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
    const { action, type } = body;

    if (!action || !type) {
      return NextResponse.json({ error: 'Missing action or type' }, { status: 400 });
    }

    const integrations = (persona.integrations as PersonaIntegrations) || {};
    const capabilities = (persona.capabilities as any[]) || [];
    
    // Handle different integration types
    switch (type) {
      case 'calendar': {
        if (!integrations.calendar?.enabled) {
          return NextResponse.json({ error: 'Calendar integration not enabled' }, { status: 400 });
        }

        // Get user's Google OAuth tokens if using Google Calendar
        if (integrations.calendar.provider === 'google_calendar') {
          const googleAccount = await db.query.accounts.findFirst({
            where: and(
              eq(accounts.userId, session.user.id),
              eq(accounts.provider, 'google')
            ),
          });

          if (!googleAccount || !googleAccount.access_token) {
            return NextResponse.json(
              { error: 'Google Calendar not connected. Please reconnect your Google account with calendar permissions.' },
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

          const result = await calendarService.execute(integrationAction);
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

      case 'test': {
        // Test connection endpoint
        const { integration: integrationName } = body;
        
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
        }
        break;
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
  { params }: { params: { uuid: string; personaId: string } }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { uuid: chatUuid, personaId } = params;
    
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

      status.googleCalendar = {
        connected: !!googleAccount?.access_token,
        hasCalendarScope: googleAccount?.scope?.includes('calendar') || false,
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