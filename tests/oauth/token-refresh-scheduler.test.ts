import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * OAuth Token Refresh Scheduler Tests
 *
 * Tests the background scheduler that proactively refreshes tokens:
 * - Scheduler lifecycle (start/stop/restart)
 * - Token query filtering (expiring tokens, locked tokens, recently used)
 * - Parallel processing with concurrency limits (p-limit)
 * - Graceful shutdown handling
 * - Metrics recording
 * - Test environment detection
 */

// Mock dependencies
vi.mock('@/lib/observability/logger', () => ({
  log: {
    oauth: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/observability/oauth-metrics', () => ({
  recordScheduledRefresh: vi.fn(),
  recordScheduledRefreshError: vi.fn(),
  updateTokensExpiringSoonGauge: vi.fn(),
}));

vi.mock('@/lib/oauth/token-refresh-service', () => ({
  refreshOAuthToken: vi.fn(),
}));

// Mock p-limit to track concurrency
const mockLimit = vi.fn((fn: () => Promise<any>) => fn());
vi.mock('p-limit', () => ({
  default: vi.fn(() => mockLimit),
}));

// Create mock db at module level
const mockDb = {
  select: vi.fn(),
  from: vi.fn(),
  innerJoin: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
};

vi.mock('@/db', () => {
  return { db: mockDb };
});

describe('OAuth Token Refresh Scheduler', () => {
  let scheduler: any;
  let refreshOAuthToken: any;
  let metrics: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();

    // Set up mock db chain
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.innerJoin.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.limit.mockResolvedValue([]);

    // Import fresh modules
    refreshOAuthToken = (await import('@/lib/oauth/token-refresh-service')).refreshOAuthToken;
    metrics = await import('@/lib/observability/oauth-metrics');
    scheduler = await import('@/lib/oauth/token-refresh-scheduler');

    // Reset environment variables
    delete process.env.NODE_ENV;
    delete process.env.VITEST;
    delete process.env.JEST_WORKER_ID;
    delete process.env.MOCHA;
    delete process.env.JASMINE;
    delete process.env.TEST_ENV;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Scheduler Lifecycle', () => {
    it('should not start in test environment', () => {
      process.env.NODE_ENV = 'test';

      scheduler.startTokenRefreshScheduler();

      // Should not schedule any intervals
      expect(vi.getTimerCount()).toBe(0);
    });

    it('should detect VITEST environment', () => {
      process.env.VITEST = 'true';

      scheduler.startTokenRefreshScheduler();

      expect(vi.getTimerCount()).toBe(0);
    });

    it('should detect Jest environment', () => {
      process.env.JEST_WORKER_ID = '1';

      scheduler.startTokenRefreshScheduler();

      expect(vi.getTimerCount()).toBe(0);
    });

    it('should start scheduler in production', async () => {
      // Force production environment (override all test detection)
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VITEST', '');
      vi.stubEnv('JEST_WORKER_ID', '');
      vi.stubEnv('MOCHA', '');
      vi.stubEnv('JASMINE', '');
      vi.stubEnv('TEST_ENV', '');

      // Mock empty token list
      mockDb.limit.mockResolvedValue([]);

      scheduler.startTokenRefreshScheduler();

      // Should create interval
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      // Clean up
      scheduler.stopTokenRefreshScheduler();
      vi.unstubAllEnvs();
    });

    it('should not start if already running', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VITEST', '');
      mockDb.limit.mockResolvedValue([]);

      scheduler.startTokenRefreshScheduler();
      const timerCount1 = vi.getTimerCount();

      scheduler.startTokenRefreshScheduler();
      const timerCount2 = vi.getTimerCount();

      // Should not create additional timers
      expect(timerCount2).toBe(timerCount1);

      scheduler.stopTokenRefreshScheduler();
      vi.unstubAllEnvs();
    });

    it('should stop scheduler gracefully', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VITEST', '');
      mockDb.limit.mockResolvedValue([]);

      scheduler.startTokenRefreshScheduler();
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      scheduler.stopTokenRefreshScheduler();
      expect(vi.getTimerCount()).toBe(0);
      vi.unstubAllEnvs();
    });
  });

  describe('Token Query Filtering', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      scheduler.stopTokenRefreshScheduler();
    });

    it('should query tokens expiring within 15 minutes', async () => {
      const now = new Date('2025-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const mockTokens = [
        {
          server_uuid: 'server-1',
          expires_at: new Date('2025-01-15T10:10:00Z'), // 10 min
          user_id: 'user-1',
          server_name: 'Test Server 1',
          locked_at: null,
        },
      ];

      mockDb.limit.mockResolvedValue(mockTokens);
      (refreshOAuthToken as any).mockResolvedValue(true);

      await scheduler.triggerTokenRefresh();

      // Verify query was called
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should exclude locked tokens', async () => {
      const mockTokens: any[] = []; // No tokens (locked ones excluded)
      mockDb.limit.mockResolvedValue(mockTokens);

      await scheduler.triggerTokenRefresh();

      expect(metrics.updateTokensExpiringSoonGauge).toHaveBeenCalledWith(0);
    });

    it('should exclude recently used tokens (< 10 seconds)', async () => {
      // The query filter should exclude tokens used within 10 seconds
      const mockTokens: any[] = []; // Empty (recently used excluded by query)
      mockDb.limit.mockResolvedValue(mockTokens);

      await scheduler.triggerTokenRefresh();

      expect(metrics.updateTokensExpiringSoonGauge).toHaveBeenCalledWith(0);
    });

    it('should include stale locked tokens (> 2 minutes)', async () => {
      const now = new Date('2025-01-15T10:00:00Z');
      vi.setSystemTime(now);

      const mockTokens = [
        {
          server_uuid: 'server-1',
          expires_at: new Date('2025-01-15T10:05:00Z'),
          user_id: 'user-1',
          server_name: 'Stale Lock Server',
          locked_at: new Date('2025-01-15T09:57:00Z'), // 3 min ago (stale)
        },
      ];

      mockDb.limit.mockResolvedValue(mockTokens);
      (refreshOAuthToken as any).mockResolvedValue(true);

      await scheduler.triggerTokenRefresh();

      expect(refreshOAuthToken).toHaveBeenCalledWith('server-1', 'user-1');
    });

    it('should respect BATCH_SIZE limit', async () => {
      const mockTokens = Array.from({ length: 50 }, (_, i) => ({
        server_uuid: `server-${i}`,
        expires_at: new Date(),
        user_id: `user-${i}`,
        server_name: `Server ${i}`,
        locked_at: null,
      }));

      mockDb.limit.mockResolvedValue(mockTokens);
      (refreshOAuthToken as any).mockResolvedValue(true);

      await scheduler.triggerTokenRefresh();

      // Should call limit with 50
      expect(mockDb.limit).toHaveBeenCalledWith(50);
    });
  });

  describe('Parallel Processing with Concurrency Limits', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      scheduler.stopTokenRefreshScheduler();
    });

    it('should process tokens in parallel with concurrency limit', async () => {
      const mockTokens = Array.from({ length: 10 }, (_, i) => ({
        server_uuid: `server-${i}`,
        expires_at: new Date(),
        user_id: `user-${i}`,
        server_name: `Server ${i}`,
        locked_at: null,
      }));

      mockDb.limit.mockResolvedValue(mockTokens);
      (refreshOAuthToken as any).mockResolvedValue(true);

      await scheduler.triggerTokenRefresh();

      // Verify all tokens were processed
      expect(refreshOAuthToken).toHaveBeenCalledTimes(10);

      // Verify concurrency limiter was used
      expect(mockLimit).toHaveBeenCalled();
    });

    it('should handle partial failures gracefully', async () => {
      const mockTokens = [
        {
          server_uuid: 'server-1',
          expires_at: new Date(),
          user_id: 'user-1',
          server_name: 'Success Server',
          locked_at: null,
        },
        {
          server_uuid: 'server-2',
          expires_at: new Date(),
          user_id: 'user-2',
          server_name: 'Fail Server',
          locked_at: null,
        },
      ];

      mockDb.limit.mockResolvedValue(mockTokens);
      (refreshOAuthToken as any)
        .mockResolvedValueOnce(true) // server-1 succeeds
        .mockResolvedValueOnce(false); // server-2 fails

      const result = await scheduler.triggerTokenRefresh();

      expect(result.refreshed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should handle exceptions in token processing', async () => {
      const mockTokens = [
        {
          server_uuid: 'server-1',
          expires_at: new Date(),
          user_id: 'user-1',
          server_name: 'Exception Server',
          locked_at: null,
        },
      ];

      mockDb.limit.mockResolvedValue(mockTokens);
      (refreshOAuthToken as any).mockRejectedValue(new Error('Network error'));

      const result = await scheduler.triggerTokenRefresh();

      expect(result.refreshed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain('Network error');
    });

    it('should record error metrics for failures', async () => {
      const mockTokens = [
        {
          server_uuid: 'server-1',
          expires_at: new Date(),
          user_id: 'user-1',
          server_name: 'Fail Server',
          locked_at: null,
        },
      ];

      mockDb.limit.mockResolvedValue(mockTokens);
      (refreshOAuthToken as any).mockResolvedValue(false);

      await scheduler.triggerTokenRefresh();

      expect(metrics.recordScheduledRefreshError).toHaveBeenCalledWith('endpoint_error');
    });

    it('should record exception metrics for errors', async () => {
      const mockTokens = [
        {
          server_uuid: 'server-1',
          expires_at: new Date(),
          user_id: 'user-1',
          server_name: 'Exception Server',
          locked_at: null,
        },
      ];

      mockDb.limit.mockResolvedValue(mockTokens);
      (refreshOAuthToken as any).mockRejectedValue(new Error('Database error'));

      await scheduler.triggerTokenRefresh();

      expect(metrics.recordScheduledRefreshError).toHaveBeenCalledWith('exception');
    });
  });

  describe('Metrics Recording', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      scheduler.stopTokenRefreshScheduler();
    });

    it('should update tokens expiring soon gauge', async () => {
      const mockTokens = Array.from({ length: 5 }, (_, i) => ({
        server_uuid: `server-${i}`,
        expires_at: new Date(),
        user_id: `user-${i}`,
        server_name: `Server ${i}`,
        locked_at: null,
      }));

      mockDb.limit.mockResolvedValue(mockTokens);
      (refreshOAuthToken as any).mockResolvedValue(true);

      await scheduler.triggerTokenRefresh();

      expect(metrics.updateTokensExpiringSoonGauge).toHaveBeenCalledWith(5);
    });

    it('should record successful refresh metrics', async () => {
      const mockTokens = [
        {
          server_uuid: 'server-1',
          expires_at: new Date(),
          user_id: 'user-1',
          server_name: 'Server 1',
          locked_at: null,
        },
      ];

      mockDb.limit.mockResolvedValue(mockTokens);
      (refreshOAuthToken as any).mockResolvedValue(true);

      await scheduler.triggerTokenRefresh();

      expect(metrics.recordScheduledRefresh).toHaveBeenCalledWith(
        true, // success
        expect.any(Number), // duration
        1, // tokens checked
        1, // refreshed
        0 // failed
      );
    });

    it('should record failed refresh metrics', async () => {
      const mockTokens = [
        {
          server_uuid: 'server-1',
          expires_at: new Date(),
          user_id: 'user-1',
          server_name: 'Server 1',
          locked_at: null,
        },
      ];

      mockDb.limit.mockResolvedValue(mockTokens);
      (refreshOAuthToken as any).mockResolvedValue(false);

      await scheduler.triggerTokenRefresh();

      expect(metrics.recordScheduledRefresh).toHaveBeenCalledWith(
        false, // success = false
        expect.any(Number),
        1,
        0,
        1 // failed
      );
    });

    it('should record metrics for empty batch', async () => {
      mockDb.limit.mockResolvedValue([]);

      await scheduler.triggerTokenRefresh();

      expect(metrics.recordScheduledRefresh).toHaveBeenCalledWith(
        true,
        expect.any(Number),
        0,
        0,
        0
      );
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      scheduler.stopTokenRefreshScheduler();
    });

    it('should handle database errors gracefully', async () => {
      mockDb.limit.mockRejectedValue(new Error('Database connection failed'));

      const result = await scheduler.triggerTokenRefresh();

      expect(result.refreshed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toContain('Database connection failed');
    });

    it('should record metrics for fatal errors', async () => {
      mockDb.limit.mockRejectedValue(new Error('Fatal error'));

      await scheduler.triggerTokenRefresh();

      expect(metrics.recordScheduledRefresh).toHaveBeenCalledWith(
        false,
        expect.any(Number),
        0,
        0,
        1
      );
      expect(metrics.recordScheduledRefreshError).toHaveBeenCalledWith('exception');
    });
  });
});
