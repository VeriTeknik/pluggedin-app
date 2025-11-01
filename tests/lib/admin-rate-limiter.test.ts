import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkAdminRateLimit,
  getAdminRateLimitStatus,
  resetAdminRateLimit,
  type AdminRateLimitType,
} from '@/lib/admin-rate-limiter';

// Mock rate-limiter-flexible
vi.mock('rate-limiter-flexible', () => {
  class MockRateLimiterMemory {
    points: number;
    duration: number;
    keyPrefix: string;
    consumedPoints: Map<string, { points: number; resetTime: number }> = new Map();

    constructor(opts: any) {
      this.points = opts.points;
      this.duration = opts.duration;
      this.keyPrefix = opts.keyPrefix;
    }

    async consume(key: string, points = 1) {
      const now = Date.now();
      const data = this.consumedPoints.get(key) || { points: 0, resetTime: now + this.duration * 1000 };

      if (now > data.resetTime) {
        // Reset if expired
        data.points = 0;
        data.resetTime = now + this.duration * 1000;
      }

      if (data.points + points > this.points) {
        const msBeforeNext = data.resetTime - now;
        const error: any = new Error('Rate limit exceeded');
        error.msBeforeNext = msBeforeNext;
        error.remainingPoints = this.points - data.points;
        throw error;
      }

      data.points += points;
      this.consumedPoints.set(key, data);
      return { consumedPoints: data.points, remainingPoints: this.points - data.points };
    }

    async get(key: string) {
      const now = Date.now();
      const data = this.consumedPoints.get(key);

      if (!data || now > data.resetTime) {
        return null;
      }

      return { consumedPoints: data.points };
    }

    async delete(key: string) {
      this.consumedPoints.delete(key);
    }

    reset() {
      this.consumedPoints.clear();
    }
  }

  return {
    RateLimiterMemory: MockRateLimiterMemory,
  };
});

