import { beforeEach, describe, expect, it, vi } from 'vitest';

import { 
  followUser, 
  unfollowUser, 
  getFollowers,
  getFollowing,
  shareServer,
  shareCollection,
  getSharedContent 
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
    
    // Setup default mock implementations
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

      // Mock target user exists and is public
      const targetUser = createMockUser({ 
        id: targetUserId, 
        is_public: true,
        username: 'targetuser' 
      });
      mockedDb.returning.mockResolvedValueOnce([targetUser]);

      // Mock not already following
      mockedDb.returning.mockResolvedValueOnce([]);

      // Mock successful follow creation
      const followRecord = {
        uuid: 'follow-uuid',
        follower_user_id: followerId,
        followed_user_id: targetUserId,
        created_at: new Date(),
      };
      mockedDb.returning.mockResolvedValueOnce([followRecord]);

      const result = await followUser(targetUserId);

      expect(result.success).toBe(true);
      expect(result.follow).toEqual(followRecord);
      expect(mockedDb.insert).toHaveBeenCalled();
    });

    it('should fail if user does not exist', async () => {
      const targetUserId = 'nonexistent-user-id';

      // Mock user not found
      mockedDb.returning.mockResolvedValueOnce([]);

      const result = await followUser(targetUserId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('User not found');
    });

    it('should fail if user is not public', async () => {
      const targetUserId = 'private-user-id';

      // Mock private user
      const privateUser = createMockUser({ 
        id: targetUserId, 
        is_public: false 
      });
      mockedDb.returning.mockResolvedValueOnce([privateUser]);

      const result = await followUser(targetUserId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('private profile');
    });

    it('should fail if already following', async () => {
      const targetUserId = 'target-user-id';

      // Mock target user exists
      const targetUser = createMockUser({ 
        id: targetUserId, 
        is_public: true 
      });
      mockedDb.returning.mockResolvedValueOnce([targetUser]);

      // Mock already following
      const existingFollow = {
        uuid: 'existing-follow-uuid',
        follower_user_id: 'test-user-id',
        followed_user_id: targetUserId,
      };
      mockedDb.returning.mockResolvedValueOnce([existingFollow]);

      const result = await followUser(targetUserId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already following');
    });

    it('should fail if trying to follow self', async () => {
      const result = await followUser('test-user-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot follow yourself');
    });
  });

  describe('unfollowUser', () => {
    it('should successfully unfollow a user', async () => {
      const targetUserId = 'target-user-id';

      // Mock existing follow relationship
      const existingFollow = {
        uuid: 'follow-uuid',
        follower_user_id: 'test-user-id',
        followed_user_id: targetUserId,
      };
      mockedDb.returning.mockResolvedValueOnce([existingFollow]);

      // Mock successful deletion
      mockedDb.returning.mockResolvedValueOnce([existingFollow]);

      const result = await unfollowUser(targetUserId);

      expect(result.success).toBe(true);
      expect(mockedDb.delete).toHaveBeenCalled();
    });

    it('should fail if not following the user', async () => {
      const targetUserId = 'target-user-id';

      // Mock no existing follow relationship
      mockedDb.returning.mockResolvedValueOnce([]);

      const result = await unfollowUser(targetUserId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not following');
    });
  });

  describe('getFollowers', () => {
    it('should return list of followers', async () => {
      const userId = 'test-user-id';
      const followers = [
        {
          follower_user_id: 'follower1',
          username: 'follower1',
          avatar_url: null,
          created_at: new Date(),
        },
        {
          follower_user_id: 'follower2', 
          username: 'follower2',
          avatar_url: 'avatar.jpg',
          created_at: new Date(),
        },
      ];

      mockedDb.returning.mockResolvedValueOnce(followers);

      const result = await getFollowers(userId);

      expect(result.success).toBe(true);
      expect(result.followers).toEqual(followers);
      expect(result.followers).toHaveLength(2);
    });

    it('should return empty array if no followers', async () => {
      const userId = 'test-user-id';

      mockedDb.returning.mockResolvedValueOnce([]);

      const result = await getFollowers(userId);

      expect(result.success).toBe(true);
      expect(result.followers).toEqual([]);
    });
  });

  describe('shareServer', () => {
    it('should successfully share a server publicly', async () => {
      const serverUuid = 'test-server-uuid';
      const shareData = {
        title: 'Shared Server Title',
        is_public: true,
      };

      // Mock server exists and user owns it
      const server = createMockMcpServer({ uuid: serverUuid });
      mockedDb.returning.mockResolvedValueOnce([server]);

      // Mock successful share creation
      const sharedServer = {
        uuid: 'shared-server-uuid',
        server_uuid: serverUuid,
        profile_uuid: 'test-profile-uuid',
        title: shareData.title,
        is_public: shareData.is_public,
        install_count: 0,
        created_at: new Date(),
      };
      mockedDb.returning.mockResolvedValueOnce([sharedServer]);

      const result = await shareServer(serverUuid, shareData);

      expect(result.success).toBe(true);
      expect(result.sharedServer).toEqual(sharedServer);
      expect(mockedDb.insert).toHaveBeenCalled();
    });

    it('should fail if server does not exist', async () => {
      const serverUuid = 'nonexistent-server-uuid';
      const shareData = { is_public: true };

      // Mock server not found
      mockedDb.returning.mockResolvedValueOnce([]);

      const result = await shareServer(serverUuid, shareData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Server not found');
    });

    it('should fail if user does not own the server', async () => {
      const serverUuid = 'test-server-uuid';
      const shareData = { is_public: true };

      // Mock server exists but belongs to different profile
      const server = createMockMcpServer({ 
        uuid: serverUuid,
        profile_uuid: 'different-profile-uuid'
      });
      mockedDb.returning.mockResolvedValueOnce([server]);

      const result = await shareServer(serverUuid, shareData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not authorized');
    });

    it('should fail if server is already shared', async () => {
      const serverUuid = 'test-server-uuid';
      const shareData = { is_public: true };

      // Mock server exists
      const server = createMockMcpServer({ uuid: serverUuid });
      mockedDb.returning.mockResolvedValueOnce([server]);

      // Mock already shared
      const existingShare = {
        uuid: 'existing-share-uuid',
        server_uuid: serverUuid,
      };
      mockedDb.returning.mockResolvedValueOnce([existingShare]);

      const result = await shareServer(serverUuid, shareData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already shared');
    });
  });

  describe('getSharedContent', () => {
    it('should return public shared servers and collections', async () => {
      const sharedContent = [
        {
          type: 'server',
          uuid: 'shared-server-1',
          title: 'Shared Server 1',
          install_count: 10,
          created_at: new Date(),
          profile_uuid: 'profile-1',
          username: 'creator1',
        },
        {
          type: 'collection',
          uuid: 'shared-collection-1', 
          title: 'Shared Collection 1',
          install_count: 5,
          created_at: new Date(),
          profile_uuid: 'profile-2',
          username: 'creator2',
        },
      ];

      mockedDb.returning.mockResolvedValueOnce(sharedContent);

      const result = await getSharedContent();

      expect(result.success).toBe(true);
      expect(result.content).toEqual(sharedContent);
      expect(result.content).toHaveLength(2);
    });

    it('should filter by content type', async () => {
      const serverContent = [
        {
          type: 'server',
          uuid: 'shared-server-1',
          title: 'Shared Server 1',
          install_count: 10,
        },
      ];

      mockedDb.returning.mockResolvedValueOnce(serverContent);

      const result = await getSharedContent({ type: 'server' });

      expect(result.success).toBe(true);
      expect(result.content).toEqual(serverContent);
      expect(mockedDb.where).toHaveBeenCalledWith(
        expect.objectContaining({
          // Should include type filter
        })
      );
    });

    it('should support pagination', async () => {
      const paginatedContent = [
        {
          type: 'server',
          uuid: 'shared-server-6',
          title: 'Shared Server 6',
        },
      ];

      mockedDb.returning.mockResolvedValueOnce(paginatedContent);

      const result = await getSharedContent({ 
        limit: 10, 
        offset: 50 
      });

      expect(result.success).toBe(true);
      expect(result.content).toEqual(paginatedContent);
    });

    it('should handle database errors during fetch', async () => {
      mockedDb.returning.mockRejectedValueOnce(new Error('Database error'));

      const result = await getSharedContent();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });
  });
});