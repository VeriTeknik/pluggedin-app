import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkUsernameAvailability, getUserByUsername, reserveUsername, updateUserSocial, followUser, unfollowUser, getUserFollowerCount } from '@/app/actions/social';
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

  describe('getUserByUsername', () => {
    it('should return user when found and public', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        is_public: true,
      };

      mockedDb.query.users.findFirst.mockResolvedValue(mockUser);

      const result = await getUserByUsername('testuser');

      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockedDb.query.users.findFirst.mockResolvedValue(null);

      const result = await getUserByUsername('nonexistent');

      expect(result).toBeNull();
    });

    it('should return user for private user when authenticated', async () => {
      const mockUser = {
        id: 'different-user-id',
        username: 'privateuser',
        email: 'private@example.com', 
        name: 'Private User',
        is_public: false,
      };

      mockedDb.query.users.findFirst.mockResolvedValue(mockUser);

      const result = await getUserByUsername('privateuser');

      // Since getAuthSession returns a valid user, this private user should be accessible
      expect(result).toEqual(mockUser);
    });
  });

  describe('reserveUsername', () => {
    it('should successfully reserve available username', async () => {
      const mockUser = { id: 'user-123', username: null };
      const updatedUser = { id: 'user-123', username: 'newuser' };
      
      mockedDb.query.users.findFirst
        .mockResolvedValueOnce(mockUser) // For user existence check
        .mockResolvedValueOnce(null); // For username availability check
      
      const result = await reserveUsername('user-123', 'newuser');

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
    });

    it('should fail when user not found', async () => {
      mockedDb.query.users.findFirst.mockResolvedValue(null);

      const result = await reserveUsername('nonexistent', 'newuser');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should fail when username is taken', async () => {
      const mockUser = { id: 'user-123', username: null };
      const existingUser = { id: 'other-user', username: 'takenuser' };
      
      mockedDb.query.users.findFirst
        .mockResolvedValueOnce(mockUser) // For user existence check
        .mockResolvedValueOnce(existingUser); // For username availability check

      const result = await reserveUsername('user-123', 'takenuser');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Username is already taken');
    });
  });

  describe('followUser', () => {
    it('should successfully follow user', async () => {
      const followerUser = { id: 'follower-id', username: 'follower' };
      const followedUser = { id: 'followed-id', username: 'followed' };
      
      mockedDb.query.users.findFirst
        .mockResolvedValueOnce(followerUser)
        .mockResolvedValueOnce(followedUser);
      mockedDb.query.followersTable.findFirst.mockResolvedValue(null);

      const result = await followUser('follower-id', 'followed-id');

      expect(result.success).toBe(true);
    });

    it('should fail when trying to follow self', async () => {
      const sameUser = { id: 'same-id', username: 'sameuser' };
      
      mockedDb.query.users.findFirst
        .mockResolvedValueOnce(sameUser)
        .mockResolvedValueOnce(sameUser);

      const result = await followUser('same-id', 'same-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot follow yourself');
    });

    it('should fail when already following', async () => {
      const followerUser = { id: 'follower-id', username: 'follower' };
      const followedUser = { id: 'followed-id', username: 'followed' };
      const existingFollow = { id: 'existing-follow' };
      
      mockedDb.query.users.findFirst
        .mockResolvedValueOnce(followerUser)
        .mockResolvedValueOnce(followedUser);
      mockedDb.query.followersTable.findFirst.mockResolvedValue(existingFollow);

      const result = await followUser('follower-id', 'followed-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Already following this user');
    });
  });

  describe('getUserFollowerCount', () => {
    it('should return correct follower count', async () => {
      // Mock the chained select query properly
      const mockChain = {
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ count: 5 }]))
        }))
      };
      mockedDb.select.mockReturnValue(mockChain);

      const result = await getUserFollowerCount('user-123');

      expect(result).toBe(5);
    });

    it('should return 0 when no followers', async () => {
      // Mock the chained select query properly
      const mockChain = {
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ count: 0 }]))
        }))
      };
      mockedDb.select.mockReturnValue(mockChain);

      const result = await getUserFollowerCount('user-123');

      expect(result).toBe(0);
    });

    it('should return 0 on database error', async () => {
      // Mock the chained select query to throw error
      const mockChain = {
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.reject(new Error('Database error')))
        }))
      };
      mockedDb.select.mockReturnValue(mockChain);

      const result = await getUserFollowerCount('user-123');

      expect(result).toBe(0);
    });
  });
});