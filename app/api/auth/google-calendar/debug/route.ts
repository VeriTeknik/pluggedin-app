import { and,eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { accounts } from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the user's Google account
    const googleAccount = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.userId, session.user.id),
        eq(accounts.provider, 'google')
      ),
    });

    if (!googleAccount) {
      return NextResponse.json({ 
        message: 'No Google account linked',
        user: session.user.email 
      });
    }

    // Parse the scopes
    const scopes = googleAccount.scope ? googleAccount.scope.split(' ') : [];
    
    // Check for calendar scopes
    const calendarScopes = [
      'https://www.googleapis.com/auth/calendar.app.created',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly', 
      'https://www.googleapis.com/auth/calendar.freebusy'
    ];
    
    const hasCalendarScopes = calendarScopes.every(scope => 
      scopes.some(s => s.includes(scope.replace('https://www.googleapis.com/auth/', '')))
    );

    return NextResponse.json({
      currentScopes: scopes,
      hasToken: !!googleAccount.access_token,
      hasRefreshToken: !!googleAccount.refresh_token,
      expiresAt: googleAccount.expires_at,
      calendarScopes: {
        required: calendarScopes,
        hasAll: hasCalendarScopes,
        missing: calendarScopes.filter(scope => 
          !scopes.some(s => s.includes(scope.replace('https://www.googleapis.com/auth/', '')))
        )
      },
      rawScope: googleAccount.scope
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}