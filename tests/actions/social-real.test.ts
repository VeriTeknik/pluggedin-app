import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkUsernameAvailability, reserveUsername, updateUserSocial, getUserFollowerCount } from '@/app/actions/social';
import { db } from '@/db';
import { users } from '@/db/schema';

// Mock dependencies
vi.mock('@/db');
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(() => Promise.resolve({
    user: { id: 'test-user-id', username: 'testuser' }
  })),
}));
vi.mock('@/app/actions/audit-logger', () => ({
  logAuditEvent: vi.fn(),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ delete: vi.fn() })),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    const error: any = new Error('NEXT_REDIRECT');
    error.digest = 'NEXT_REDIRECT;replace;/login;307;';
    throw error;
  }),
}));

const SESSION_USER_ID = 'test-user-id';

/**
 * withAuth re-checks that the session user exists; it is the only users
 * lookup that passes a callback as `where`. Everything else passes a drizzle
 * expression, so this lets a test script the real lookups without the session
 * probe eating one of them.
 */
function usersFindFirst(handler: (args: any) => any) {
  (mockedDb.query.users.findFirst as any).mockImplementation(async (args: any) => {
    if (typeof args?.where === 'function') {
      return { id: SESSION_USER_ID };
    }
    return handler(args);
  });
}

const mockedDb = vi.mocked(db);

describe('Social Actions (Real Functions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup sophisticated mock implementations for Drizzle ORM
    const createQueryMock = (result: any = []) => ({
      findFirst: vi.fn(() => Promise.resolve(result.length > 0 ? result[0] : null)),
      findMany: vi.fn(() => Promise.resolve(result)),
    });
    
    mockedDb.query = {
      users: createQueryMock([]),
      projectsTable: createQueryMock([]),
      profilesTable: createQueryMock([]),
      followersTable: createQueryMock([]),
    } as any;
    
    // Mock update/insert/delete methods
    mockedDb.update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'test-user', username: 'testuser' }]))
        }))
      }))
    }));
    
    mockedDb.insert = vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'new-follow' }]))
      }))
    }));
    
    mockedDb.delete = vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'deleted-follow' }]))
      }))
    }));
    
    mockedDb.select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ count: 0 }]))
      }))
    }));
  });

  describe('checkUsernameAvailability', () => {
    it('should return available for unused username', async () => {
      // Mock no existing user found
      mockedDb.query.users.findFirst.mockResolvedValue(null);

      const result = await checkUsernameAvailability('newuser');

      expect(result.available).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('should return unavailable for existing username', async () => {
      // Mock existing user found
      mockedDb.query.users.findFirst.mockResolvedValue({ 
        id: 'existing-user', 
        username: 'existinguser' 
      });

      const result = await checkUsernameAvailability('existinguser');

      expect(result.available).toBe(false);
      expect(result.message).toBe('Username is already taken');
    });

    it('should return unavailable for invalid format', async () => {
      const result = await checkUsernameAvailability('invalid user!');

      expect(result.available).toBe(false);
      expect(result.message).toBe('Username can only contain letters, numbers, underscores, and hyphens');
    });

    it('should return unavailable for too short username', async () => {
      const result = await checkUsernameAvailability('ab');

      expect(result.available).toBe(false);
      expect(result.message).toBe('Username must be at least 3 characters long');
    });

    it('should return unavailable for too long username', async () => {
      const result = await checkUsernameAvailability('a'.repeat(31));

      expect(result.available).toBe(false);
      expect(result.message).toBe('Username must be at most 30 characters long');
    });
  });


  describe('reserveUsername', () => {
    it('should successfully reserve available username', async () => {
      // `columns` narrows the availability lookup; the existence check does not.
      usersFindFirst((args) =>
        args?.columns ? null : { id: SESSION_USER_ID, username: null }
      );

      const result = await reserveUsername(SESSION_USER_ID, 'newuser');

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
    });

    it('should fail when user not found', async () => {
      usersFindFirst(() => null);

      const result = await reserveUsername(SESSION_USER_ID, 'newuser');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should fail when username is taken', async () => {
      usersFindFirst((args) =>
        args?.columns
          ? { id: 'other-user' }
          : { id: SESSION_USER_ID, username: null }
      );

      const result = await reserveUsername(SESSION_USER_ID, 'takenuser');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Username is already taken');
    });

    it('should refuse to claim a username for another user', async () => {
      usersFindFirst((args) =>
        args?.columns ? null : { id: 'someone-else', username: null }
      );

      const result = await reserveUsername('someone-else', 'newuser');

      expect(result.success).toBe(false);
      expect(mockedDb.update).not.toHaveBeenCalled();
    });
  });


});