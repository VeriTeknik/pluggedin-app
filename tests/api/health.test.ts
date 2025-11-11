/**
 * Tests for /api/health endpoint
 * Tests health checks, IP-based access control, and error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, HEAD } from '@/app/api/health/route';

// Mock the database
vi.mock('@/db', () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { db } from '@/db';

describe('/api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    delete process.env.METRICS_ALLOWED_IPS;
    delete process.env.APP_VERSION;
    delete process.env.NODE_ENV;
  });

  describe('GET /api/health', () => {
    describe('Basic health checks', () => {
      it('should return 200 when database is healthy', async () => {
        // Mock successful database query
        vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);

        const request = new NextRequest('http://localhost:12005/api/health');
        const response = await GET(request);

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.status).toBe('healthy');
        expect(data.checks.service).toBe(true);
        expect(data.checks.database).toBe(true);
        expect(data.timestamp).toBeDefined();
      });

      it('should return 503 when database is unhealthy', async () => {
        // Mock database error
        vi.mocked(db.execute).mockRejectedValueOnce(new Error('Connection refused'));

        const request = new NextRequest('http://localhost:12005/api/health');
        const response = await GET(request);

        expect(response.status).toBe(503);

        const data = await response.json();
        expect(data.status).toBe('unhealthy');
        expect(data.checks.service).toBe(true);
        expect(data.checks.database).toBe(false);
      });

      it('should include timestamp in response', async () => {
        vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);

        const request = new NextRequest('http://localhost:12005/api/health');
        const response = await GET(request);

        const data = await response.json();
        expect(data.timestamp).toBeDefined();
        expect(new Date(data.timestamp).getTime()).toBeGreaterThan(0);
      });

      it('should include cache control headers', async () => {
        vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);

        const request = new NextRequest('http://localhost:12005/api/health');
        const response = await GET(request);

        expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
      });

      it('should include duration header', async () => {
        vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);

        const request = new NextRequest('http://localhost:12005/api/health');
        const response = await GET(request);

        const duration = response.headers.get('X-Health-Check-Duration');
        expect(duration).toBeDefined();
        expect(duration).toMatch(/^\d+ms$/);
      });
    });

    describe('IP-based access control', () => {
      it('should hide version/environment from non-whitelisted IPs', async () => {
        vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);
        process.env.APP_VERSION = '2.18.0';
        process.env.NODE_ENV = 'production';

        // Non-whitelisted IP
        const request = new NextRequest('http://localhost:12005/api/health', {
          headers: {
            'x-forwarded-for': '203.0.113.1', // External IP
          },
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.version).toBeUndefined();
        expect(data.environment).toBeUndefined();
        expect(data.uptime).toBeUndefined();
      });

      it('should show version/environment to localhost', async () => {
        vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);
        process.env.APP_VERSION = '2.18.0';
        process.env.NODE_ENV = 'production';

        // Localhost IP
        const request = new NextRequest('http://localhost:12005/api/health', {
          headers: {
            'x-forwarded-for': '127.0.0.1',
          },
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.version).toBe('2.18.0');
        expect(data.environment).toBe('production');
        expect(data.uptime).toBeDefined();
        expect(typeof data.uptime).toBe('number');
      });

      it('should show details to IPv6 localhost', async () => {
        vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);
        process.env.APP_VERSION = '2.18.0';

        const request = new NextRequest('http://localhost:12005/api/health', {
          headers: {
            'x-forwarded-for': '::1',
          },
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.version).toBe('2.18.0');
        expect(data.uptime).toBeDefined();
      });

      it('should show details to Docker network IPs (CIDR)', async () => {
        vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);
        process.env.APP_VERSION = '2.18.0';

        // IP in Docker default network (172.17.0.0/16)
        const request = new NextRequest('http://localhost:12005/api/health', {
          headers: {
            'x-forwarded-for': '172.17.0.2',
          },
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.version).toBe('2.18.0');
        expect(data.uptime).toBeDefined();
      });

      it('should show details to custom whitelisted IPs', async () => {
        vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);
        process.env.METRICS_ALLOWED_IPS = '127.0.0.1,::1,185.96.168.253';
        process.env.APP_VERSION = '2.18.0';

        // Custom whitelisted IP
        const request = new NextRequest('http://localhost:12005/api/health', {
          headers: {
            'x-forwarded-for': '185.96.168.253',
          },
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.version).toBe('2.18.0');
        expect(data.uptime).toBeDefined();
      });

      it('should handle x-real-ip header', async () => {
        vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);
        process.env.APP_VERSION = '2.18.0';

        const request = new NextRequest('http://localhost:12005/api/health', {
          headers: {
            'x-real-ip': '127.0.0.1',
          },
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.version).toBe('2.18.0');
      });

      it('should handle multiple IPs in x-forwarded-for (use first)', async () => {
        vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);
        process.env.APP_VERSION = '2.18.0';

        // Multiple IPs - should use the first one (client IP)
        const request = new NextRequest('http://localhost:12005/api/health', {
          headers: {
            'x-forwarded-for': '127.0.0.1, 10.0.0.1, 10.0.0.2',
          },
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.version).toBe('2.18.0');
      });
    });

    describe('Environment variable handling', () => {
      it('should use default version when APP_VERSION not set', async () => {
        vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);
        delete process.env.APP_VERSION;

        const request = new NextRequest('http://localhost:12005/api/health', {
          headers: { 'x-forwarded-for': '127.0.0.1' },
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.version).toBe('2.18.0'); // Default version
      });

      it('should use custom APP_VERSION when set', async () => {
        vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);
        process.env.APP_VERSION = '3.0.0';

        const request = new NextRequest('http://localhost:12005/api/health', {
          headers: { 'x-forwarded-for': '127.0.0.1' },
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.version).toBe('3.0.0');
      });

      it('should use default environment when NODE_ENV not set', async () => {
        vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);
        delete process.env.NODE_ENV;

        const request = new NextRequest('http://localhost:12005/api/health', {
          headers: { 'x-forwarded-for': '127.0.0.1' },
        });

        const response = await GET(request);
        const data = await response.json();

        expect(data.environment).toBe('development'); // Default
      });
    });

    describe('Error handling and security', () => {
      it('should not leak database error details', async () => {
        // Mock database error with sensitive info
        vi.mocked(db.execute).mockRejectedValueOnce(
          new Error('Connection refused to postgresql://user:pass@host:5432/db')
        );

        const request = new NextRequest('http://localhost:12005/api/health');
        const response = await GET(request);

        expect(response.status).toBe(503);
        const data = await response.json();

        // Should not contain sensitive connection details
        const responseStr = JSON.stringify(data);
        expect(responseStr).not.toContain('postgresql://');
        expect(responseStr).not.toContain('user:pass');
      });

      it('should handle non-Error exceptions', async () => {
        // Mock non-Error exception
        vi.mocked(db.execute).mockRejectedValueOnce('String error');

        const request = new NextRequest('http://localhost:12005/api/health');
        const response = await GET(request);

        expect(response.status).toBe(503);
        const data = await response.json();
        expect(data.status).toBe('unhealthy');
      });
    });
  });

  describe('HEAD /api/health', () => {
    it('should return 200 when database is healthy', async () => {
      vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);

      const response = await HEAD();

      expect(response.status).toBe(200);
      expect(response.body).toBeNull();
    });

    it('should return 503 when database is unhealthy', async () => {
      vi.mocked(db.execute).mockRejectedValueOnce(new Error('Connection refused'));

      const response = await HEAD();

      expect(response.status).toBe(503);
      expect(response.body).toBeNull();
    });

    it('should include cache control headers', async () => {
      vi.mocked(db.execute).mockResolvedValueOnce([{ health_check: 1 }] as any);

      const response = await HEAD();

      expect(response.headers.get('Cache-Control')).toBe('no-cache, no-store, must-revalidate');
    });

    it('should not leak error details in HEAD request', async () => {
      vi.mocked(db.execute).mockRejectedValueOnce(
        new Error('Connection refused to postgresql://user:pass@host:5432/db')
      );

      const response = await HEAD();

      expect(response.status).toBe(503);
      expect(response.body).toBeNull();
    });
  });
});
