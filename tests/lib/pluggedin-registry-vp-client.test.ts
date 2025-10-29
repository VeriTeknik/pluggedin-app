import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluggedinRegistryVPClient } from '@/lib/registry/pluggedin-registry-vp-client';
import { McpServerSource } from '@/db/schema';

// Mock fetch globally
global.fetch = vi.fn();

describe('PluggedinRegistryVPClient - Pagination Metadata', () => {
  let client: PluggedinRegistryVPClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new PluggedinRegistryVPClient('https://registry.plugged.in/v0');
  });

  describe('getAllServersWithStats', () => {
    it('should return pagination metadata from enhanced endpoint', async () => {
      const mockResponse = {
        servers: [
          {
            id: 'test/server1',
            name: 'Test Server 1',
            description: 'Test description',
            installation_count: 100,
            rating: 4.5,
            rating_count: 10,
          },
          {
            id: 'test/server2',
            name: 'Test Server 2',
            description: 'Test description 2',
            installation_count: 50,
            rating: 4.0,
            rating_count: 5,
          },
        ],
        total_count: 738,
        limit: 100,
        offset: 0,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getAllServersWithStats(
        McpServerSource.REGISTRY,
        { registry_name: 'npm' }
      );

      expect(result).toHaveProperty('servers');
      expect(result).toHaveProperty('total_count', 738);
      expect(result).toHaveProperty('limit', 100);
      expect(result).toHaveProperty('offset', 0);
      expect(result.servers).toHaveLength(2);
    });

    it('should handle missing total_count gracefully', async () => {
      const mockResponse = {
        servers: [
          {
            id: 'test/server1',
            name: 'Test Server 1',
            description: 'Test description',
            installation_count: 100,
            rating: 4.5,
            rating_count: 10,
          },
        ],
        // total_count missing
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getAllServersWithStats(
        McpServerSource.REGISTRY
      );

      expect(result).toHaveProperty('servers');
      expect(result.total_count).toBeUndefined();
      expect(result.servers).toHaveLength(1);
    });

    it('should use fallback when enhanced endpoint fails', async () => {
      // First call fails (enhanced endpoint)
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      // Subsequent calls succeed (fallback pagination)
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          servers: [
            {
              id: 'test/server1',
              name: 'Test Server 1',
              description: 'Fallback test',
              installation_count: 10,
              rating: 3.5,
              rating_count: 2,
            },
          ],
        }),
      });

      const result = await client.getAllServersWithStats(
        McpServerSource.REGISTRY
      );

      expect(result).toHaveProperty('servers');
      expect(result.servers).toHaveLength(1);
      // Fallback returns total_count based on fetched results
      expect(result.total_count).toBe(1);
    });

    it('should pass filters to enhanced endpoint correctly', async () => {
      const mockResponse = {
        servers: [],
        total_count: 0,
        limit: 100,
        offset: 0,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await client.getAllServersWithStats(McpServerSource.REGISTRY, {
        registry_name: 'npm',
        sort: 'rating_desc',
        search: 'test query',
      });

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('registry_types=npm');
      expect(callUrl).toContain('sort=rating_desc');
      expect(callUrl).toContain('search=test+query');
    });

    it('should handle empty server list', async () => {
      const mockResponse = {
        servers: [],
        total_count: 0,
        limit: 100,
        offset: 0,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getAllServersWithStats(
        McpServerSource.REGISTRY
      );

      expect(result.servers).toHaveLength(0);
      expect(result.total_count).toBe(0);
    });

    it('should preserve all metadata fields from API', async () => {
      const mockResponse = {
        servers: [
          {
            id: 'test/server',
            name: 'Test Server',
            description: 'Test',
            installation_count: 100,
            rating: 4.5,
            rating_count: 10,
          },
        ],
        total_count: 500,
        limit: 50,
        offset: 100,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getAllServersWithStats(
        McpServerSource.REGISTRY
      );

      expect(result.total_count).toBe(500);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(100);
    });
  });

  describe('getServersWithStats', () => {
    it('should return servers without pagination metadata', async () => {
      const mockResponse = {
        servers: [
          {
            id: 'test/server1',
            name: 'Test Server 1',
            description: 'Test description',
            installation_count: 100,
            rating: 4.5,
            rating_count: 10,
          },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getServersWithStats(30);

      expect(result).toHaveProperty('servers');
      expect(result.servers).toHaveLength(1);
    });
  });

  describe('Error handling', () => {
    it('should handle network errors gracefully', async () => {
      (global.fetch as any).mockRejectedValueOnce(
        new Error('Network error')
      );

      // Fallback should also fail
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await client.getAllServersWithStats(
        McpServerSource.REGISTRY
      );

      // Should return fallback empty result
      expect(result.servers).toHaveLength(0);
    });

    it('should handle malformed JSON response gracefully', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      // Mock fallback to also fail
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ servers: [] }),
      });

      // Should fall back and return empty result instead of throwing
      const result = await client.getAllServersWithStats(
        McpServerSource.REGISTRY
      );

      expect(result.servers).toHaveLength(0);
    });
  });
});
