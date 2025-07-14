import { describe, it, expect, beforeEach } from 'vitest';
import { storeRegistryOAuthToken, getRegistryOAuthToken, clearRegistryOAuthSession } from '@/app/actions/registry-oauth-session';
import { cookies } from 'next/headers';

// Mock dependencies
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  })),
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(() => ({
    user: { id: 'test-user-123' },
  })),
}));

vi.mock('@/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn().mockReturnThis(),
    })),
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(() => Promise.resolve([{
        userId: 'test-user-123',
        sessionTokenHash: 'hashed-token',
        oauthToken: 'test-oauth-token',
        githubUsername: 'testuser',
        expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
      }])),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
    })),
  },
}));

describe('Registry OAuth Session Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Token Storage', () => {
    it('should store OAuth token securely without exposing it to client', async () => {
      const result = await storeRegistryOAuthToken('github-oauth-token', 'testuser');
      
      expect(result.success).toBe(true);
      // Should return a session token, not the OAuth token
      expect(result.sessionToken).toBeDefined();
      expect(result.sessionToken).not.toBe('github-oauth-token');
      
      // Verify cookie was set with secure options
      const mockCookies = cookies();
      expect(mockCookies.set).toHaveBeenCalledWith(
        'registry_session',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
        })
      );
    });

    it('should require authentication to store tokens', async () => {
      // Mock unauthenticated session
      const { getServerSession } = await import('@/lib/auth');
      vi.mocked(getServerSession).mockResolvedValueOnce(null);
      
      const result = await storeRegistryOAuthToken('github-oauth-token', 'testuser');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });
  });

  describe('Token Retrieval', () => {
    it('should retrieve token only with valid session cookie', async () => {
      const mockCookies = cookies();
      vi.mocked(mockCookies.get).mockReturnValue({
        name: 'registry_session',
        value: 'valid-session-token',
      });
      
      const result = await getRegistryOAuthToken();
      
      expect(result.success).toBe(true);
      expect(result.oauthToken).toBe('test-oauth-token');
      expect(result.githubUsername).toBe('testuser');
    });

    it('should fail without session cookie', async () => {
      const mockCookies = cookies();
      vi.mocked(mockCookies.get).mockReturnValue(undefined);
      
      const result = await getRegistryOAuthToken();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No session found');
    });

    it('should fail with expired session', async () => {
      const mockCookies = cookies();
      vi.mocked(mockCookies.get).mockReturnValue({
        name: 'registry_session',
        value: 'expired-session-token',
      });
      
      // Mock expired session
      const { db } = await import('@/db');
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(() => Promise.resolve([])), // No results = expired/invalid
      } as any);
      
      const result = await getRegistryOAuthToken();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Session expired or not found');
    });
  });

  describe('Session Cleanup', () => {
    it('should clear session and cookie on logout', async () => {
      const mockCookies = cookies();
      vi.mocked(mockCookies.get).mockReturnValue({
        name: 'registry_session',
        value: 'session-to-clear',
      });
      
      const result = await clearRegistryOAuthSession();
      
      expect(result.success).toBe(true);
      expect(mockCookies.delete).toHaveBeenCalledWith('registry_session');
      
      // Verify database deletion was called
      const { db } = await import('@/db');
      expect(db.delete).toHaveBeenCalled();
    });
  });
});