import { beforeEach, describe, expect, it, vi } from 'vitest';

import { 
  followUser, 
  unfollowUser, 
  getFollowers,
  getFollowing,
  shareMcpServer,
  shareCollection,
  getSharedMcpServers,
  getSharedCollections 
} from '@/app/actions/social';
import { db } from '@/db';
import { createMockUser, createMockMcpServer, createMockProfile } from '../utils/mocks';

// Mock dependencies
vi.mock('@/db');
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(() => Promise.resolve({
    user: { id: 'test-user-id', username: 'testuser' }
  })),
}));
vi.mock('@/app/actions/profiles', () => ({
  getActiveProfile: vi.fn(() => Promise.resolve(createMockProfile())),
}));

const mockedDb = vi.mocked(db);

describe('Social Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations with query builders
    mockedDb.query = {
      users: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      followers: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      sharedServers: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      sharedCollections: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    } as any;
    
    mockedDb.select = vi.fn().mockReturnThis();
    mockedDb.insert = vi.fn().mockReturnThis();
    mockedDb.update = vi.fn().mockReturnThis();
    mockedDb.delete = vi.fn().mockReturnThis();
    mockedDb.from = vi.fn().mockReturnThis();
    mockedDb.where = vi.fn().mockReturnThis();
    mockedDb.values = vi.fn().mockReturnThis();
    mockedDb.set = vi.fn().mockReturnThis();
    mockedDb.returning = vi.fn();
    mockedDb.innerJoin = vi.fn().mockReturnThis();
    mockedDb.leftJoin = vi.fn().mockReturnThis();
  });

  describe('followUser', () => {
    it('should successfully follow a user', async () => {
      const targetUserId = 'target-user-id';
      const followerId = 'test-user-id';
      
      const targetUser = createMockUser({ 
        id: targetUserId, 
        is_public: true 
      });

      mockedDb.query.users.findFirst.mockResolvedValueOnce(targetUser);
      mockedDb.query.followers.findFirst.mockResolvedValueOnce(null); // Not already following
      mockedDb.returning.mockResolvedValueOnce([{ follower_user_id: followerId, followed_user_id: targetUserId }]);

      const result = await followUser(followerId, targetUserId);

      expect(result.success).toBe(true);
      expect(mockedDb.insert).toHaveBeenCalled();
    });

    it('should fail if user does not exist', async () => {
      const targetUserId = 'nonexistent-user-id';
      const followerId = 'test-user-id';

      mockedDb.query.users.findFirst.mockResolvedValueOnce(null);

      const result = await followUser(followerId, targetUserId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('User not found');
    });

    it('should fail if user is not public', async () => {
      const targetUserId = 'private-user-id';
      const followerId = 'test-user-id';
      
      const privateUser = createMockUser({ 
        id: targetUserId, 
        is_public: false 
      });

      mockedDb.query.users.findFirst.mockResolvedValueOnce(privateUser);

      const result = await followUser(followerId, targetUserId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('private profile');
    });

    it('should fail if already following', async () => {
      const targetUserId = 'target-user-id';
      const followerId = 'test-user-id';
      
      const targetUser = createMockUser({ 
        id: targetUserId, 
        is_public: true 
      });

      mockedDb.query.users.findFirst.mockResolvedValueOnce(targetUser);
      mockedDb.query.followers.findFirst.mockResolvedValueOnce({
        follower_user_id: followerId,
        followed_user_id: targetUserId
      });

      const result = await followUser(followerId, targetUserId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already following');
    });

    it('should fail if trying to follow self', async () => {
      const userId = 'test-user-id';

      const result = await followUser(userId, userId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot follow yourself');
    });
  });

  describe('unfollowUser', () => {
    it('should successfully unfollow a user', async () => {
      const targetUserId = 'target-user-id';
      const followerId = 'test-user-id';

      mockedDb.returning.mockResolvedValueOnce([{
        follower_user_id: followerId,
        followed_user_id: targetUserId
      }]);

      const result = await unfollowUser(followerId, targetUserId);

      expect(result.success).toBe(true);
      expect(mockedDb.delete).toHaveBeenCalled();
    });

    it('should fail if not following the user', async () => {
      const targetUserId = 'target-user-id';
      const followerId = 'test-user-id';

      mockedDb.returning.mockResolvedValueOnce([]);

      const result = await unfollowUser(followerId, targetUserId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not following');
    });
  });

  describe('getFollowers', () => {
    it('should return list of followers', async () => {
      const userId = 'test-user-id';
      const mockFollowers = [
        createMockUser({ id: 'follower-1' }),
        createMockUser({ id: 'follower-2' }),
      ];

      mockedDb.returning.mockResolvedValueOnce(mockFollowers);

      const result = await getFollowers(userId);

      expect(result).toHaveLength(2);
      expect(mockedDb.select).toHaveBeenCalled();
    });

    it('should return empty array if no followers', async () => {
      const userId = 'test-user-id';

      mockedDb.returning.mockResolvedValueOnce([]);

      const result = await getFollowers(userId);

      expect(result).toEqual([]);
    });
  });

  describe('shareMcpServer', () => {
    it('should successfully share a server publicly', async () => {
      const serverUuid = 'server-uuid';
      const profileUuid = 'profile-uuid';

      const mockServer = createMockMcpServer({ 
        uuid: serverUuid,
        profile_uuid: profileUuid 
      });

      mockedDb.query.sharedServers.findFirst.mockResolvedValueOnce(null); // Not already shared
      mockedDb.returning.mockResolvedValueOnce([{
        server_uuid: serverUuid,
        profile_uuid: profileUuid,
        is_public: true
      }]);

      const result = await shareMcpServer(serverUuid, profileUuid, true);

      expect(result.success).toBe(true);
      expect(mockedDb.insert).toHaveBeenCalled();
    });

    it('should fail if server is already shared', async () => {
      const serverUuid = 'server-uuid';
      const profileUuid = 'profile-uuid';

      mockedDb.query.sharedServers.findFirst.mockResolvedValueOnce({
        server_uuid: serverUuid,
        profile_uuid: profileUuid
      });

      const result = await shareMcpServer(serverUuid, profileUuid, true);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already shared');
    });
  });

  describe('getSharedMcpServers', () => {
    it('should return public shared servers', async () => {
      const mockSharedServers = [
        {
          server: createMockMcpServer(),
          profile: createMockProfile(),
          user: createMockUser()
        },
        {
          server: createMockMcpServer(),
          profile: createMockProfile(),
          user: createMockUser()
        },
      ];

      mockedDb.returning.mockResolvedValueOnce(mockSharedServers);

      const result = await getSharedMcpServers({ isPublic: true });

      expect(result).toHaveLength(2);
      expect(mockedDb.select).toHaveBeenCalled();
    });

    it('should filter by user ID when provided', async () => {
      const userId = 'specific-user-id';
      const mockSharedServers = [
        {
          server: createMockMcpServer(),
          profile: createMockProfile(),
          user: createMockUser({ id: userId })
        },
      ];

      mockedDb.returning.mockResolvedValueOnce(mockSharedServers);

      const result = await getSharedMcpServers({ userId });

      expect(result).toHaveLength(1);
      expect(mockedDb.where).toHaveBeenCalled();
    });

    it('should support pagination', async () => {
      const mockSharedServers = Array(10).fill(null).map(() => ({
        server: createMockMcpServer(),
        profile: createMockProfile(),
        user: createMockUser()
      }));

      mockedDb.returning.mockResolvedValueOnce(mockSharedServers);

      const result = await getSharedMcpServers({ 
        isPublic: true,
        limit: 10,
        offset: 0
      });

      expect(result).toHaveLength(10);
    });

    it('should handle database errors during fetch', async () => {
      mockedDb.select.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(getSharedMcpServers({})).rejects.toThrow('Database error');
    });
  });
});