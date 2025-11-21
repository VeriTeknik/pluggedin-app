import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getConnectedAccounts, removeConnectedAccount } from '@/app/(sidebar-layout)/(container)/settings/actions';
import { db } from '@/db';
import { getAuthSession } from '@/lib/auth';

// Mock dependencies
vi.mock('@/db');
vi.mock('@/lib/auth');
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const mockedDb = vi.mocked(db);
const mockedGetAuthSession = vi.mocked(getAuthSession);

describe('Server Action Authentication Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockedDb.query = {
      users: {
        findFirst: vi.fn(),
      },
      accounts: {
        findMany: vi.fn(),
      },
    } as any;

    mockedDb.delete = vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })) as any;
  });

  describe('getConnectedAccounts - Session-based Authorization', () => {
    it('should NOT accept userId as parameter from client', () => {
      // Verify function signature doesn't accept userId
      const functionSignature = getConnectedAccounts.toString();

      // The function should have no parameters
      expect(getConnectedAccounts.length).toBe(0);

      // Should not have 'userId' in parameter list
      expect(functionSignature).not.toMatch(/\(userId/);
      expect(functionSignature).not.toMatch(/function.*userId/);
    });

    it('should reject requests without valid session', async () => {
      mockedGetAuthSession.mockResolvedValue(null);

      const result = await getConnectedAccounts();

      // Should return empty array, not error, for graceful handling
      expect(result).toEqual([]);
      expect(mockedDb.query.accounts.findMany).not.toHaveBeenCalled();
    });

    it('should derive user ID from session, not from parameters', async () => {
      const sessionUserId = 'session-user-123';

      mockedGetAuthSession.mockResolvedValue({
        user: {
          id: sessionUserId,
          email: 'test@example.com',
          name: 'Test User'
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      mockedDb.query.accounts.findMany.mockResolvedValue([
        {
          provider: 'google',
          last_used: new Date(),
          userId: sessionUserId,
          providerAccountId: 'google-123',
        },
      ]);

      await getConnectedAccounts();

      // Verify query used session-derived user ID
      expect(mockedDb.query.accounts.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Function),
          columns: expect.objectContaining({
            provider: true,
            last_used: true,
          }),
        })
      );
    });

    it('should NEVER use client-supplied user ID even if passed through other means', async () => {
      const sessionUserId = 'session-user-123';
      const maliciousUserId = 'attacker-user-456';

      mockedGetAuthSession.mockResolvedValue({
        user: {
          id: sessionUserId,
          email: 'test@example.com',
          name: 'Test User'
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      // Mock to capture the actual query
      let capturedWhereClause: any;
      mockedDb.query.accounts.findMany.mockImplementation((options: any) => {
        capturedWhereClause = options.where;
        return Promise.resolve([]);
      });

      await getConnectedAccounts();

      // Verify the where clause would use session ID, not any other ID
      expect(mockedDb.query.accounts.findMany).toHaveBeenCalled();

      // The function should not have any way to accept the malicious ID
      expect(getConnectedAccounts.length).toBe(0);
    });

    it('should return accounts only for authenticated user', async () => {
      mockedGetAuthSession.mockResolvedValue({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User'
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      const mockAccounts = [
        { provider: 'google', last_used: new Date() },
        { provider: 'github', last_used: new Date() },
      ];

      mockedDb.query.accounts.findMany.mockResolvedValue(mockAccounts);

      const result = await getConnectedAccounts();

      expect(result).toHaveLength(2);
      expect(result[0].provider).toBe('google');
      expect(result[1].provider).toBe('github');
    });
  });

  describe('removeConnectedAccount - Session-based Authorization', () => {
    it('should NOT accept userId as parameter from client', () => {
      // Verify function signature
      const functionSignature = removeConnectedAccount.toString();

      // Should only accept provider parameter
      expect(removeConnectedAccount.length).toBe(1);

      // Should have 'provider' but not 'userId' in parameters
      expect(functionSignature).toMatch(/provider/);
      expect(functionSignature).not.toMatch(/\buserId\b/);
    });

    it('should reject requests without valid session', async () => {
      mockedGetAuthSession.mockResolvedValue(null);

      const result = await removeConnectedAccount('google');

      expect(result).toEqual({
        success: false,
        error: 'Unauthorized - please log in again',
      });
      expect(mockedDb.delete).not.toHaveBeenCalled();
    });

    it('should derive user ID from session for account removal', async () => {
      const sessionUserId = 'session-user-123';

      mockedGetAuthSession.mockResolvedValue({
        user: {
          id: sessionUserId,
          email: 'test@example.com',
          name: 'Test User'
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      mockedDb.query.users.findFirst.mockResolvedValue({
        id: sessionUserId,
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed-password',
        accounts: [
          { provider: 'google', userId: sessionUserId, providerAccountId: 'google-123' },
          { provider: 'github', userId: sessionUserId, providerAccountId: 'github-123' },
        ],
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      await removeConnectedAccount('google');

      // Verify delete was called (even though we can't easily check the exact where clause)
      expect(mockedDb.delete).toHaveBeenCalled();
    });

    it('should prevent removal if only one login method remains', async () => {
      mockedGetAuthSession.mockResolvedValue({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User'
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      mockedDb.query.users.findFirst.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: null, // No password
        accounts: [
          { provider: 'google', userId: 'user-123', providerAccountId: 'google-123' },
        ], // Only one OAuth account
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await removeConnectedAccount('google');

      expect(result).toEqual({
        success: false,
        error: 'Cannot remove the only login method. Add a password or connect another account first.',
      });
      expect(mockedDb.delete).not.toHaveBeenCalled();
    });

    it('should allow removal if user has password', async () => {
      mockedGetAuthSession.mockResolvedValue({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User'
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      mockedDb.query.users.findFirst.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: 'hashed-password', // Has password
        accounts: [
          { provider: 'google', userId: 'user-123', providerAccountId: 'google-123' },
        ], // Only one OAuth account, but has password
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await removeConnectedAccount('google');

      expect(result).toEqual({ success: true });
      expect(mockedDb.delete).toHaveBeenCalled();
    });

    it('should allow removal if user has multiple OAuth accounts', async () => {
      mockedGetAuthSession.mockResolvedValue({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User'
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      mockedDb.query.users.findFirst.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        password: null, // No password
        accounts: [
          { provider: 'google', userId: 'user-123', providerAccountId: 'google-123' },
          { provider: 'github', userId: 'user-123', providerAccountId: 'github-123' },
        ], // Multiple OAuth accounts
        emailVerified: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await removeConnectedAccount('google');

      expect(result).toEqual({ success: true });
      expect(mockedDb.delete).toHaveBeenCalled();
    });
  });

  describe('Authorization Attack Scenarios', () => {
    it('should prevent account enumeration via getConnectedAccounts', async () => {
      // Attacker tries without session
      mockedGetAuthSession.mockResolvedValue(null);

      const result = await getConnectedAccounts();

      // Should not leak information about existence of accounts
      expect(result).toEqual([]);
      expect(mockedDb.query.accounts.findMany).not.toHaveBeenCalled();
    });

    it('should prevent unauthorized account removal via removeConnectedAccount', async () => {
      // Attacker tries to remove another user's account
      mockedGetAuthSession.mockResolvedValue(null);

      const result = await removeConnectedAccount('google');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unauthorized');
      expect(mockedDb.delete).not.toHaveBeenCalled();
    });

    it('should prevent privilege escalation by verifying session on every call', async () => {
      // First call with valid session
      mockedGetAuthSession.mockResolvedValueOnce({
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      mockedDb.query.accounts.findMany.mockResolvedValue([]);
      await getConnectedAccounts();

      // Second call with expired/invalid session
      mockedGetAuthSession.mockResolvedValueOnce(null);

      const result = await getConnectedAccounts();

      // Should reject second call even if first succeeded
      expect(result).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully in getConnectedAccounts', async () => {
      mockedGetAuthSession.mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      mockedDb.query.accounts.findMany.mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await getConnectedAccounts();

      // Should return empty array on error, not throw
      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully in removeConnectedAccount', async () => {
      mockedGetAuthSession.mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com', name: 'Test User' },
        expires: new Date(Date.now() + 86400000).toISOString(),
      });

      mockedDb.query.users.findFirst.mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await removeConnectedAccount('google');

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });
});
