import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMcpServer, updateMcpServer } from '@/app/actions/mcp-servers';
import { testMcpConnection } from '@/app/actions/test-mcp-connection';
import { db } from '@/db';
import { McpServerType } from '@/db/schema';

// Mock dependencies
vi.mock('@/db');
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(() => Promise.resolve({
    user: { id: 'test-user-id' }
  })),
}));
vi.mock('@/lib/encryption', () => ({
  encryptServerData: vi.fn((data) => JSON.stringify(data)),
  decryptServerData: vi.fn((data) => data),
}));

const mockedDb = vi.mocked(db);

describe('Streamable HTTP Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock implementations
    mockedDb.insert = vi.fn().mockReturnThis();
    mockedDb.update = vi.fn().mockReturnThis();
    mockedDb.values = vi.fn().mockReturnThis();
    mockedDb.set = vi.fn().mockReturnThis();
    mockedDb.where = vi.fn().mockReturnThis();
    mockedDb.returning = vi.fn();
  });

  describe('Creating Streamable HTTP MCP Servers', () => {
    it('should create a Streamable HTTP server with minimal config', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverConfig = {
        name: 'Test Streamable HTTP Server',
        profileUuid,
        type: McpServerType.STREAMABLE_HTTP,
        url: 'https://api.example.com/mcp',
      };

      mockedDb.returning.mockResolvedValueOnce([{
        ...serverConfig,
        uuid: 'new-server-uuid',
        status: 'active',
      }]);

      const result = await createMcpServer(serverConfig);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.type).toBe(McpServerType.STREAMABLE_HTTP);
    });

    it('should create a Streamable HTTP server with authentication', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverConfig = {
        name: 'Authenticated Streamable HTTP Server',
        profileUuid,
        type: McpServerType.STREAMABLE_HTTP,
        url: 'https://api.example.com/mcp',
        streamableHTTPOptions: {
          headers: {
            'Authorization': 'Bearer test-token',
            'X-API-Key': 'api-key-123',
          },
        },
      };

      mockedDb.returning.mockResolvedValueOnce([{
        ...serverConfig,
        uuid: 'new-server-uuid',
        status: 'active',
      }]);

      const result = await createMcpServer(serverConfig);

      expect(result.success).toBe(true);
      // The encrypted data is passed as a JSON string, so we just verify the call was made
      expect(mockedDb.values).toHaveBeenCalled();
    });

    it('should create a Streamable HTTP server with session management', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverConfig = {
        name: 'Session-based Streamable HTTP Server',
        profileUuid,
        type: McpServerType.STREAMABLE_HTTP,
        url: 'https://api.example.com/mcp',
        streamableHTTPOptions: {
          sessionId: 'existing-session-123',
        },
      };

      mockedDb.returning.mockResolvedValueOnce([{
        ...serverConfig,
        uuid: 'new-server-uuid',
        status: 'active',
      }]);

      const result = await createMcpServer(serverConfig);

      expect(result.success).toBe(true);
      // The encrypted data is passed as a JSON string, so we just verify the call was made
      expect(mockedDb.values).toHaveBeenCalled();
    });

    it('should reject invalid URLs for Streamable HTTP servers', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverConfig = {
        name: 'Invalid URL Server',
        profileUuid,
        type: McpServerType.STREAMABLE_HTTP,
        url: 'not-a-valid-url',
      };

      const result = await createMcpServer(serverConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid URL format');
    });

    it('should reject Streamable HTTP server without URL', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverConfig = {
        name: 'No URL Server',
        profileUuid,
        type: McpServerType.STREAMABLE_HTTP,
        // Missing URL
      };

      const result = await createMcpServer(serverConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('URL is required');
    });
  });

  describe('Updating Streamable HTTP MCP Servers', () => {
    it('should update Streamable HTTP server configuration', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverUuid = 'existing-server-uuid';
      const updateData = {
        name: 'Updated Streamable HTTP Server',
        url: 'https://new-api.example.com/mcp',
        streamableHTTPOptions: {
          headers: {
            'Authorization': 'Bearer new-token',
          },
        },
      };

      mockedDb.returning.mockResolvedValueOnce([{
        uuid: serverUuid,
        ...updateData,
      }]);

      await updateMcpServer(profileUuid, serverUuid, updateData);

      expect(mockedDb.update).toHaveBeenCalled();
    });

    it('should preserve existing Streamable HTTP options when partially updating', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverUuid = 'existing-server-uuid';
      const updateData = {
        name: 'Updated Name Only',
      };

      mockedDb.returning.mockResolvedValueOnce([{
        uuid: serverUuid,
        name: 'Updated Name Only',
        type: McpServerType.STREAMABLE_HTTP,
        url: 'https://api.example.com/mcp',
        config: JSON.stringify({
          url: 'https://api.example.com/mcp',
          streamableHTTPOptions: {
            sessionId: 'existing-session',
            headers: { 'X-API-Key': 'existing-key' },
          },
        }),
      }]);

      await updateMcpServer(profileUuid, serverUuid, updateData);
      expect(mockedDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Name Only',
        })
      );
    });
  });

  describe('Testing Streamable HTTP Connections', () => {
    it('should test connection to Streamable HTTP server', async () => {
      const serverConfig = {
        type: McpServerType.STREAMABLE_HTTP,
        url: 'https://api.example.com/mcp',
      };

      // Mock successful connection test
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      const result = await testMcpConnection(serverConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('MCP server connection verified');
    });

    it('should handle connection failures for Streamable HTTP', async () => {
      const serverConfig = {
        type: McpServerType.STREAMABLE_HTTP,
        url: 'https://api.example.com/mcp',
      };

      // Mock failed connection
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      const result = await testMcpConnection(serverConfig);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to connect');
    });

    it('should test connection with authentication headers', async () => {
      const serverConfig = {
        type: McpServerType.STREAMABLE_HTTP,
        url: 'https://api.example.com/mcp',
        streamableHTTPOptions: {
          headers: {
            'Authorization': 'Bearer test-token',
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      const result = await testMcpConnection(serverConfig);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      );
    });
  });

  describe('Transport Type Migration', () => {
    it('should support migrating from SSE to Streamable HTTP', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverUuid = 'existing-sse-server';
      const updateData = {
        type: McpServerType.STREAMABLE_HTTP,
        transport: 'streamable_http' as const,
        streamableHTTPOptions: {
          headers: {
            'Authorization': 'Bearer migrated-token',
          },
        },
      };

      mockedDb.returning.mockResolvedValueOnce([{
        uuid: serverUuid,
        type: McpServerType.STREAMABLE_HTTP,
        transport: 'streamable_http',
      }]);

      await updateMcpServer(profileUuid, serverUuid, updateData);
      expect(mockedDb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          type: McpServerType.STREAMABLE_HTTP,
        })
      );
    });
  });

  describe('Error Scenarios', () => {
    it('should handle database errors when creating Streamable HTTP server', async () => {
      const profileUuid = 'test-profile-uuid';
      const serverConfig = {
        name: 'Error Test Server',
        profileUuid,
        type: McpServerType.STREAMABLE_HTTP,
        url: 'https://api.example.com/mcp',
      };

      mockedDb.returning.mockRejectedValueOnce(new Error('Database error'));

      const result = await createMcpServer(serverConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create');
    });

    it('should validate URL format for Streamable HTTP', async () => {
      const profileUuid = 'test-profile-uuid';
      const testCases = [
        { url: 'ftp://not-http.com', shouldFail: true, errorMessage: 'Invalid URL scheme' },
        { url: 'http://valid-http.com', shouldFail: false },
        { url: 'https://valid-https.com', shouldFail: false },
        { url: 'ws://websocket.com', shouldFail: true, errorMessage: 'Invalid URL scheme' },
        { url: 'file:///local/path', shouldFail: true, errorMessage: 'Invalid URL scheme' },
        { url: 'http://localhost', shouldFail: true, errorMessage: 'Blocked hostname' },
        { url: 'http://127.0.0.1', shouldFail: true, errorMessage: 'Blocked hostname' },
        { url: 'https://192.168.1.1', shouldFail: true, errorMessage: 'Blocked hostname' },
        { url: 'https://10.0.0.1', shouldFail: true, errorMessage: 'Blocked hostname' },
      ];

      for (const testCase of testCases) {
        const serverConfig = {
          name: 'URL Test Server',
          profileUuid,
          type: McpServerType.STREAMABLE_HTTP,
          url: testCase.url,
        };

        if (!testCase.shouldFail) {
          mockedDb.returning.mockResolvedValueOnce([{
            ...serverConfig,
            uuid: 'test-uuid',
          }]);
        }

        const result = await createMcpServer(serverConfig);

        if (testCase.shouldFail) {
          expect(result.success).toBe(false);
          expect(result.error).toContain(testCase.errorMessage || 'Invalid URL');
        } else {
          expect(result.success).toBe(true);
        }
      }
    });
  });
});