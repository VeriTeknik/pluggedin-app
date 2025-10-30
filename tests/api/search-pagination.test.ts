import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/service/search/route';
import { registryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';
import type { ExtendedServer } from '@/lib/registry/pluggedin-registry-vp-client';

// Mock dependencies
vi.mock('@/lib/registry/pluggedin-registry-vp-client', () => ({
  registryVPClient: {
    getAllServersWithStats: vi.fn(),
  },
}));

vi.mock('@/lib/rate-limiter', () => ({
  RateLimiters: {
    api: vi.fn().mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60000,
    }),
  },
}));

describe('Search API - Pagination with Total Count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockServers = (count: number): ExtendedServer[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `test/server${i + 1}`,
      name: `Test Server ${i + 1}`,
      description: `Test description ${i + 1}`,
      installation_count: 100 - i,
      rating: 4.5 - i * 0.1,
      rating_count: 10 - i,
      packages: [
        {
          registry_name: 'npm',
          name: `test-package-${i + 1}`,
          version: '1.0.0',
        },
      ],
    }));
  };

  describe('Registry-only search with pagination', () => {
    it('should return correct total count from VP Client', async () => {
      const mockServers = createMockServers(12);

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 738,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=npm&offset=0&pageSize=12'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.total).toBe(738); // Should use total_count from API
      expect(data.offset).toBe(0);
      expect(data.pageSize).toBe(12);
      expect(Object.keys(data.results)).toHaveLength(12);
      expect(data.hasMore).toBe(true);
    });

    it('should handle pagination at different offsets', async () => {
      const mockServers = createMockServers(12);

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 738,
        limit: 100,
        offset: 24,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=24&pageSize=12'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.total).toBe(738);
      expect(data.offset).toBe(24);
      expect(data.pageSize).toBe(12);
      expect(data.hasMore).toBe(true); // 24 + 12 < 738
    });

    it('should calculate hasMore correctly at the end', async () => {
      const mockServers = createMockServers(10);

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 738,
        limit: 100,
        offset: 728, // Near the end
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=728&pageSize=12'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.total).toBe(738);
      expect(data.offset).toBe(728);
      expect(data.hasMore).toBe(false); // 728 + 12 >= 738
    });

    it('should handle missing total_count gracefully', async () => {
      const mockServers = createMockServers(12);

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        // total_count missing - should fall back to servers.length
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=0&pageSize=12'
      );

      const response = await GET(request);
      const data = await response.json();

      // Should fall back to counting indexed results
      expect(data.total).toBe(12);
      expect(Object.keys(data.results)).toHaveLength(12);
    });

    it('should respect pageSize parameter', async () => {
      const mockServers = createMockServers(50);

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 738,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=0&pageSize=25'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.total).toBe(738);
      expect(data.pageSize).toBe(25);
      expect(Object.keys(data.results).length).toBeLessThanOrEqual(25);
    });

    it('should enforce maximum pageSize limit', async () => {
      const mockServers = createMockServers(50);

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 738,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=0&pageSize=200' // Over limit
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.pageSize).toBe(100); // Should be capped at 100
    });
  });

  describe('Search with filters', () => {
    it('should pass registry filters to VP Client', async () => {
      const mockServers = createMockServers(5);

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 50,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=npm,pypi&offset=0'
      );

      await GET(request);

      expect(registryVPClient.getAllServersWithStats).toHaveBeenCalledWith(
        'REGISTRY',
        expect.objectContaining({
          registry_name: 'npm,pypi',
        })
      );
    });

    it('should handle search query parameter', async () => {
      const mockServers = createMockServers(3);

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 15,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&query=database&offset=0'
      );

      await GET(request);

      expect(registryVPClient.getAllServersWithStats).toHaveBeenCalledWith(
        'REGISTRY',
        expect.objectContaining({
          search: 'database',
        })
      );
    });

    it('should handle sort parameter', async () => {
      const mockServers = createMockServers(10);

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 100,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&sort=rating&offset=0'
      );

      await GET(request);

      expect(registryVPClient.getAllServersWithStats).toHaveBeenCalledWith(
        'REGISTRY',
        expect.objectContaining({
          sort: 'rating_desc',
        })
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle empty results', async () => {
      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: [],
        total_count: 0,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.total).toBe(0);
      expect(Object.keys(data.results)).toHaveLength(0);
      expect(data.hasMore).toBe(false);
    });

    it('should handle offset beyond total', async () => {
      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: [],
        total_count: 100,
        limit: 100,
        offset: 200, // Beyond total
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=200&pageSize=12'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.total).toBe(100);
      expect(data.offset).toBe(200);
      expect(Object.keys(data.results)).toHaveLength(0);
      expect(data.hasMore).toBe(false);
    });

    it('should handle API errors gracefully', async () => {
      (registryVPClient.getAllServersWithStats as any).mockRejectedValueOnce(
        new Error('API error')
      );

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      // searchRegistry catches errors and returns empty results
      // So API returns 200 with empty results instead of throwing
      expect(response.status).toBe(200);
      expect(data.total).toBe(0);
      expect(Object.keys(data.results)).toHaveLength(0);
    });

    it('should validate and sanitize offset parameter', async () => {
      const mockServers = createMockServers(10);

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 100,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=-10' // Negative offset
      );

      const response = await GET(request);
      const data = await response.json();

      expect(data.offset).toBe(0); // Should be sanitized to 0
    });

    it('should handle zero pageSize parameter', async () => {
      const mockServers = createMockServers(10);

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 100,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=0&pageSize=0'
      );

      const response = await GET(request);
      const data = await response.json();

      // Should use default pageSize or minimum value
      expect(data.pageSize).toBeGreaterThan(0);
      expect(response.status).toBe(200);
    });

    it('should handle negative pageSize parameter', async () => {
      const mockServers = createMockServers(10);

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 100,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=0&pageSize=-20'
      );

      const response = await GET(request);
      const data = await response.json();

      // Should sanitize to positive value
      expect(data.pageSize).toBeGreaterThan(0);
      expect(response.status).toBe(200);
    });

    it('should handle inconsistent totalCount from API', async () => {
      const mockServers = createMockServers(50);

      // API says total is 100, but returns 50 servers
      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 100, // Claims 100
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=0&pageSize=12'
      );

      const response = await GET(request);
      const data = await response.json();

      // Should trust API's total_count
      expect(data.total).toBe(100);
      expect(Object.keys(data.results)).toHaveLength(12); // Only showing pageSize
    });

    it('should handle very large pageSize values', async () => {
      const mockServers = createMockServers(50);

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 50,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=0&pageSize=99999'
      );

      const response = await GET(request);
      const data = await response.json();

      // Should cap at maximum allowed
      expect(data.pageSize).toBeLessThanOrEqual(100);
      expect(response.status).toBe(200);
    });

    it('should handle NaN pageSize parameter', async () => {
      const mockServers = createMockServers(10);

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 100,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=0&pageSize=not-a-number'
      );

      const response = await GET(request);
      const data = await response.json();

      // Should use default pageSize
      expect(data.pageSize).toBeGreaterThan(0);
      expect(response.status).toBe(200);
    });
  });

  describe('Performance considerations', () => {
    it('should handle large result sets efficiently', async () => {
      const mockServers = createMockServers(100);

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 10000,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=0&pageSize=100'
      );

      const startTime = Date.now();
      const response = await GET(request);
      const endTime = Date.now();
      const data = await response.json();

      expect(data.total).toBe(10000);
      expect(Object.keys(data.results)).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in < 1s
    });
  });
});
