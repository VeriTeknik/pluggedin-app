import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { users } from '@/db/schema';
import { IntegrationManager } from '@/lib/integrations/base-service';

interface NotifyRequest {
  type: 'slack' | 'email';
  profileUuid: string;
  conversationId: string;
  message: string;
  subject?: string;
  details?: Record<string, any>;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as NotifyRequest;
    const { type, profileUuid, conversationId, message, subject, details } = body;

    if (!type || !profileUuid || !conversationId || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get user information from the database
    const user = await db.query.users.findFirst({
      where: eq(users.id, profileUuid),
      columns: { id: true, name: true, email: true }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Get user's integrations
    const integrationsResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/integrations`, {
      headers: {
        'Cookie': request.headers.get('cookie') || ''
      }
    });

    if (!integrationsResponse.ok) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch integrations' },
        { status: 500 }
      );
    }

    const integrationsData = await integrationsResponse.json();
    const integrationManager = new IntegrationManager(integrationsData.integrations || {});

    let result;

    if (type === 'slack') {
      // Send Slack notification
      const slackAction = {
        type: 'send_slack',
        payload: {
          text: message,
          senderInfo: {
            name: user.name || 'Plugged.in User',
            email: user.email,
          }
        },
        personaId: 1, // Default persona ID
        conversationId,
      };

      result = await integrationManager.executeAction(slackAction);
    } else if (type === 'email') {
      // Send Email notification
      const emailAction = {
        type: 'send_email',
        payload: {
          to: user.email,
          subject: subject || 'Task Notification from Plugged.in',
          message: message,
          personaName: 'Plugged.in Assistant',
        },
        personaId: 1, // Default persona ID
        conversationId,
      };

      result = await integrationManager.executeAction(emailAction);
    } else {
      return NextResponse.json(
        { success: false, error: 'Unsupported notification type' },
        { status: 400 }
      );
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `${type} notification sent successfully`,
        data: result.data
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error || `Failed to send ${type} notification` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error sending notification:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}