import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { randomUUID } from 'crypto';

/**
 * Session Manager for MCP Streamable HTTP
 * Handles session lifecycle, cleanup, and timeout management
 */
export class MCPSessionManager {
  private static instance: MCPSessionManager;
  private sessions: Map<string, MCPSession> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Start cleanup interval
    this.startCleanupInterval();
  }

  static getInstance(): MCPSessionManager {
    if (!MCPSessionManager.instance) {
      MCPSessionManager.instance = new MCPSessionManager();
    }
    return MCPSessionManager.instance;
  }

  /**
   * Create or get a session
   */
  async createOrGetSession(
    sessionId?: string,
    server?: Server,
    options: SessionOptions = {}
  ): Promise<MCPSession> {
    const id = sessionId || randomUUID();
    const { timeout = 30 * 60 * 1000 } = options; // 30 minutes default

    if (this.sessions.has(id)) {
      const session = this.sessions.get(id)!;
      session.lastAccessed = Date.now();
      session.timeout = timeout;
      return session;
    }

    const session: MCPSession = {
      id,
      server: server || this.createDefaultServer(),
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      timeout,
      metadata: options.metadata || {},
      status: 'active'
    };

    this.sessions.set(id, session);
    console.log(`MCP session created: ${id}`);

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): MCPSession | null {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccessed = Date.now();
    }
    return session || null;
  }

  /**
   * Update session metadata
   */
  updateSessionMetadata(sessionId: string, metadata: Record<string, any>): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.metadata = { ...session.metadata, ...metadata };
      session.lastAccessed = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Terminate a session
   */
  async terminateSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      // Perform cleanup
      await this.cleanupSession(session);
      this.sessions.delete(sessionId);
      console.log(`MCP session terminated: ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`Error terminating session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Terminate all sessions
   */
  async terminateAllSessions(): Promise<void> {
    const terminationPromises = Array.from(this.sessions.values()).map(
      session => this.cleanupSession(session)
    );
    
    await Promise.all(terminationPromises);
    this.sessions.clear();
    console.log('All MCP sessions terminated');
  }

  /**
   * Get session statistics
   */
  getSessionStats(): SessionStats {
    const now = Date.now();
    let active = 0;
    let expired = 0;
    const total = this.sessions.size;

    for (const session of this.sessions.values()) {
      if (now - session.lastAccessed <= session.timeout) {
        active++;
      } else {
        expired++;
      }
    }

    return {
      total,
      active,
      expired,
      oldestSession: this.getOldestSessionAge(),
      newestSession: this.getNewestSessionAge()
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): MCPSession[] {
    const now = Date.now();
    return Array.from(this.sessions.values()).filter(
      session => now - session.lastAccessed <= session.timeout
    );
  }

  /**
   * Get sessions by metadata filter
   */
  getSessionsByMetadata(filter: Record<string, any>): MCPSession[] {
    return Array.from(this.sessions.values()).filter(session => {
      return Object.entries(filter).every(([key, value]) => 
        session.metadata[key] === value
      );
    });
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastAccessed > session.timeout) {
        this.cleanupSession(session).catch(error => {
          console.error(`Error cleaning up expired session ${sessionId}:`, error);
        });
        this.sessions.delete(sessionId);
        cleanedCount++;
        console.log(`Cleaned up expired session: ${sessionId}`);
      }
    }

    return cleanedCount;
  }

  /**
   * Start automatic cleanup interval
   */
  private startCleanupInterval(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const cleanedCount = this.cleanupExpiredSessions();
      if (cleanedCount > 0) {
        console.log(`Automatic cleanup: removed ${cleanedCount} expired sessions`);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Stop automatic cleanup interval
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Cleanup a single session
   */
  private async cleanupSession(session: MCPSession): Promise<void> {
    try {
      session.status = 'terminated';
      
      // Close server connection if it exists
      if (session.server && typeof session.server.close === 'function') {
        await session.server.close();
      }
      
      // Perform any additional cleanup here
      // For example: close database connections, file handles, etc.
      
      console.log(`Session cleanup completed for: ${session.id}`);
    } catch (error) {
      console.error(`Error during session cleanup for ${session.id}:`, error);
      throw error;
    }
  }

  /**
   * Create a default server instance
   */
  private createDefaultServer(): Server {
    // This is a placeholder - in a real implementation,
    // you would create or get the appropriate MCP server
    return new Server(
      {
        name: 'pluggedin-mcp-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          logging: {}
        }
      }
    );
  }

  /**
   * Get the age of the oldest session
   */
  private getOldestSessionAge(): number | null {
    if (this.sessions.size === 0) return null;
    
    const oldest = Math.min(...Array.from(this.sessions.values()).map(
      session => session.createdAt
    ));
    
    return Date.now() - oldest;
  }

  /**
   * Get the age of the newest session
   */
  private getNewestSessionAge(): number | null {
    if (this.sessions.size === 0) return null;
    
    const newest = Math.max(...Array.from(this.sessions.values()).map(
      session => session.createdAt
    ));
    
    return Date.now() - newest;
  }

  /**
   * Validate session ID format
   */
  isValidSessionId(sessionId: string): boolean {
    // Basic UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(sessionId);
  }

  /**
   * Generate a new session ID
   */
  generateSessionId(): string {
    return randomUUID();
  }

  /**
   * Check if a session is expired
   */
  isSessionExpired(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return true;
    
    return Date.now() - session.lastAccessed > session.timeout;
  }

  /**
   * Extend session timeout
   */
  extendSessionTimeout(sessionId: string, additionalTime: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    session.timeout += additionalTime;
    session.lastAccessed = Date.now();
    return true;
  }
}

/**
 * Session interface
 */
export interface MCPSession {
  id: string;
  server: Server;
  createdAt: number;
  lastAccessed: number;
  timeout: number;
  metadata: Record<string, any>;
  status: 'active' | 'terminated' | 'expired';
}

/**
 * Session options interface
 */
export interface SessionOptions {
  timeout?: number;
  metadata?: Record<string, any>;
}

/**
 * Session statistics interface
 */
export interface SessionStats {
  total: number;
  active: number;
  expired: number;
  oldestSession: number | null;
  newestSession: number | null;
}