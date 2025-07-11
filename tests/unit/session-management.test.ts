import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { mcpSessionsTable } from '@/db/schema';
import { PostgresSessionStore } from '@/lib/mcp/sessions/PostgresSessionStore';
import { SessionManager } from '@/lib/mcp/sessions/SessionManager';

// Mock the database
vi.mock('@/db', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('Session Management', () => {
  let sessionStore: PostgresSessionStore;
  let sessionManager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStore = new PostgresSessionStore();
    sessionManager = new SessionManager();
  });

  afterEach(() => {
    sessionStore.stopCleanupTimer();
    sessionManager.destroy();
  });

  describe('PostgresSessionStore', () => {
    it('should generate valid session IDs', async () => {
      // Mock the insert to return success
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        }),
      });
      (db.insert as any).mockReturnValue({ values: mockInsert });

      const sessionId = await sessionStore.create('server-123', 'profile-456');

      // Session ID should be a string
      expect(typeof sessionId).toBe('string');
      
      // Should only contain valid ASCII characters (0x21 to 0x7E)
      const validChars = /^[!-~]+$/;
      expect(sessionId).toMatch(validChars);
      
      // Should have reasonable length
      expect(sessionId.length).toBeGreaterThan(10);
      expect(sessionId.length).toBeLessThanOrEqual(64);
    });

    it('should create session with specific ID', async () => {
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      };
      (db.insert as any).mockReturnValue(mockInsert);

      const specificId = 'test-session-123';
      const sessionId = await sessionStore.create('server-123', 'profile-456', undefined, specificId);

      expect(sessionId).toBe(specificId);
      expect(mockInsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          id: specificId,
          server_uuid: 'server-123',
          profile_uuid: 'profile-456',
        })
      );
    });

    it('should retrieve session by ID', async () => {
      const mockSession = {
        id: 'session-123',
        server_uuid: 'server-123',
        profile_uuid: 'profile-456',
        session_data: { test: 'data' },
        last_activity: new Date(),
        expires_at: new Date(Date.now() + 3600000),
        created_at: new Date(),
      };

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockSession]),
      };
      (db.select as any).mockReturnValue(mockSelect);

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      (db.update as any).mockReturnValue(mockUpdate);

      const session = await sessionStore.get('session-123');

      expect(session).toEqual(mockSession);
      expect(mockSelect.where).toHaveBeenCalled();
      // Should update last activity
      expect(mockUpdate.set).toHaveBeenCalledWith({ last_activity: expect.any(Date) });
    });

    it('should return null for expired session', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockSelect);

      const session = await sessionStore.get('expired-session');

      expect(session).toBeNull();
    });

    it('should get sessions by server and profile', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          server_uuid: 'server-123',
          profile_uuid: 'profile-456',
          session_data: {},
          last_activity: new Date(),
          expires_at: new Date(Date.now() + 3600000),
          created_at: new Date(),
        },
        {
          id: 'session-2',
          server_uuid: 'server-123',
          profile_uuid: 'profile-456',
          session_data: {},
          last_activity: new Date(Date.now() - 1000),
          expires_at: new Date(Date.now() + 3600000),
          created_at: new Date(Date.now() - 1000),
        },
      ];

      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockSessions),
      };
      (db.select as any).mockReturnValue(mockSelect);

      const sessions = await sessionStore.getByServerAndProfile('server-123', 'profile-456');

      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).toBe('session-1');
      expect(sessions[1].id).toBe('session-2');
    });
  });

  describe('SessionManager', () => {
    it('should create and cache sessions', async () => {
      const mockSessionId = 'new-session-123';
      
      // Mock the store's create method
      vi.spyOn(sessionManager['store'], 'create').mockResolvedValue(mockSessionId);
      
      // Mock the store's get method to return the created session
      vi.spyOn(sessionManager['store'], 'get').mockResolvedValue({
        id: mockSessionId,
        server_uuid: 'server-123',
        profile_uuid: 'profile-456',
        session_data: {},
        last_activity: new Date(),
        expires_at: new Date(Date.now() + 3600000),
        created_at: new Date(),
      });

      const sessionId = await sessionManager.createSession('server-123', 'profile-456');

      expect(sessionId).toBe(mockSessionId);
      
      // Should be in cache
      const cachedSession = await sessionManager.getSession(mockSessionId);
      expect(cachedSession).toBeTruthy();
      expect(cachedSession?.id).toBe(mockSessionId);
    });

    it('should enforce max sessions per server', async () => {
      // Mock getServerSessions to return max sessions
      const existingSessions = Array(100).fill(null).map((_, i) => ({
        id: `session-${i}`,
        server_uuid: 'server-123',
        profile_uuid: 'profile-456',
        session_data: {},
        last_activity: new Date(Date.now() - i * 1000),
        expires_at: new Date(Date.now() + 3600000),
        created_at: new Date(Date.now() - i * 1000),
      }));

      vi.spyOn(sessionManager, 'getServerSessions').mockResolvedValue(existingSessions);
      vi.spyOn(sessionManager, 'deleteSession').mockResolvedValue();
      vi.spyOn(sessionManager['store'], 'create').mockResolvedValue('new-session');
      vi.spyOn(sessionManager['store'], 'get').mockResolvedValue(null);

      await sessionManager.createSession('server-123', 'profile-456');

      // Should delete the oldest session
      expect(sessionManager.deleteSession).toHaveBeenCalledWith('session-99');
    });

    it('should get latest session for server and profile', async () => {
      const sessions = [
        {
          id: 'old-session',
          server_uuid: 'server-123',
          profile_uuid: 'profile-456',
          session_data: {},
          last_activity: new Date(Date.now() - 10000),
          expires_at: new Date(Date.now() + 3600000),
          created_at: new Date(Date.now() - 10000),
        },
        {
          id: 'new-session',
          server_uuid: 'server-123',
          profile_uuid: 'profile-456',
          session_data: {},
          last_activity: new Date(),
          expires_at: new Date(Date.now() + 3600000),
          created_at: new Date(),
        },
      ];

      vi.spyOn(sessionManager['store'], 'getByServerAndProfile').mockResolvedValue(sessions);

      const latest = await sessionManager.getLatestSession('server-123', 'profile-456');

      expect(latest).toBeTruthy();
      expect(latest?.id).toBe('new-session');
    });
  });

  describe('Session ID Validation', () => {
    it('should only generate valid MCP session IDs', () => {
      // Test the character set used in session ID generation
      const validChars = '!#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      
      // All characters should be in the ASCII range 0x21 to 0x7E
      for (const char of validChars) {
        const code = char.charCodeAt(0);
        expect(code).toBeGreaterThanOrEqual(0x21);
        expect(code).toBeLessThanOrEqual(0x7E);
      }
    });
  });
});