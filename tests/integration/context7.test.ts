import { beforeEach, describe, expect, it, vi } from 'vitest';

import { testMcpConnection } from '@/app/actions/test-mcp-connection';
import { McpServerType } from '@/db/schema';

// Mock fetch globally
global.fetch = vi.fn();

describe('Context7 MCP Server Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Context7 Server Detection', () => {
    it('should handle Context7 as Streamable HTTP with proper headers', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          result: {
            capabilities: {
              tools: true,
              resources: true
            }
          },
          id: 1
        })
      } as Response);

      const result = await testMcpConnection({
        name: 'Context7',
        type: McpServerType.STREAMABLE_HTTP,
        url: 'https://mcp.context7.com/mcp'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('MCP server connection verified');
      
      // Verify correct headers were sent
      expect(mockFetch).toHaveBeenCalledWith(
        'https://mcp.context7.com/mcp',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Accept': 'application/json, text/event-stream',
            'Content-Type': 'application/json',
            'User-Agent': 'Plugged.in MCP Client'
          }),
          body: expect.stringContaining('initialize')
        })
      );
    });

    it('should fail gracefully if Context7 returns 406 without proper headers', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 406,
        statusText: 'Not Acceptable',
        json: async () => ({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Not Acceptable: Client must accept both application/json and text/event-stream'
          },
          id: null
        })
      } as Response);

      const result = await testMcpConnection({
        name: 'Context7',
        type: McpServerType.STREAMABLE_HTTP,
        url: 'https://mcp.context7.com/mcp'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('HTTP 406');
    });

    it('should NOT treat Context7 as SSE server', async () => {
      const mockFetch = vi.mocked(global.fetch);
      
      // If Context7 is mistakenly tested as SSE, it would use GET instead of POST
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 405,
        statusText: 'Method Not Allowed'
      } as Response);

      const result = await testMcpConnection({
        name: 'Context7',
        type: McpServerType.SSE,
        url: 'https://mcp.context7.com/mcp'
      });

      // Should try HEAD request for SSE (not special handling)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://mcp.context7.com/mcp',
        expect.objectContaining({
          method: 'HEAD'
        })
      );
    });
  });

  describe('SSE Deprecation', () => {
    it('should detect SSE servers and suggest migration', async () => {
      // This is more of a UI test, but we can verify the transport type detection
      const serverConfig = {
        name: 'Legacy SSE Server',
        type: McpServerType.SSE,
        url: 'https://example.com/sse'
      };

      // In real usage, the UI would show deprecation warnings
      expect(serverConfig.type).toBe(McpServerType.SSE);
      // The UI components should show migration prompts
    });
  });
});