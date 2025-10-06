import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { withAnalytics, verifyProfileOwnership } from '@/app/actions/analytics-hof';
import { analyticsCache } from '@/lib/analytics-cache';
import { getAuthSession } from '@/lib/auth';

// Mock the dependencies
vi.mock('@/lib/auth');
vi.mock('@/db');
vi.mock('@/lib/analytics-cache');

vi.mock('@/lib/rate-limiter', () => ({
  rateLimiter: {
    check: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe('Analytics Security Tests', () => {
  beforeEach(() => {
    // Clear cache before each test
    analyticsCache.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    analyticsCache.clear();
  });

  describe('Cache Isolation Between Users', () => {
    it('should NOT return cached data for unauthorized users', async () => {
      const mockGetAuthSession = vi.mocked(getAuthSession);

      // Create analytics function with caching enabled
      const testAnalytics = withAnalytics(
        (profileUuid: string, period: string) => ({ profileUuid, period }),
        (userId) => `test:${userId}`,
        async ({ profileUuid, period }) => {
          // Simulate analytics data
          return {
            data: `Analytics for profile ${profileUuid} in period ${period}`,
            sensitive: 'This should not leak to other users'
          };
        },
        {
          cache: {
            enabled: true,
            ttl: 60000,
          },
        }
      );

      // User 1 requests profile A (which they own)
      mockGetAuthSession.mockResolvedValueOnce({
        user: { id: 'user1', email: 'user1@test.com' },
      } as any);

      // Mock that user1 owns profileA
      const mockDb = (await import('@/db')).db;
      vi.mocked(mockDb.limit).mockResolvedValueOnce([{ uuid: 'profile-a' }]);

      const result1 = await testAnalytics('profile-a', '7d');
      expect(result1.success).toBe(true);
      expect(result1.data).toMatchObject({
        data: 'Analytics for profile profile-a in period 7d',
      });

      // User 2 tries to access the same profile (which they don't own)
      mockGetAuthSession.mockResolvedValueOnce({
        user: { id: 'user2', email: 'user2@test.com' },
      } as any);

      // Mock that user2 does NOT own profileA
      vi.mocked(mockDb.limit).mockResolvedValueOnce([]); // Empty array = no ownership

      const result2 = await testAnalytics('profile-a', '7d');

      // User 2 should be denied access
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Profile not found or unauthorized');

      // Ensure user 2 did NOT receive user 1's cached data
      expect(result2.data).toBeUndefined();
    });

    it('should maintain separate cache entries for different users', async () => {
      const mockGetAuthSession = vi.mocked(getAuthSession);

      const testAnalytics = withAnalytics(
        (profileUuid: string, period: string) => ({ profileUuid, period }),
        (userId) => `test:${userId}`,
        async ({ profileUuid, period }, userId) => {
          // Return user-specific data
          return {
            data: `User ${userId} analytics for ${profileUuid}`,
            userId: userId,
          };
        },
        {
          cache: {
            enabled: true,
            ttl: 60000,
          },
        }
      );

      // User 1 requests their profile
      mockGetAuthSession.mockResolvedValueOnce({
        user: { id: 'user1', email: 'user1@test.com' },
      } as any);

      const mockDb = (await import('@/db')).db;
      vi.mocked(mockDb.limit).mockResolvedValueOnce([{ uuid: 'profile-1' }]);

      const result1 = await testAnalytics('profile-1', '7d');
      expect(result1.success).toBe(true);
      expect(result1.data?.userId).toBe('user1');

      // User 2 requests their own profile
      mockGetAuthSession.mockResolvedValueOnce({
        user: { id: 'user2', email: 'user2@test.com' },
      } as any);

      vi.mocked(mockDb.limit).mockResolvedValueOnce([{ uuid: 'profile-2' }]);

      const result2 = await testAnalytics('profile-2', '7d');
      expect(result2.success).toBe(true);
      expect(result2.data?.userId).toBe('user2');

      // Verify cache keys are different for different users
      // User 1 requests again - should get their cached data
      mockGetAuthSession.mockResolvedValueOnce({
        user: { id: 'user1', email: 'user1@test.com' },
      } as any);

      vi.mocked(mockDb.limit).mockResolvedValueOnce([{ uuid: 'profile-1' }]);

      const result1Again = await testAnalytics('profile-1', '7d');
      expect(result1Again.success).toBe(true);
      expect(result1Again.data?.userId).toBe('user1'); // Should still be user1's data
    });
  });

  describe('Profile Ownership Verification', () => {
    it('should verify ownership before serving any data', async () => {
      const mockGetAuthSession = vi.mocked(getAuthSession);
      const mockDb = (await import('@/db')).db;

      let ownershipCheckCalled = false;
      let cacheCheckCalled = false;

      // Create a custom cache key generator to track when cache is checked
      const testAnalytics = withAnalytics(
        (profileUuid: string) => ({ profileUuid, period: '7d' }),
        (userId) => `test:${userId}`,
        async ({ profileUuid }) => {
          return { data: 'sensitive data' };
        },
        {
          cache: {
            enabled: true,
            ttl: 60000,
            keyGenerator: () => {
              cacheCheckCalled = true;
              return 'test-cache-key';
            },
          },
        }
      );

      // Mock auth
      mockGetAuthSession.mockResolvedValueOnce({
        user: { id: 'user1', email: 'user1@test.com' },
      } as any);

      // Track ownership verification
      vi.mocked(mockDb.limit).mockImplementationOnce(() => {
        ownershipCheckCalled = true;
        return Promise.resolve([]);  // No ownership
      });

      const result = await testAnalytics('some-profile');

      // Ownership should be checked BEFORE cache
      expect(ownershipCheckCalled).toBe(true);
      expect(cacheCheckCalled).toBe(false); // Cache should NOT be checked if ownership fails
      expect(result.success).toBe(false);
      expect(result.error).toBe('Profile not found or unauthorized');
    });
  });

  describe('Cache Key Security', () => {
    it('should include userId in cache keys for tenant isolation', () => {
      const { getCacheKey } = require('@/lib/analytics-cache');

      // Same profile and period but different users should have different cache keys
      const key1 = getCacheKey('overview', 'user1', 'profile-uuid', '7d');
      const key2 = getCacheKey('overview', 'user2', 'profile-uuid', '7d');

      expect(key1).not.toBe(key2);
      expect(key1).toContain('user1');
      expect(key2).toContain('user2');

      // Cache key should include all parameters for uniqueness
      expect(key1).toBe('analytics:overview:user1:profile-uuid:7d');
    });

    it('should handle undefined/null values safely in cache keys', () => {
      const { getCacheKey } = require('@/lib/analytics-cache');

      // Should filter out undefined/null but keep other falsy values like empty string
      const key = getCacheKey('test', 'user1', '', '7d', undefined, null, '0');
      expect(key).toBe('analytics:test:user1::7d:0');
    });
  });

  describe('Rate Limiting Before Expensive Operations', () => {
    it('should apply rate limiting before ownership checks', async () => {
      const mockGetAuthSession = vi.mocked(getAuthSession);
      const mockRateLimiter = (await import('@/lib/rate-limiter')).rateLimiter;
      const mockDb = (await import('@/db')).db;

      let rateLimitChecked = false;
      let ownershipChecked = false;

      vi.mocked(mockRateLimiter.check).mockImplementationOnce(async () => {
        rateLimitChecked = true;
        return { success: false };  // Rate limit exceeded
      });

      vi.mocked(mockDb.limit).mockImplementationOnce(() => {
        ownershipChecked = true;
        return Promise.resolve([{ uuid: 'profile' }]);
      });

      const testAnalytics = withAnalytics(
        (profileUuid: string) => ({ profileUuid, period: '7d' }),
        (userId) => `test:${userId}`,
        async () => ({ data: 'test' }),
        { cache: { enabled: false } }
      );

      mockGetAuthSession.mockResolvedValueOnce({
        user: { id: 'user1', email: 'user1@test.com' },
      } as any);

      const result = await testAnalytics('profile-uuid');

      // Rate limit should be checked first
      expect(rateLimitChecked).toBe(true);
      expect(ownershipChecked).toBe(false); // Should not check ownership if rate limited
      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
    });
  });
});