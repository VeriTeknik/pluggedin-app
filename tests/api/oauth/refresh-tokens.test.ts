import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * OAuth Token Refresh Cron Endpoint Tests
 *
 * Tests the cron endpoint for scheduled token refreshes:
 * - CRON_SECRET authentication (timing-safe comparison)
 * - Secret length validation (prevents partial matching)
 * - Rate limiting enforcement
 * - Successful token refresh
 * - Error handling
 */

// Mock dependencies
vi.mock('@/lib/oauth/token-refresh-scheduler', () => ({
  triggerTokenRefresh: vi.fn(),
}));

// Create a controllable rate limiter mock
const mockRateLimiterFn = vi.fn().mockResolvedValue({ allowed: true });

vi.mock('@/lib/rate-limiter', () => ({
  createRateLimiter: vi.fn(() => mockRateLimiterFn),
}));

// Mock crypto.timingSafeEqual
const mockTimingSafeEqual = vi.fn();
vi.mock('crypto', async () => {
  const actual = await vi.importActual('crypto');
  return {
    ...actual,
    timingSafeEqual: mockTimingSafeEqual,
  };
});

describe('OAuth Token Refresh Cron Endpoint', () => {
  let triggerTokenRefresh: any;
  let POST: any;
  let GET: any;

  const VALID_SECRET = 'test-cron-secret-12345';

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset rate limiter mock to allow requests by default
    mockRateLimiterFn.mockResolvedValue({ allowed: true });

    // Set environment
    process.env.CRON_SECRET = VALID_SECRET;

    // Import fresh endpoint
    triggerTokenRefresh = (await import('@/lib/oauth/token-refresh-scheduler')).triggerTokenRefresh;
    const endpoint = await import('@/app/api/oauth/refresh-tokens/route');
    POST = endpoint.POST;
    GET = endpoint.GET;

    // Default: timingSafeEqual returns true for valid secrets
    mockTimingSafeEqual.mockReturnValue(true);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  describe('Authentication', () => {
    it('should reject requests without CRON_SECRET env', async () => {
      delete process.env.CRON_SECRET;

      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: 'Bearer anything' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Service not configured');
    });

    it('should reject requests without Authorization header', async () => {
      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject requests with invalid Authorization format', async () => {
      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: 'Basic invalid' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should reject secrets with incorrect length', async () => {
      const shortSecret = 'short'; // Different length from VALID_SECRET

      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${shortSecret}` },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');

      // timingSafeEqual should NOT be called (rejected by length check first)
      expect(mockTimingSafeEqual).not.toHaveBeenCalled();
    });

    it('should reject too-long secrets (prevents partial matching)', async () => {
      const longSecret = VALID_SECRET + 'extra'; // Longer than VALID_SECRET

      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${longSecret}` },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');

      // timingSafeEqual should NOT be called
      expect(mockTimingSafeEqual).not.toHaveBeenCalled();
    });

    it('should use timing-safe comparison for valid-length secrets', async () => {
      mockTimingSafeEqual.mockReturnValue(true);

      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VALID_SECRET}` },
      });

      (triggerTokenRefresh as any).mockResolvedValue({
        refreshed: 0,
        failed: 0,
        errors: [],
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      // timingSafeEqual should be called with matching-length buffers
      expect(mockTimingSafeEqual).toHaveBeenCalled();
    });

    it('should reject mismatched secrets after timing-safe comparison', async () => {
      mockTimingSafeEqual.mockReturnValue(false);

      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VALID_SECRET}` }, // Same length but wrong value
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
      expect(mockTimingSafeEqual).toHaveBeenCalled();
    });

    it('should handle timingSafeEqual exceptions gracefully', async () => {
      mockTimingSafeEqual.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VALID_SECRET}` },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Configure rate limiter to deny requests
      mockRateLimiterFn.mockResolvedValueOnce({ allowed: false });

      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VALID_SECRET}` },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toBe('Rate limit exceeded');
    });

    it('should allow requests within rate limit', async () => {
      mockTimingSafeEqual.mockReturnValue(true);
      (triggerTokenRefresh as any).mockResolvedValue({
        refreshed: 1,
        failed: 0,
        errors: [],
      });

      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VALID_SECRET}` },
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Token Refresh Execution', () => {
    beforeEach(() => {
      mockTimingSafeEqual.mockReturnValue(true);
    });

    it('should trigger token refresh and return results', async () => {
      (triggerTokenRefresh as any).mockResolvedValue({
        refreshed: 5,
        failed: 2,
        errors: ['Error 1', 'Error 2'],
      });

      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VALID_SECRET}` },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.refreshed).toBe(5);
      expect(data.failed).toBe(2);
      expect(data.errors).toEqual(['Error 1', 'Error 2']);
      expect(data.timestamp).toBeDefined();
    });

    it('should handle successful refresh with no tokens', async () => {
      (triggerTokenRefresh as any).mockResolvedValue({
        refreshed: 0,
        failed: 0,
        errors: [],
      });

      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VALID_SECRET}` },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.refreshed).toBe(0);
      expect(data.failed).toBe(0);
    });

    it('should handle refresh errors', async () => {
      (triggerTokenRefresh as any).mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VALID_SECRET}` },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Database connection failed');
      expect(data.timestamp).toBeDefined();
    });

    it('should handle unknown errors', async () => {
      (triggerTokenRefresh as any).mockRejectedValue('Unknown error');

      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${VALID_SECRET}` },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unknown error');
    });
  });

  describe('HTTP Methods', () => {
    it('should reject GET requests', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data.error).toBe('Method not allowed. Use POST.');
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle empty Authorization value', async () => {
      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should handle Bearer with no space', async () => {
      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: 'Bearer' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should handle malformed Authorization header', async () => {
      const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
        method: 'POST',
        headers: { Authorization: 'Malformed header value' },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('should prevent timing attacks via length-based rejection', async () => {
      const attackSecrets = [
        'a',                          // Too short
        'ab',                         // Too short
        VALID_SECRET.substring(0, 5), // Partial match attempt
        VALID_SECRET + 'x',           // Too long
        VALID_SECRET + 'extra',       // Much too long
      ];

      for (const secret of attackSecrets) {
        const request = new NextRequest('http://localhost/api/oauth/refresh-tokens', {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}` },
        });

        const response = await POST(request);

        // All should be rejected before timingSafeEqual
        expect(response.status).toBe(401);
      }

      // timingSafeEqual should NEVER be called for wrong-length secrets
      expect(mockTimingSafeEqual).not.toHaveBeenCalled();
    });
  });
});