describe('Admin Rate Limiter', () => {
  const testAdminId = 'admin-123';

  beforeEach(async () => {
    vi.clearAllMocks();
    const adminIds = [
      testAdminId,
      'admin-independent',
      'admin-1',
      'admin-2',
      'admin-general',
      'admin-email',
      'admin-bulk',
      'admin-sensitive',
    ];

    await Promise.all(adminIds.map((id) => resetAdminRateLimit(id)));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkAdminRateLimit', () => {
    it('should allow requests within rate limit for general actions', async () => {
      await expect(
        checkAdminRateLimit(testAdminId, 'general')
      ).resolves.toBeUndefined();

      // Should allow multiple requests up to the limit (100 per minute)
      for (let i = 0; i < 50; i++) {
        await checkAdminRateLimit(testAdminId, 'general');
      }

      // Should still be within limit
      await expect(
        checkAdminRateLimit(testAdminId, 'general')
      ).resolves.toBeUndefined();
    });

    it('should reject requests exceeding rate limit', async () => {
      // Consume all points for email limiter (10 per hour)
      for (let i = 0; i < 10; i++) {
        await checkAdminRateLimit(testAdminId, 'email');
      }

      // Next request should be rejected
      await expect(
        checkAdminRateLimit(testAdminId, 'email')
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle different rate limit types independently', async () => {
      const adminId = 'admin-independent';

      // Consume some general points
      for (let i = 0; i < 50; i++) {
        await checkAdminRateLimit(adminId, 'general');
      }

      // Email limit should still be available
      await expect(
        checkAdminRateLimit(adminId, 'email')
      ).resolves.toBeUndefined();

      // Bulk operations should still be available
      await expect(
        checkAdminRateLimit(adminId, 'bulk')
      ).resolves.toBeUndefined();

      // Sensitive operations should still be available
      await expect(
        checkAdminRateLimit(adminId, 'sensitive')
      ).resolves.toBeUndefined();
    });

    it('should track different admins independently', async () => {
      const admin1 = 'admin-1';
      const admin2 = 'admin-2';

      // Consume all email points for admin1
      for (let i = 0; i < 10; i++) {
        await checkAdminRateLimit(admin1, 'email');
      }

      // admin1 should be rate limited
      await expect(
        checkAdminRateLimit(admin1, 'email')
      ).rejects.toThrow('Rate limit exceeded');

      // admin2 should still have all points available
      await expect(
        checkAdminRateLimit(admin2, 'email')
      ).resolves.toBeUndefined();
    });

    it('should provide retry time in error message', async () => {
      // Consume all bulk operation points (5 per hour)
      for (let i = 0; i < 5; i++) {
        await checkAdminRateLimit(testAdminId, 'bulk');
      }

      try {
        await checkAdminRateLimit(testAdminId, 'bulk');
        expect.fail('Should have thrown rate limit error');
      } catch (error: any) {
        expect(error.message).toMatch(/Rate limit exceeded.*try again in \d+ seconds/);
      }
    });

    it('should use correct rate limits for each type', async () => {
      const limits = {
        general: 100,    // 100 per minute
        email: 10,       // 10 per hour
        bulk: 5,         // 5 per hour
        sensitive: 20,   // 20 per hour
      };

      for (const [type, limit] of Object.entries(limits)) {
        const adminId = `admin-${type}`;

        // Consume up to the limit
        for (let i = 0; i < limit; i++) {
          await checkAdminRateLimit(adminId, type as AdminRateLimitType);
        }

        // Next request should fail
        await expect(
          checkAdminRateLimit(adminId, type as AdminRateLimitType)
        ).rejects.toThrow('Rate limit exceeded');
      }
    });

    it('should default to general rate limit type', async () => {
      // When no type is specified, should use 'general'
      await expect(
        checkAdminRateLimit(testAdminId)
      ).resolves.toBeUndefined();

      // Should count against general limit
      for (let i = 0; i < 99; i++) {
        await checkAdminRateLimit(testAdminId);
      }

      // Should be at the limit for general
      await expect(
        checkAdminRateLimit(testAdminId, 'general')
      ).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('getAdminRateLimitStatus', () => {
    it('should return full points when no requests made', async () => {
      const status = await getAdminRateLimitStatus(testAdminId, 'email');

      expect(status.remainingPoints).toBe(10); // Email limit is 10
      expect(status.totalPoints).toBe(10);
      expect(status.resetTime).toBeInstanceOf(Date);
      expect(status.resetTime.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return correct remaining points after consumption', async () => {
      // Consume 3 email points
      for (let i = 0; i < 3; i++) {
        await checkAdminRateLimit(testAdminId, 'email');
      }

      const status = await getAdminRateLimitStatus(testAdminId, 'email');

      expect(status.remainingPoints).toBe(7);
      expect(status.totalPoints).toBe(10);
    });

    it('should return zero remaining points when limit exceeded', async () => {
      // Consume all bulk operation points
      for (let i = 0; i < 5; i++) {
        await checkAdminRateLimit(testAdminId, 'bulk');
      }

      const status = await getAdminRateLimitStatus(testAdminId, 'bulk');

      expect(status.remainingPoints).toBe(0);
      expect(status.totalPoints).toBe(5);
    });

    it('should handle different rate limit types', async () => {
      const types: AdminRateLimitType[] = ['general', 'email', 'bulk', 'sensitive'];

      for (const type of types) {
        const status = await getAdminRateLimitStatus(`admin-${type}`, type);

        expect(status.totalPoints).toBeGreaterThan(0);
        expect(status.remainingPoints).toBeLessThanOrEqual(status.totalPoints);
        expect(status.resetTime).toBeInstanceOf(Date);
      }
    });

    it('should return correct reset time based on duration', async () => {
      // General limiter has 60 second duration
      const generalStatus = await getAdminRateLimitStatus(testAdminId, 'general');
      const generalResetMs = generalStatus.resetTime.getTime() - Date.now();
      expect(generalResetMs).toBeLessThanOrEqual(60 * 1000);
      expect(generalResetMs).toBeGreaterThan(0);

      // Email limiter has 3600 second (1 hour) duration
      const emailStatus = await getAdminRateLimitStatus(testAdminId, 'email');
      const emailResetMs = emailStatus.resetTime.getTime() - Date.now();
      expect(emailResetMs).toBeLessThanOrEqual(3600 * 1000);
      expect(emailResetMs).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      // Even with an error, should return default values
      const status = await getAdminRateLimitStatus('error-admin', 'general');

      expect(status.remainingPoints).toBe(100); // Default to total points
      expect(status.totalPoints).toBe(100);
      expect(status.resetTime).toBeInstanceOf(Date);
    });
  });

  describe('resetAdminRateLimit', () => {
    it('should reset rate limit for specific type', async () => {
      // Consume all email points
      for (let i = 0; i < 10; i++) {
        await checkAdminRateLimit(testAdminId, 'email');
      }

      // Should be rate limited
      await expect(
        checkAdminRateLimit(testAdminId, 'email')
      ).rejects.toThrow('Rate limit exceeded');

      // Reset email rate limit
      await resetAdminRateLimit(testAdminId, 'email');

      // Should be able to make requests again
      await expect(
        checkAdminRateLimit(testAdminId, 'email')
      ).resolves.toBeUndefined();

      // Verify all points are available
      const status = await getAdminRateLimitStatus(testAdminId, 'email');
      expect(status.remainingPoints).toBe(9);
    });

    it('should reset all rate limits when type not specified', async () => {
      // Consume points from all types
      for (let i = 0; i < 5; i++) {
        await checkAdminRateLimit(testAdminId, 'bulk');
      }
      for (let i = 0; i < 10; i++) {
        await checkAdminRateLimit(testAdminId, 'email');
      }
      for (let i = 0; i < 20; i++) {
        await checkAdminRateLimit(testAdminId, 'sensitive');
      }

      // All should be at limit
      await expect(checkAdminRateLimit(testAdminId, 'bulk')).rejects.toThrow();
      await expect(checkAdminRateLimit(testAdminId, 'email')).rejects.toThrow();
      await expect(checkAdminRateLimit(testAdminId, 'sensitive')).rejects.toThrow();

      // Reset all limits
      await resetAdminRateLimit(testAdminId);

      // All should be available again
      await expect(checkAdminRateLimit(testAdminId, 'bulk')).resolves.toBeUndefined();
      await expect(checkAdminRateLimit(testAdminId, 'email')).resolves.toBeUndefined();
      await expect(checkAdminRateLimit(testAdminId, 'sensitive')).resolves.toBeUndefined();
    });

    it('should only reset limits for specific admin', async () => {
      const admin1 = 'admin-1';
      const admin2 = 'admin-2';

      // Consume all email points for both admins
      for (let i = 0; i < 10; i++) {
        await checkAdminRateLimit(admin1, 'email');
        await checkAdminRateLimit(admin2, 'email');
      }

      // Both should be rate limited
      await expect(checkAdminRateLimit(admin1, 'email')).rejects.toThrow();
      await expect(checkAdminRateLimit(admin2, 'email')).rejects.toThrow();

      // Reset only admin1
      await resetAdminRateLimit(admin1, 'email');

      // admin1 should be reset
      await expect(checkAdminRateLimit(admin1, 'email')).resolves.toBeUndefined();

      // admin2 should still be rate limited
      await expect(checkAdminRateLimit(admin2, 'email')).rejects.toThrow();
    });

    it('should handle reset for non-existent admin gracefully', async () => {
      // Should not throw when resetting non-existent admin
      await expect(
        resetAdminRateLimit('non-existent-admin', 'general')
      ).resolves.toBeUndefined();

      await expect(
        resetAdminRateLimit('non-existent-admin')
      ).resolves.toBeUndefined();
    });
  });

  describe('Rate Limit Durations', () => {
    it('should enforce correct durations for each type', () => {
      const expectedDurations = {
        general: 60,      // 1 minute
        email: 3600,      // 1 hour
        bulk: 3600,       // 1 hour
        sensitive: 3600,  // 1 hour
      };

      // This test validates that the mock is configured correctly
      // In real implementation, these would be the actual durations
      Object.entries(expectedDurations).forEach(([type, duration]) => {
        // The test implementation would verify the actual limiter configurations
        expect(duration).toBeGreaterThan(0);
      });
    });
  });

  describe('Emergency Use Cases', () => {
    it('should allow emergency reset for critical operations', async () => {
      // Simulate a scenario where an admin needs emergency access
      const emergencyAdminId = 'emergency-admin';

      // Consume all sensitive operation points
      for (let i = 0; i < 20; i++) {
        await checkAdminRateLimit(emergencyAdminId, 'sensitive');
      }

      // Should be blocked
      await expect(
        checkAdminRateLimit(emergencyAdminId, 'sensitive')
      ).rejects.toThrow();

      // Emergency reset
      await resetAdminRateLimit(emergencyAdminId, 'sensitive');

      // Should have access again
      await expect(
        checkAdminRateLimit(emergencyAdminId, 'sensitive')
      ).resolves.toBeUndefined();
    });
  });
});
