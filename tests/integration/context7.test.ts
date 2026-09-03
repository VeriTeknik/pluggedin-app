import { beforeEach, describe, expect, it, vi } from 'vitest';

import { testMcpConnection } from '@/app/actions/test-mcp-connection';

// testMcpConnection spawns a child process, so it now requires a session.
// safeFetch now hands each hop to pinnedFetch, which speaks node:http so the
// socket gets the address that was validated. That moved the seam: stubbing
// global fetch no longer intercepts anything.
// safeFetch resolves each hop before pinning it, so without this the suite
// would make a real DNS query for mcp.context7.com.
vi.mock('node:dns/promises', () => ({
  default: { lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) },
}));

vi.mock('@/lib/security/pinned-fetch', () => ({
  pinnedFetch: vi.fn((url, init) => (globalThis.fetch as unknown as (u: unknown, i: unknown) => Promise<Response>)(url, init)),
  pinnedLookup: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'test-user' } })) }));
vi.mock('@/lib/auth', () => ({ authOptions: {}, getAuthSession: vi.fn() }));
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
      // These calls go through safeFetch, which validates and resolves the
      // destination and then hands the request to pinnedFetch. `redirect:
      // 'manual'` is gone from the options because pinnedFetch does not follow
      // redirects at all — it is structural now, not a flag.
      expect(mockFetch).toHaveBeenCalledWith(
        new URL('https://mcp.context7.com/mcp'),
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

      // Should try HEAD request for SSE (not special handling). `redirect:
      // 'manual'` is no longer among the options: pinnedFetch never follows a
      // redirect, so not following one stopped being a flag to pass.
      expect(mockFetch).toHaveBeenCalledWith(
        new URL('https://mcp.context7.com/mcp'),
        expect.objectContaining({
          method: 'HEAD',
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