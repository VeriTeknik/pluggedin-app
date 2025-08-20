import { and,eq } from 'drizzle-orm';

import { db } from '@/db';
import { accounts } from '@/db/schema';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: number | null;
  scope?: string | null;
}

/**
 * Refreshes a Google OAuth access token using the refresh token
 */
export async function refreshGoogleAccessToken(
  userId: string,
  providerAccountId?: string
): Promise<GoogleTokens | null> {
  try {
    // Find the Google account for this user
    const conditions = [
      eq(accounts.userId, userId),
      eq(accounts.provider, 'google')
    ];
    
    if (providerAccountId) {
      conditions.push(eq(accounts.providerAccountId, providerAccountId));
    }
    
    const googleAccount = await db.query.accounts.findFirst({
      where: and(...conditions),
    });

    if (!googleAccount) {
      console.error('[GoogleTokenRefresh] No Google account found for user:', userId);
      return null;
    }

    if (!googleAccount.refresh_token) {
      console.error('[GoogleTokenRefresh] No refresh token available for user:', userId);
      return null;
    }

    console.log('[GoogleTokenRefresh] Refreshing access token for user:', userId);

    // Exchange refresh token for new access token
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: googleAccount.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('[GoogleTokenRefresh] Token refresh failed:', errorData);
      
      // If refresh token is invalid, user needs to reconnect
      if (errorData.error === 'invalid_grant') {
        console.error('[GoogleTokenRefresh] Refresh token is invalid. User needs to reconnect.');
      }
      
      return null;
    }

    const tokens = await tokenResponse.json();
    
    console.log('[GoogleTokenRefresh] Token refreshed successfully:', {
      has_access_token: !!tokens.access_token,
      has_refresh_token: !!tokens.refresh_token,
      expires_in: tokens.expires_in
    });

    // Update the database with new tokens
    const newExpiresAt = tokens.expires_in 
      ? Math.floor(Date.now() / 1000) + tokens.expires_in 
      : null;

    await db.update(accounts)
      .set({
        access_token: tokens.access_token,
        // Only update refresh_token if a new one was provided
        refresh_token: tokens.refresh_token || googleAccount.refresh_token,
        expires_at: newExpiresAt,
      })
      .where(and(
        eq(accounts.userId, userId),
        eq(accounts.provider, 'google'),
        eq(accounts.providerAccountId, googleAccount.providerAccountId)
      ));

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || googleAccount.refresh_token,
      expires_at: newExpiresAt,
      scope: googleAccount.scope
    };
  } catch (error) {
    console.error('[GoogleTokenRefresh] Error refreshing token:', error);
    return null;
  }
}

/**
 * Gets a valid Google access token, refreshing if necessary
 */
export async function getValidGoogleAccessToken(
  userId: string,
  providerAccountId?: string
): Promise<string | null> {
  try {
    // Find the Google account for this user
    const conditions = [
      eq(accounts.userId, userId),
      eq(accounts.provider, 'google')
    ];
    
    if (providerAccountId) {
      conditions.push(eq(accounts.providerAccountId, providerAccountId));
    }
    
    const googleAccount = await db.query.accounts.findFirst({
      where: and(...conditions),
    });

    if (!googleAccount || !googleAccount.access_token) {
      console.error('[GoogleTokenRefresh] No Google account or access token found');
      return null;
    }

    // Check if token is expired or about to expire (5 minutes buffer)
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = googleAccount.expires_at;
    
    if (expiresAt && expiresAt <= now + 300) { // 5 minute buffer
      console.log('[GoogleTokenRefresh] Token expired or expiring soon, refreshing...');
      const refreshedTokens = await refreshGoogleAccessToken(userId, providerAccountId);
      
      if (refreshedTokens) {
        return refreshedTokens.access_token;
      } else {
        console.error('[GoogleTokenRefresh] Failed to refresh token');
        return null;
      }
    }

    return googleAccount.access_token;
  } catch (error) {
    console.error('[GoogleTokenRefresh] Error getting valid token:', error);
    return null;
  }
}