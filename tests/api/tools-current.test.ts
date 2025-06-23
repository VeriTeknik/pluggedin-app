import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticateApiKey } from '@/app/api/auth';
import { GET as toolsGetHandler, POST as toolsPostHandler } from '@/app/api/tools/route';
import { db } from '@/db';
import { ToggleStatus } from '@/db/schema';
import { createMockRequest, createMockAuthResult, createMockTool } from '../utils/mocks';

// Mock dependencies
vi.mock('@/app/api/auth');
vi.mock('@/db');

const mockedAuthenticateApiKey = vi.mocked(authenticateApiKey);
const mockedDb = vi.mocked(db);

describe('Tools API (Current Implementation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    mockedDb.select = vi.fn().mockReturnThis();
    mockedDb.insert = vi.fn().mockReturnThis();
    mockedDb.from = vi.fn().mockReturnThis();
    mockedDb.where = vi.fn().mockReturnThis();
    mockedDb.innerJoin = vi.fn().mockReturnThis();
    mockedDb.values = vi.fn().mockReturnThis();
    mockedDb.onConflictDoUpdate = vi.fn().mockReturnThis();
    mockedDb.returning = vi.fn();

    // Default successful authentication
    mockedAuthenticateApiKey.mockResolvedValue(createMockAuthResult());
  });

  describe('GET /api/tools', () => {
    it('should return tools for authenticated user', async () => {
      const mockTools = [
        createMockTool({ name: 'tool1', status: ToggleStatus.ACTIVE }),
        createMockTool({ name: 'tool2', status: ToggleStatus.ACTIVE }),
      ];

      mockedDb.returning.mockResolvedValue(mockTools);

      const request = createMockRequest('GET', undefined, undefined, {
        'Authorization': 'Bearer test-api-key'
      });
      
      const response = await toolsGetHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toEqual(mockTools);
      expect(data.results).toHaveLength(2);
      expect(mockedAuthenticateApiKey).toHaveBeenCalledWith(request);
    });

    it('should filter tools by status', async () => {
      const inactiveTools = [
        createMockTool({ name: 'inactive_tool', status: ToggleStatus.INACTIVE }),
      ];

      mockedDb.returning.mockResolvedValue(inactiveTools);

      const searchParams = new URLSearchParams({ status: ToggleStatus.INACTIVE });
      const request = createMockRequest('GET', undefined, searchParams, {
        'Authorization': 'Bearer test-api-key'
      });
      
      const response = await toolsGetHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toEqual(inactiveTools);
    });

    it('should return 401 for unauthenticated requests', async () => {
      mockedAuthenticateApiKey.mockResolvedValue({
        error: new Response(JSON.stringify({ error: 'Invalid API key' }), { status: 401 })
      } as any);

      const request = createMockRequest('GET');
      const response = await toolsGetHandler(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Invalid API key');
    });

    it('should handle database errors gracefully', async () => {
      mockedDb.returning.mockRejectedValue(new Error('Database connection failed'));

      const request = createMockRequest('GET', undefined, undefined, {
        'Authorization': 'Bearer test-api-key'
      });
      
      const response = await toolsGetHandler(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Internal server error');
    });

    it('should return empty array when no tools exist', async () => {
      mockedDb.returning.mockResolvedValue([]);

      const request = createMockRequest('GET', undefined, undefined, {
        'Authorization': 'Bearer test-api-key'
      });
      
      const response = await toolsGetHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results).toEqual([]);
    });
  });

  describe('POST /api/tools', () => {
    it('should successfully create/update tools', async () => {
      const toolsPayload = {
        tools: [
          {
            name: 'new_tool',
            description: 'A new tool',
            toolSchema: { type: 'object', properties: {} },
            mcp_server_uuid: 'test-server-uuid',
            status: ToggleStatus.ACTIVE,
          },
          {
            name: 'another_tool',
            toolSchema: { type: 'string' },
            mcp_server_uuid: 'test-server-uuid',
            status: ToggleStatus.INACTIVE,
          },
        ]
      };

      // Mock server validation - all servers exist
      mockedDb.returning.mockResolvedValueOnce([
        { uuid: 'test-server-uuid' }
      ]);

      // Mock successful tool creation
      mockedDb.returning.mockResolvedValueOnce(toolsPayload.tools);

      const request = createMockRequest('POST', toolsPayload, undefined, {
        'Authorization': 'Bearer test-api-key'
      });
      
      const response = await toolsPostHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.successCount).toBe(2);
      expect(data.failureCount).toBe(0);
      expect(data.results).toHaveLength(2);
      expect(data.errors).toHaveLength(0);
    });

    it('should filter out tools with invalid server UUIDs', async () => {
      const toolsPayload = {
        tools: [
          {
            name: 'valid_tool',
            toolSchema: {},
            mcp_server_uuid: 'valid-server-uuid',
          },
          {
            name: 'invalid_tool',
            toolSchema: {},
            mcp_server_uuid: 'invalid-server-uuid',
          },
        ]
      };

      // Mock server validation - only one server exists
      mockedDb.returning.mockResolvedValueOnce([
        { uuid: 'valid-server-uuid' }
      ]);

      // Mock successful creation of valid tool only
      mockedDb.returning.mockResolvedValueOnce([toolsPayload.tools[0]]);

      const request = createMockRequest('POST', toolsPayload, undefined, {
        'Authorization': 'Bearer test-api-key'
      });
      
      const response = await toolsPostHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(false); // Partial success
      expect(data.successCount).toBe(1);
      expect(data.failureCount).toBe(1);
      expect(data.results).toHaveLength(1);
      expect(data.errors).toHaveLength(1);
      expect(data.errors[0].error).toContain('Invalid mcp_server_uuid');
    });

    it('should return 400 for empty tools array', async () => {
      const request = createMockRequest('POST', { tools: [] }, undefined, {
        'Authorization': 'Bearer test-api-key'
      });
      
      const response = await toolsPostHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('non-empty array of tools');
    });

    it('should return 400 for missing tools field', async () => {
      const request = createMockRequest('POST', {}, undefined, {
        'Authorization': 'Bearer test-api-key'
      });
      
      const response = await toolsPostHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('non-empty array of tools');
    });

    it('should handle database errors during tool creation', async () => {
      const toolsPayload = {
        tools: [
          {
            name: 'test_tool',
            toolSchema: {},
            mcp_server_uuid: 'test-server-uuid',
          }
        ]
      };

      // Mock server validation succeeds
      mockedDb.returning.mockResolvedValueOnce([
        { uuid: 'test-server-uuid' }
      ]);

      // Mock database error during tool creation
      mockedDb.returning.mockRejectedValueOnce(new Error('Constraint violation'));

      const request = createMockRequest('POST', toolsPayload, undefined, {
        'Authorization': 'Bearer test-api-key'
      });
      
      const response = await toolsPostHandler(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to process tools request');
      expect(data.details).toContain('Database error occurred');
    });

    it('should validate tool schema format', async () => {
      const toolsPayload = {
        tools: [
          {
            name: 'test_tool',
            // Invalid schema - not an object
            toolSchema: 'invalid-schema',
            mcp_server_uuid: 'test-server-uuid',
          }
        ]
      };

      const request = createMockRequest('POST', toolsPayload, undefined, {
        'Authorization': 'Bearer test-api-key'
      });
      
      const response = await toolsPostHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid tool data');
    });

    it('should handle partial failures gracefully', async () => {
      const toolsPayload = {
        tools: [
          {
            name: 'valid_tool',
            toolSchema: { type: 'object' },
            mcp_server_uuid: 'valid-server-uuid',
          },
          {
            name: 'tool_with_invalid_server',
            toolSchema: { type: 'object' },
            mcp_server_uuid: 'invalid-server-uuid',
          },
          {
            // Missing required name field
            toolSchema: { type: 'object' },
            mcp_server_uuid: 'valid-server-uuid',
          } as any,
        ]
      };

      // Mock server validation
      mockedDb.returning.mockResolvedValueOnce([
        { uuid: 'valid-server-uuid' }
      ]);

      // Mock successful creation of only valid tool
      mockedDb.returning.mockResolvedValueOnce([toolsPayload.tools[0]]);

      const request = createMockRequest('POST', toolsPayload, undefined, {
        'Authorization': 'Bearer test-api-key'
      });
      
      const response = await toolsPostHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.successCount).toBe(1);
      expect(data.failureCount).toBe(2);
      expect(data.results).toHaveLength(1);
      expect(data.errors).toHaveLength(2);
    });
  });
});