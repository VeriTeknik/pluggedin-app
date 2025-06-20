import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkUsernameAvailability, getUserByUsername } from '@/app/actions/social';
import { db } from '@/db';

// Mock dependencies
vi.mock('@/db');
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(() => Promise.resolve({
    user: { id: 'test-user-id', username: 'testuser' }
  })),
}));

const mockedDb = vi.mocked(db);

describe('Social Actions (Real Functions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    mockedDb.select = vi.fn().mockReturnThis();
    mockedDb.from = vi.fn().mockReturnThis();
    mockedDb.where = vi.fn().mockReturnThis();
    mockedDb.limit = vi.fn().mockReturnValue(Promise.resolve([]));
  });

  describe('checkUsernameAvailability', () => {
    it('should return available for unused username', async () => {
      // Mock no existing user found
      mockedDb.limit.mockResolvedValue([]);

      const result = await checkUsernameAvailability('newuser');

      expect(result.available).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return unavailable for existing username', async () => {
      // Mock existing user found
      mockedDb.limit.mockResolvedValue([{ 
        id: 'existing-user', 
        username: 'existinguser' 
      }]);

      const result = await checkUsernameAvailability('existinguser');

      expect(result.available).toBe(false);
      expect(result.reason).toBe('Username is already taken');
    });

    it('should return unavailable for reserved usernames', async () => {
      const result = await checkUsernameAvailability('admin');

      expect(result.available).toBe(false);
      expect(result.reason).toBe('Username is reserved');
    });

    it('should return unavailable for invalid format', async () => {
      const result = await checkUsernameAvailability('invalid user!');

      expect(result.available).toBe(false);
      expect(result.reason).toBe('Username contains invalid characters');
    });

    it('should return unavailable for too short username', async () => {
      const result = await checkUsernameAvailability('ab');

      expect(result.available).toBe(false);
      expect(result.reason).toBe('Username must be between 3 and 30 characters');
    });

    it('should return unavailable for too long username', async () => {
      const result = await checkUsernameAvailability('a'.repeat(31));

      expect(result.available).toBe(false);
      expect(result.reason).toBe('Username must be between 3 and 30 characters');
    });
  });

  describe('getUserByUsername', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        name: 'Test User',
        is_public: true,
      };

      mockedDb.limit.mockResolvedValue([mockUser]);

      const result = await getUserByUsername('testuser');

      expect(result).toEqual(mockUser);
      expect(mockedDb.select).toHaveBeenCalled();
      expect(mockedDb.where).toHaveBeenCalled();
    });

    it('should return null when user not found', async () => {
      mockedDb.limit.mockResolvedValue([]);

      const result = await getUserByUsername('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      mockedDb.limit.mockRejectedValue(new Error('Database error'));

      await expect(getUserByUsername('testuser')).rejects.toThrow('Database error');
    });
  });
});