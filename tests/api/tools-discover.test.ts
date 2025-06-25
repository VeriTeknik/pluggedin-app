import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticateApiKey } from '@/app/api/auth';
import { POST as discoverHandler } from '@/app/api/discover/[...slug]/route';
import { discoverSingleServerTools } from '@/app/actions/discover-mcp-tools';
import { db } from '@/db';
import { McpServerStatus } from '@/db/schema';
import { createMockRequest, createMockAuthResult, createMockMcpServer } from '../utils/mocks';

// Mock dependencies
vi.mock('@/app/api/auth');
vi.mock('@/db');
vi.mock('@/app/actions/discover-mcp-tools');

const mockedAuthenticateApiKey = vi.mocked(authenticateApiKey);
const mockedDb = vi.mocked(db);
const mockedDiscoverSingleServerTools = vi.mocked(discoverSingleServerTools);

describe('Tools Discovery API (/api/discover)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    mockedDb.select = vi.fn().mockReturnThis();
    mockedDb.from = vi.fn().mockReturnThis();
    mockedDb.where = vi.fn().mockReturnThis();
    mockedDb.query = {
      mcpServersTable: {
        findFirst: vi.fn(),
      },
    } as any;

    // Default successful authentication
    mockedAuthenticateApiKey.mockResolvedValue(createMockAuthResult());
    
    // Default discovery success
    mockedDiscoverSingleServerTools.mockResolvedValue({
      tools: 5,
      prompts: 3,
      resources: 2,
    });
  });

  describe('POST /api/discover/all', () => {
    it('should discover all active servers for authenticated user', async () => {
      const mockServers = [
        { uuid: 'server-1', name: 'Server 1' },
        { uuid: 'server-2', name: 'Server 2' },
      ];
      
      mockedDb.where.mockResolvedValueOnce(mockServers);

      const request = createMockRequest({
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key' },
      });

      const response = await discoverHandler(request, {
        params: Promise.resolve({ slug: ['all'] }),
      });
      
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.message).toContain('all active servers');
      expect(mockedDiscoverSingleServerTools).toHaveBeenCalledTimes(2);
      expect(mockedDiscoverSingleServerTools).toHaveBeenCalledWith('test-profile-uuid', 'server-1');
      expect(mockedDiscoverSingleServerTools).toHaveBeenCalledWith('test-profile-uuid', 'server-2');
    });

    it('should return message when no active servers found', async () => {
      mockedDb.where.mockResolvedValueOnce([]);

      const request = createMockRequest({
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key' },
      });

      const response = await discoverHandler(request, {
        params: Promise.resolve({ slug: ['all'] }),
      });
      
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.message).toContain('No active servers found');
      expect(mockedDiscoverSingleServerTools).not.toHaveBeenCalled();
    });

    it('should only discover active servers', async () => {
      const mockServers = [
        { uuid: 'server-1', name: 'Active Server', status: McpServerStatus.ACTIVE },
        { uuid: 'server-2', name: 'Inactive Server', status: McpServerStatus.INACTIVE },
      ];
      
      // Mock the where clause to filter only active servers
      mockedDb.where.mockResolvedValueOnce([mockServers[0]]);

      const request = createMockRequest({
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key' },
      });

      const response = await discoverHandler(request, {
        params: Promise.resolve({ slug: ['all'] }),
      });
      
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(mockedDiscoverSingleServerTools).toHaveBeenCalledTimes(1);
      expect(mockedDiscoverSingleServerTools).toHaveBeenCalledWith('test-profile-uuid', 'server-1');
    });
  });

  describe('POST /api/discover/{uuid}', () => {
    it('should discover specific server by UUID', async () => {
      const serverUuid = '550e8400-e29b-41d4-a716-446655440000';
      const mockServer = {
        uuid: serverUuid,
        name: 'Test Server',
        status: McpServerStatus.ACTIVE,
      };
      
      mockedDb.query.mcpServersTable.findFirst.mockResolvedValueOnce(mockServer);

      const request = createMockRequest({
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key' },
      });

      const response = await discoverHandler(request, {
        params: Promise.resolve({ slug: [serverUuid] }),
      });
      
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.message).toContain('Test Server');
      expect(mockedDiscoverSingleServerTools).toHaveBeenCalledWith('test-profile-uuid', serverUuid);
    });

    it('should return 404 for non-existent server UUID', async () => {
      const serverUuid = '550e8400-e29b-41d4-a716-446655440000';
      
      mockedDb.query.mcpServersTable.findFirst.mockResolvedValueOnce(null);

      const request = createMockRequest({
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key' },
      });

      const response = await discoverHandler(request, {
        params: Promise.resolve({ slug: [serverUuid] }),
      });
      
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error).toContain('not found');
      expect(mockedDiscoverSingleServerTools).not.toHaveBeenCalled();
    });

    it('should skip discovery for inactive server', async () => {
      const serverUuid = '550e8400-e29b-41d4-a716-446655440000';
      const mockServer = {
        uuid: serverUuid,
        name: 'Inactive Server',
        status: McpServerStatus.INACTIVE,
      };
      
      mockedDb.query.mcpServersTable.findFirst.mockResolvedValueOnce(mockServer);

      const request = createMockRequest({
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key' },
      });

      const response = await discoverHandler(request, {
        params: Promise.resolve({ slug: [serverUuid] }),
      });
      
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.message).toContain('is not active');
      expect(mockedDiscoverSingleServerTools).not.toHaveBeenCalled();
    });
  });

  describe('Input Validation', () => {
    it('should return 400 for invalid discovery target', async () => {
      const request = createMockRequest({
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key' },
      });

      const response = await discoverHandler(request, {
        params: Promise.resolve({ slug: ['invalid-target'] }),
      });
      
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Invalid discovery target');
    });

    it('should return 400 for malformed UUID', async () => {
      const request = createMockRequest({
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key' },
      });

      const response = await discoverHandler(request, {
        params: Promise.resolve({ slug: ['not-a-valid-uuid'] }),
      });
      
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain('Invalid discovery target');
    });

    it('should accept valid UUID formats', async () => {
      const validUuids = [
        '550e8400-e29b-41d4-a716-446655440000',
        '00000000-0000-0000-0000-000000000000',
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
      ];

      for (const uuid of validUuids) {
        mockedDb.query.mcpServersTable.findFirst.mockResolvedValueOnce({
          uuid,
          name: 'Test Server',
          status: McpServerStatus.ACTIVE,
        });

        const request = createMockRequest({
          method: 'POST',
          headers: { Authorization: 'Bearer test-api-key' },
        });

        const response = await discoverHandler(request, {
          params: Promise.resolve({ slug: [uuid] }),
        });

        expect(response.status).toBe(200);
      }
    });
  });

  describe('Authentication', () => {
    it('should return 401 for unauthenticated requests', async () => {
      mockedAuthenticateApiKey.mockResolvedValueOnce({
        error: new Response(
          JSON.stringify({ error: 'Authorization header with Bearer token is required' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        ),
      });

      const request = createMockRequest({
        method: 'POST',
      });

      const response = await discoverHandler(request, {
        params: Promise.resolve({ slug: ['all'] }),
      });

      expect(response.status).toBe(401);
    });

    it('should return 401 for invalid API key', async () => {
      mockedAuthenticateApiKey.mockResolvedValueOnce({
        error: new Response(
          JSON.stringify({ error: 'Invalid API key' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        ),
      });

      const request = createMockRequest({
        method: 'POST',
        headers: { Authorization: 'Bearer invalid-key' },
      });

      const response = await discoverHandler(request, {
        params: Promise.resolve({ slug: ['all'] }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Error Handling', () => {
    it('should handle discovery action errors gracefully', async () => {
      const mockServers = [
        { uuid: 'server-1', name: 'Server 1' },
      ];
      
      mockedDb.where.mockResolvedValueOnce(mockServers);
      mockedDiscoverSingleServerTools.mockRejectedValueOnce(new Error('Discovery failed'));

      const request = createMockRequest({
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key' },
      });

      const response = await discoverHandler(request, {
        params: Promise.resolve({ slug: ['all'] }),
      });
      
      const json = await response.json();

      // Should still return success as discovery is async
      expect(response.status).toBe(200);
      expect(json.message).toContain('Discovery process initiated');
    });

    it('should handle database errors', async () => {
      mockedDb.select.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const request = createMockRequest({
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key' },
      });

      const response = await discoverHandler(request, {
        params: Promise.resolve({ slug: ['all'] }),
      });
      
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error).toContain('Internal Server Error');
      expect(json.details).toContain('Database connection failed');
    });
  });

  describe('Async Behavior', () => {
    it('should return immediately without waiting for discovery to complete', async () => {
      const mockServers = [
        { uuid: 'server-1', name: 'Server 1' },
        { uuid: 'server-2', name: 'Server 2' },
        { uuid: 'server-3', name: 'Server 3' },
      ];
      
      mockedDb.where.mockResolvedValueOnce(mockServers);
      
      // Make discovery take a long time
      mockedDiscoverSingleServerTools.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ tools: 1, prompts: 1, resources: 1 }), 5000))
      );

      const startTime = Date.now();
      
      const request = createMockRequest({
        method: 'POST',
        headers: { Authorization: 'Bearer test-api-key' },
      });

      const response = await discoverHandler(request, {
        params: Promise.resolve({ slug: ['all'] }),
      });
      
      const endTime = Date.now();
      const elapsed = endTime - startTime;

      expect(response.status).toBe(200);
      expect(elapsed).toBeLessThan(1000); // Should return quickly, not wait 5 seconds
      expect(mockedDiscoverSingleServerTools).toHaveBeenCalledTimes(3);
    });
  });
});