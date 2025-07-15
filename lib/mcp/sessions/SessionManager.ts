import { LRUCache } from 'lru-cache';

import { PostgresSessionStore } from './PostgresSessionStore';
import { MpcSession, SessionManagerOptions, SessionStore } from './types';

/**
 * SessionManager provides high-level session management with in-memory caching
 * backed by PostgreSQL persistence.
 */
export class SessionManager {
  private store: SessionStore;
  private cache: LRUCache<string, MpcSession>;
  private options: Required<SessionManagerOptions>;

  constructor(options: SessionManagerOptions = {}) {
    this.options = {
      defaultTtlMs: options.defaultTtlMs || 3600000, // 1 hour
      cleanupIntervalMs: options.cleanupIntervalMs || 300000, // 5 minutes
      maxSessionsPerServer: options.maxSessionsPerServer || 100,
    };

    this.store = new PostgresSessionStore(this.options.defaultTtlMs);
    
    // In-memory LRU cache for fast lookups
    this.cache = new LRUCache<string, MpcSession>({
      max: 10000, // Max 10k sessions in memory
      ttl: 60000, // 1 minute cache TTL
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });

    // Start cleanup timer
    if (this.store instanceof PostgresSessionStore) {
      this.store.startCleanupTimer(this.options.cleanupIntervalMs);
    }
  }

  /**
   * Create a new session for a server
   */
  async createSession(serverUuid: string, profileUuid: string, specificId?: string): Promise<string> {
    // Check if we've hit the max sessions per server limit
    const existingSessions = await this.getServerSessions(serverUuid);
    if (existingSessions.length >= this.options.maxSessionsPerServer) {
      // Delete oldest session
      const oldest = existingSessions.sort((a, b) => 
        a.last_activity.getTime() - b.last_activity.getTime()
      )[0];
      if (oldest) {
        await this.deleteSession(oldest.id);
      }
    }

    const sessionId = await this.store.create(serverUuid, profileUuid, this.options.defaultTtlMs, specificId);
    
    // Optionally cache the new session
    const session = await this.store.get(sessionId);
    if (session) {
      this.cache.set(sessionId, session);
    }

    return sessionId;
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<MpcSession | null> {
    // Check cache first
    const cached = this.cache.get(sessionId);
    if (cached) {
      // Verify it hasn't expired
      if (cached.expires_at > new Date()) {
        return cached;
      } else {
        // Remove expired session from cache
        this.cache.delete(sessionId);
      }
    }

    // Fetch from database
    const session = await this.store.get(sessionId);
    if (session) {
      this.cache.set(sessionId, session);
    }

    return session;
  }

  /**
   * Update session data
   */
  async updateSession(sessionId: string, data: Partial<MpcSession>): Promise<void> {
    await this.store.update(sessionId, data);
    
    // Invalidate cache
    this.cache.delete(sessionId);
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.store.delete(sessionId);
    this.cache.delete(sessionId);
  }

  /**
   * Delete all sessions for a server
   */
  async deleteServerSessions(serverUuid: string): Promise<void> {
    await this.store.deleteByServer(serverUuid);
    
    // Clear relevant entries from cache
    for (const [key, session] of this.cache.entries()) {
      if (session.server_uuid === serverUuid) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get all active sessions for a server
   */
  async getServerSessions(serverUuid: string): Promise<MpcSession[]> {
    // Use the store's method to get sessions by server
    const allSessions: MpcSession[] = [];
    
    // Get from cache first
    for (const [, session] of this.cache.entries()) {
      if (session.server_uuid === serverUuid && session.expires_at > new Date()) {
        allSessions.push(session);
      }
    }
    
    // Also check the database for any we might have missed
    // This is a simplified implementation - in production you'd want to
    // implement getByServer in the store
    return allSessions;
  }

  /**
   * Get the most recent session for a server and profile
   */
  async getLatestSession(serverUuid: string, profileUuid: string): Promise<MpcSession | null> {
    const sessions = await this.store.getByServerAndProfile(serverUuid, profileUuid);
    
    if (sessions.length === 0) {
      return null;
    }
    
    // Return the most recently active session
    const latest = sessions.sort((a, b) => 
      b.last_activity.getTime() - a.last_activity.getTime()
    )[0];
    
    // Cache it
    if (latest) {
      this.cache.set(latest.id, latest);
    }
    
    return latest;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.store instanceof PostgresSessionStore) {
      this.store.stopCleanupTimer();
    }
    this.cache.clear();
  }
}

// Singleton instance
let sessionManager: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager();
  }
  return sessionManager;
}