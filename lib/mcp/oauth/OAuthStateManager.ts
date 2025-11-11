import crypto from 'crypto';
import { and, eq, gt, lt } from 'drizzle-orm';

import { db } from '@/db';
import { mcpOauthSessionsTable } from '@/db/schema';
import { mcpOAuthSessionsActive, mcpOAuthSessionsExpired } from '@/lib/mcp/metrics';

export interface OAuthSession {
  id: number;
  state: string;
  server_uuid: string;
  profile_uuid: string;
  callback_url: string;
  provider: string;
  created_at: Date;
  expires_at: Date;
}

export class OAuthStateManager {
  private static instance: OAuthStateManager;
  
  // TTL for OAuth sessions (15 minutes)
  private readonly SESSION_TTL_MS = 15 * 60 * 1000;

  private constructor() {}

  static getInstance(): OAuthStateManager {
    if (!OAuthStateManager.instance) {
      OAuthStateManager.instance = new OAuthStateManager();
    }
    return OAuthStateManager.instance;
  }

  /**
   * Generate a secure random state parameter
   */
  generateState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Store OAuth flow metadata
   */
  async createOAuthSession(
    serverUuid: string,
    profileUuid: string,
    callbackUrl: string,
    provider: string
  ): Promise<string> {
    const state = this.generateState();
    const expiresAt = new Date(Date.now() + this.SESSION_TTL_MS);

    await db.insert(mcpOauthSessionsTable).values({
      state,
      server_uuid: serverUuid,
      profile_uuid: profileUuid,
      callback_url: callbackUrl,
      provider,
      expires_at: expiresAt,
    });

    // Track active OAuth session
    mcpOAuthSessionsActive.inc({ provider });

    return state;
  }

  /**
   * Retrieve OAuth session by state
   */
  async getOAuthSession(state: string): Promise<OAuthSession | null> {
    const results = await db
      .select()
      .from(mcpOauthSessionsTable)
      .where(eq(mcpOauthSessionsTable.state, state))
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    const session = results[0];

    // Check if session has expired
    if (session.expires_at < new Date()) {
      // Track expired session
      mcpOAuthSessionsExpired.inc({ provider: session.provider, reason: 'timeout' });
      mcpOAuthSessionsActive.dec({ provider: session.provider });

      // Delete expired session
      await this.deleteOAuthSession(state);
      return null;
    }

    return session as OAuthSession;
  }

  /**
   * Delete OAuth session
   */
  async deleteOAuthSession(state: string): Promise<void> {
    await db
      .delete(mcpOauthSessionsTable)
      .where(eq(mcpOauthSessionsTable.state, state));
  }

  /**
   * Clean up expired OAuth sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    // Get expired sessions before deleting to track metrics
    const expiredSessions = await db
      .select()
      .from(mcpOauthSessionsTable)
      .where(lt(mcpOauthSessionsTable.expires_at, new Date()));

    const result = await db
      .delete(mcpOauthSessionsTable)
      .where(lt(mcpOauthSessionsTable.expires_at, new Date()));

    // Track expired sessions by provider
    const deletedCount = result.rowCount || 0;
    if (deletedCount > 0) {
      expiredSessions.forEach((session) => {
        mcpOAuthSessionsExpired.inc({ provider: session.provider, reason: 'cleanup' });
        mcpOAuthSessionsActive.dec({ provider: session.provider });
      });
    }

    return deletedCount;
  }

  /**
   * Get all active OAuth sessions for a server
   */
  async getActiveSessionsForServer(serverUuid: string): Promise<OAuthSession[]> {
    const results = await db
      .select()
      .from(mcpOauthSessionsTable)
      .where(
        and(
          eq(mcpOauthSessionsTable.server_uuid, serverUuid),
          gt(mcpOauthSessionsTable.expires_at, new Date())
        )
      );

    return results as OAuthSession[];
  }
}

// Export singleton instance
export const oauthStateManager = OAuthStateManager.getInstance();