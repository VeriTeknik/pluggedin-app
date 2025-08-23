import { NextRequest, NextResponse } from 'next/server';

import { getAuthSession } from '@/lib/auth';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.freebusy'
].join(' ');

export async function GET(req: NextRequest) {
  try {
    // Check if user is authenticated
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the redirect URL from query params
    const searchParams = req.nextUrl.searchParams;
    const redirectUrl = searchParams.get('redirect') || '/embedded-chat';
    const personaId = searchParams.get('personaId');
    const chatUuid = searchParams.get('chatUuid');
    const popup = searchParams.get('popup') === '1' ? '1' : '0';

    // Create state parameter to pass through OAuth flow
    const state = Buffer.from(JSON.stringify({
      userId: session.user.id,
      redirectUrl,
      personaId,
      chatUuid,
      timestamp: Date.now(),
      popup,
    })).toString('base64');

    // Build OAuth authorization URL
    // Remove trailing slash from NEXTAUTH_URL to avoid double slash
    const baseUrl = process.env.NEXTAUTH_URL!.replace(/\/$/, '');
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: `${baseUrl}/api/auth/google-calendar/callback`,
      response_type: 'code',
      scope: `openid email profile ${CALENDAR_SCOPES}`, // Include base scopes too
      access_type: 'offline',
      prompt: 'consent', // Force consent screen
      include_granted_scopes: 'true', // Important: this requests incremental auth
      state,
      // If user has existing Google account, hint at their email
      ...(session.user.email ? { login_hint: session.user.email } : {})
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

    // Redirect to Google OAuth consent page
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('Google Calendar authorization error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate Google Calendar authorization' },
      { status: 500 }
    );
  }
}