import crypto from 'crypto';
import { and, eq, gt, lt } from 'drizzle-orm';

import { db } from '@/db';
import { mcpSessionsTable } from '@/db/schema';

import { MpcSession, SessionStore } from './types';

export class PostgresSessionStore implements SessionStore {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs: number = 3600000) { // 1 hour default
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Generate a cryptographically secure session ID that complies with
   * MCP spec: visible ASCII characters (0x21 to 0x7E)
   */
  private generateSessionId(): string {
    const bytes = crypto.randomBytes(32);
    // Use base64url and then filter to ensure only valid ASCII chars
    return bytes
      .toString('base64url')
      .replace(/[^a-zA-Z0-9!#$%&'()*+,\-./:;<=>?@[\]^_`{|}~]/g, '')
      .slice(0, 64); // Limit length to 64 chars
  }

  async create(serverUuid: string, profileUuid: string, ttlMs?: number, specificId?: string): Promise<string> {
    const sessionId = specificId || this.generateSessionId();
    const expiresAt = new Date(Date.now() + (ttlMs || this.defaultTtlMs));

    await db.insert(mcpSessionsTable).values({
      id: sessionId,
      server_uuid: serverUuid,
      profile_uuid: profileUuid,
      session_data: {},
      expires_at: expiresAt,
      last_activity: new Date(),
      created_at: new Date(),
    })
    .onConflictDoUpdate({
      target: mcpSessionsTable.id,
      set: {
        last_activity: new Date(),
        expires_at: expiresAt,
      },
    });

    return sessionId;
  }

  async get(sessionId: string): Promise<MpcSession | null> {
    const sessions = await db
      .select()
      .from(mcpSessionsTable)
      .where(
        and(
          eq(mcpSessionsTable.id, sessionId),
          gt(mcpSessionsTable.expires_at, new Date())
        )
      )
      .limit(1);

    if (sessions.length === 0) {
      return null;
    }

    const session = sessions[0];

    // Update last activity
    await db
      .update(mcpSessionsTable)
      .set({ last_activity: new Date() })
      .where(eq(mcpSessionsTable.id, sessionId));

    return {
      id: session.id,
      server_uuid: session.server_uuid,
      profile_uuid: session.profile_uuid,
      session_data: session.session_data as Record<string, any>,
      last_activity: session.last_activity,
      expires_at: session.expires_at,
      created_at: session.created_at,
    };
  }

  async update(sessionId: string, data: Partial<MpcSession>): Promise<void> {
    const updateData: any = {};
    
    if (data.session_data !== undefined) {
      updateData.session_data = data.session_data;
    }
    if (data.expires_at !== undefined) {
      updateData.expires_at = data.expires_at;
    }
    
    updateData.last_activity = new Date();

    await db
      .update(mcpSessionsTable)
      .set(updateData)
      .where(eq(mcpSessionsTable.id, sessionId));
  }

  async delete(sessionId: string): Promise<void> {
    await db
      .delete(mcpSessionsTable)
      .where(eq(mcpSessionsTable.id, sessionId));
  }

  async deleteByServer(serverUuid: string): Promise<void> {
    await db
      .delete(mcpSessionsTable)
      .where(eq(mcpSessionsTable.server_uuid, serverUuid));
  }

  async cleanupExpired(): Promise<number> {
    await db
      .delete(mcpSessionsTable)
      .where(lt(mcpSessionsTable.expires_at, new Date()));

    // Drizzle doesn't return count directly, so we'll need to track it differently
    // For now, return 0 - in production you might want to use raw SQL for this
    return 0;
  }

  async getByServerAndProfile(serverUuid: string, profileUuid: string): Promise<MpcSession[]> {
    const sessions = await db
      .select()
      .from(mcpSessionsTable)
      .where(
        and(
          eq(mcpSessionsTable.server_uuid, serverUuid),
          eq(mcpSessionsTable.profile_uuid, profileUuid),
          gt(mcpSessionsTable.expires_at, new Date())
        )
      )
      .orderBy(mcpSessionsTable.last_activity);

    return sessions.map(session => ({
      id: session.id,
      server_uuid: session.server_uuid,
      profile_uuid: session.profile_uuid,
      session_data: session.session_data as Record<string, any>,
      last_activity: session.last_activity,
      expires_at: session.expires_at,
      created_at: session.created_at,
    }));
  }

  /**
   * Start automatic cleanup of expired sessions
   */
  startCleanupTimer(intervalMs: number = 300000): void { // 5 minutes default
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpired();
      } catch (error) {
        console.error('[PostgresSessionStore] Cleanup error:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}