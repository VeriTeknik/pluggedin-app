import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { accounts } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors
    if (error) {
      console.error('Google Calendar OAuth error:', error);
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/embedded-chat?error=calendar_auth_failed`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/embedded-chat?error=invalid_request`
      );
    }

    // Decode and validate state
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/embedded-chat?error=invalid_state`
      );
    }

    const { userId, redirectUrl, personaId, chatUuid, popup } = stateData;

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/google-calendar/callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Token exchange failed:', errorData);
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}${redirectUrl}?error=token_exchange_failed`
      );
    }

    const tokens = await tokenResponse.json();
    
    console.log('[GOOGLE_CALENDAR_CALLBACK] Token response:', {
      has_access_token: !!tokens.access_token,
      has_refresh_token: !!tokens.refresh_token,
      scope: tokens.scope,
      expires_in: tokens.expires_in
    });

    // Get user info from the access token
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      console.error('Failed to get user info');
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}${redirectUrl}?error=user_info_failed`
      );
    }

    const userInfo = await userInfoResponse.json();

    // Check if user already has a Google account linked
    const existingAccount = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.userId, userId),
        eq(accounts.provider, 'google')
      ),
    });

    if (existingAccount) {
      // Merge existing scopes with new calendar scopes
      const existingScopes = existingAccount.scope || '';
      const newScopes = tokens.scope || '';
      
      // Combine and deduplicate scopes
      const allScopes = new Set([
        ...existingScopes.split(' ').filter(Boolean),
        ...newScopes.split(' ').filter(Boolean)
      ]);
      
      const mergedScopes = Array.from(allScopes).join(' ');
      
      console.log('[GOOGLE_CALENDAR_CALLBACK] Updating existing account:', {
        existingScopes,
        newScopes,
        mergedScopes
      });
      
      // Update existing account with calendar tokens and scopes
      await db.update(accounts)
        .set({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || existingAccount.refresh_token,
          expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
          scope: mergedScopes
        })
        .where(and(
          eq(accounts.userId, userId),
          eq(accounts.provider, 'google'),
          eq(accounts.providerAccountId, existingAccount.providerAccountId)
        ));
    } else {
      // Create new Google account with calendar access
      await db.insert(accounts).values({
        userId,
        type: 'oauth',
        provider: 'google',
        providerAccountId: userInfo.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        token_type: tokens.token_type,
        scope: tokens.scope || 'https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.freebusy',
        id_token: tokens.id_token,
      });
    }

    // If opened as a popup, post a message to the opener and close
    if (popup === '1') {
      const html = `<!DOCTYPE html><html><body><script>
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({
              source: 'pluggedin',
              type: 'google-calendar-oauth-complete',
              success: true
            }, window.location.origin);
          }
        } finally {
          window.close();
        }
      </script></body></html>`;
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
    }

    // Build redirect URL with success message (non-popup fallback)
    let finalRedirectUrl = redirectUrl;
    if (chatUuid && personaId) {
      finalRedirectUrl = `/embedded-chat/${chatUuid}?personaId=${personaId}&tab=integrations&calendar_connected=true`;
    } else {
      finalRedirectUrl = `${redirectUrl}?calendar_connected=true`;
    }

    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}${finalRedirectUrl}`);
  } catch (error) {
    console.error('Google Calendar callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/embedded-chat?error=callback_failed`
    );
  }
}