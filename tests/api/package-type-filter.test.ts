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

describe('Search API - Package Type Filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockNpmServer = (): ExtendedServer => ({
    id: 'test/npm-server',
    name: 'Test NPM Server',
    description: 'NPM package server',
    installation_count: 100,
    rating: 4.5,
    rating_count: 10,
    packages: [
      {
        registry_name: 'npm',
        name: 'test-npm-package',
        version: '1.0.0',
      },
    ],
  });

  const createMockPypiServer = (): ExtendedServer => ({
    id: 'test/pypi-server',
    name: 'Test PyPI Server',
    description: 'Python package server',
    installation_count: 50,
    rating: 4.0,
    rating_count: 5,
    packages: [
      {
        registry_name: 'pypi',
        name: 'test-pypi-package',
        version: '1.0.0',
      },
    ],
  });

  const createMockRemoteServer = (): ExtendedServer => ({
    id: 'test/remote-server',
    name: 'Test Remote Server',
    description: 'Remote SSE server',
    installation_count: 75,
    rating: 4.2,
    rating_count: 8,
    remotes: [
      {
        transport_type: 'sse',
        url: 'https://example.com/mcp',
      },
    ],
  });

  const createMockStreamableHttpServer = (): ExtendedServer => ({
    id: 'test/http-server',
    name: 'Test Streamable HTTP Server',
    description: 'Streamable HTTP server',
    installation_count: 60,
    rating: 4.3,
    rating_count: 7,
    remotes: [
      {
        transport_type: 'streamable-http',
        url: 'https://example.com/mcp/http',
      },
    ],
  });

  describe('Individual package type filters', () => {
    it('should filter by npm package type', async () => {
      const mockServers = [createMockNpmServer()];

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 100,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=npm&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      // Verify VP client was called with correct filter
      expect(registryVPClient.getAllServersWithStats).toHaveBeenCalledWith(
        'REGISTRY',
        expect.objectContaining({
          registry_name: 'npm',
        })
      );

      expect(data.total).toBe(100);
      expect(Object.keys(data.results)).toHaveLength(1);
    });

    it('should filter by pypi package type', async () => {
      const mockServers = [createMockPypiServer()];

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 50,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=pypi&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(registryVPClient.getAllServersWithStats).toHaveBeenCalledWith(
        'REGISTRY',
        expect.objectContaining({
          registry_name: 'pypi',
        })
      );

      expect(data.total).toBe(50);
    });

    it('should filter by remote package type (SSE/HTTP servers)', async () => {
      const mockServers = [createMockRemoteServer(), createMockStreamableHttpServer()];

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 200,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=remote&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(registryVPClient.getAllServersWithStats).toHaveBeenCalledWith(
        'REGISTRY',
        expect.objectContaining({
          registry_name: 'remote',
        })
      );

      // Should return remote servers
      expect(data.total).toBe(200);
      expect(Object.keys(data.results)).toHaveLength(2);
    });

    it('should filter by oci/docker package type', async () => {
      const mockServer: ExtendedServer = {
        id: 'test/docker-server',
        name: 'Test Docker Server',
        description: 'Docker container server',
        installation_count: 30,
        rating: 4.1,
        rating_count: 3,
        packages: [
          {
            registry_name: 'docker',
            name: 'docker.io/test/image:latest',
            version: '1.0.0',
          },
        ],
      };

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: [mockServer],
        total_count: 25,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=oci&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(registryVPClient.getAllServersWithStats).toHaveBeenCalledWith(
        'REGISTRY',
        expect.objectContaining({
          registry_name: 'oci',
        })
      );

      expect(data.total).toBe(25);
    });
  });

  describe('Multiple package type filters', () => {
    it('should filter by multiple package types (npm + pypi)', async () => {
      const mockServers = [createMockNpmServer(), createMockPypiServer()];

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 150,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=npm,pypi&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(registryVPClient.getAllServersWithStats).toHaveBeenCalledWith(
        'REGISTRY',
        expect.objectContaining({
          registry_name: 'npm,pypi',
        })
      );

      expect(data.total).toBe(150);
      expect(Object.keys(data.results)).toHaveLength(2);
    });

    it('should filter by package + remote types (npm + remote)', async () => {
      const mockServers = [createMockNpmServer(), createMockRemoteServer()];

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 300,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=npm,remote&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(registryVPClient.getAllServersWithStats).toHaveBeenCalledWith(
        'REGISTRY',
        expect.objectContaining({
          registry_name: 'npm,remote',
        })
      );

      expect(data.total).toBe(300);
      expect(Object.keys(data.results)).toHaveLength(2);
    });

    it('should filter by all package types', async () => {
      const mockServers = [
        createMockNpmServer(),
        createMockPypiServer(),
        createMockRemoteServer(),
      ];

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: mockServers,
        total_count: 500,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=npm,pypi,remote,oci&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(registryVPClient.getAllServersWithStats).toHaveBeenCalledWith(
        'REGISTRY',
        expect.objectContaining({
          registry_name: 'npm,pypi,remote,oci',
        })
      );

      expect(data.total).toBe(500);
    });
  });

  describe('Package type validation', () => {
    it('should reject invalid package types', async () => {
      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: [],
        total_count: 0,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=invalid-type&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      // Invalid types should be filtered out, resulting in no registry_name filter
      expect(registryVPClient.getAllServersWithStats).toHaveBeenCalledWith(
        'REGISTRY',
        expect.not.objectContaining({
          registry_name: expect.stringContaining('invalid-type'),
        })
      );
    });

    it('should sanitize and validate package type input', async () => {
      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: [],
        total_count: 0,
        limit: 100,
        offset: 0,
      });

      // Try with special characters that should be filtered out
      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=npm;DROP%20TABLE&offset=0'
      );

      const response = await GET(request);

      // Should sanitize and only accept valid registry names
      expect(response.status).toBe(200); // Should not crash
    });

    it('should handle empty package type filter', async () => {
      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: [],
        total_count: 738,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      // Empty filter should return all servers
      expect(data.total).toBe(738);
    });

    it('should handle mixed valid and invalid package types', async () => {
      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: [createMockNpmServer()],
        total_count: 1,
        limit: 100,
        offset: 0,
      });

      // Mix valid (npm, pypi) with invalid (invalid-type, malicious)
      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=npm,invalid-type,pypi,malicious&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      // Should only use valid types
      expect(response.status).toBe(200);
      expect(data.total).toBe(1);
    });

    it('should handle unexpected API format with missing fields', async () => {
      // Simulate API returning malformed data
      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: [{ id: 'test', name: 'Test' }], // Missing required fields
        // Missing total_count
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=npm&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      // Should handle gracefully
      expect(response.status).toBe(200);
      expect(data.total).toBeGreaterThanOrEqual(0);
    });

    it('should handle API errors gracefully', async () => {
      // Simulate VP Client throwing error
      (registryVPClient.getAllServersWithStats as any).mockRejectedValueOnce(
        new Error('Network error')
      );

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=npm&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      // Should return 200 with empty results instead of crashing
      expect(response.status).toBe(200);
      expect(data.total).toBe(0);
      expect(Object.keys(data.results)).toHaveLength(0);
    });

    it('should handle null or undefined packageRegistry parameter', async () => {
      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: [],
        total_count: 738,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      // Should handle missing parameter gracefully
      expect(response.status).toBe(200);
      expect(data.total).toBe(738);
    });
  });

  describe('Remote server identification', () => {
    it('should correctly identify SSE remote servers', async () => {
      const mockServer = createMockRemoteServer();

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: [mockServer],
        total_count: 1,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=remote&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      const results = Object.values(data.results);
      expect(results).toHaveLength(1);

      const server = results[0] as any;
      expect(server.url).toBeDefined();
      expect(server.url).toContain('example.com');
    });

    it('should correctly identify streamable-http remote servers', async () => {
      const mockServer = createMockStreamableHttpServer();

      (registryVPClient.getAllServersWithStats as any).mockResolvedValueOnce({
        servers: [mockServer],
        total_count: 1,
        limit: 100,
        offset: 0,
      });

      const request = new NextRequest(
        'http://localhost:3000/api/service/search?source=REGISTRY&packageRegistry=remote&offset=0'
      );

      const response = await GET(request);
      const data = await response.json();

      const results = Object.values(data.results);
      expect(results).toHaveLength(1);

      const server = results[0] as any;
      expect(server.url).toBeDefined();
      expect(server.url).toContain('http');
    });
  });
});
