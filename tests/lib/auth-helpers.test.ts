import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { withAuth } from '@/lib/auth-helpers';
import { getAuthSession } from '@/lib/auth';
import { db } from '@/db';

// Mock dependencies
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(),
}));

vi.mock('@/db');

vi.mock('next/dist/client/components/redirect-error', () => ({
  isRedirectError: (error: any) => error?.message === 'NEXT_REDIRECT',
}));

const mockedGetAuthSession = vi.mocked(getAuthSession);
const mockedCookies = vi.mocked(cookies);
const mockedRedirect = vi.mocked(redirect);
const mockedDb = vi.mocked(db);

describe('Auth Helpers', () => {
  let mockCookieStore: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock cookie store
    mockCookieStore = {
      delete: vi.fn(),
    };
    mockedCookies.mockResolvedValue(mockCookieStore);

    // Setup default database mock
    mockedDb.query = {
      users: {
        findFirst: vi.fn(),
      },
    } as any;
  });

  describe('withAuth', () => {
    it('should execute function when session is valid and user exists', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      };

      const mockUser = {
        id: 'user-123',
      };

      mockedGetAuthSession.mockResolvedValue(mockSession as any);
      mockedDb.query.users.findFirst.mockResolvedValue(mockUser);

      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await withAuth(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledWith(mockSession);
      expect(mockedDb.query.users.findFirst).toHaveBeenCalled();
      expect(mockedRedirect).not.toHaveBeenCalled();
    });

    it('should clear session and redirect when session is null', async () => {
      mockedGetAuthSession.mockResolvedValue(null);

      const mockFn = vi.fn();

      await expect(withAuth(mockFn)).rejects.toThrow('NEXT_REDIRECT');

      expect(mockCookieStore.delete).toHaveBeenCalledWith('next-auth.session-token');
      expect(mockCookieStore.delete).toHaveBeenCalledWith('__Secure-next-auth.session-token');
      expect(mockedRedirect).toHaveBeenCalledWith('/login');
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should clear session and redirect when session has no user ID', async () => {
      mockedGetAuthSession.mockResolvedValue({
        user: { email: 'test@example.com' },
      } as any);

      const mockFn = vi.fn();

      await expect(withAuth(mockFn)).rejects.toThrow('NEXT_REDIRECT');

      expect(mockCookieStore.delete).toHaveBeenCalledWith('next-auth.session-token');
      expect(mockCookieStore.delete).toHaveBeenCalledWith('__Secure-next-auth.session-token');
      expect(mockedRedirect).toHaveBeenCalledWith('/login');
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should clear session and redirect when user does not exist in database', async () => {
      const mockSession = {
        user: {
          id: 'nonexistent-user',
          email: 'test@example.com',
        },
      };

      mockedGetAuthSession.mockResolvedValue(mockSession as any);
      mockedDb.query.users.findFirst.mockResolvedValue(null);

      const mockFn = vi.fn();

      await expect(withAuth(mockFn)).rejects.toThrow('NEXT_REDIRECT');

      expect(mockCookieStore.delete).toHaveBeenCalledWith('next-auth.session-token');
      expect(mockCookieStore.delete).toHaveBeenCalledWith('__Secure-next-auth.session-token');
      expect(mockedRedirect).toHaveBeenCalledWith('/login');
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should throw database error when DB query fails with non-redirect error', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      };

      mockedGetAuthSession.mockResolvedValue(mockSession as any);
      mockedDb.query.users.findFirst.mockRejectedValue(new Error('Database connection failed'));

      const mockFn = vi.fn();

      await expect(withAuth(mockFn)).rejects.toThrow('Database error - please try again later');

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should propagate redirect error from clearSessionAndRedirect during DB check', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      };

      mockedGetAuthSession.mockResolvedValue(mockSession as any);

      // Simulate a redirect error being thrown during user lookup
      mockedDb.query.users.findFirst.mockImplementation(() => {
        const redirectError = new Error('NEXT_REDIRECT');
        throw redirectError;
      });

      const mockFn = vi.fn();

      await expect(withAuth(mockFn)).rejects.toThrow('NEXT_REDIRECT');

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should handle environment switch scenario (stale session)', async () => {
      // Simulates switching from local to Docker - session exists but user doesn't
      const mockSession = {
        user: {
          id: 'local-user-123',
          email: 'test@example.com',
        },
      };

      mockedGetAuthSession.mockResolvedValue(mockSession as any);
      mockedDb.query.users.findFirst.mockResolvedValue(null);

      const mockFn = vi.fn();

      await expect(withAuth(mockFn)).rejects.toThrow('NEXT_REDIRECT');

      // Verify cookies were cleared
      expect(mockCookieStore.delete).toHaveBeenCalledTimes(2);
      expect(mockedRedirect).toHaveBeenCalledWith('/login');
    });

    it('should properly type session as authenticated when passed to function', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      };

      const mockUser = {
        id: 'user-123',
      };

      mockedGetAuthSession.mockResolvedValue(mockSession as any);
      mockedDb.query.users.findFirst.mockResolvedValue(mockUser);

      // Test that the session passed to the function has the correct type
      const mockFn = vi.fn((session) => {
        // TypeScript should infer session.user.id as string
        expect(typeof session.user.id).toBe('string');
        expect(session.user.id).toBe('user-123');
        return 'typed-success';
      });

      const result = await withAuth(mockFn);

      expect(result).toBe('typed-success');
      expect(mockFn).toHaveBeenCalled();
    });
  });
});
