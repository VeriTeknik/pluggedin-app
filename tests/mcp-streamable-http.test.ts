import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach,beforeEach, describe, expect, it } from 'vitest';

import { MCPAuth } from '@/lib/mcp/auth';
import { MCPErrorHandler } from '@/lib/mcp/error-handler';
import { MCPHealthMonitor } from '@/lib/mcp/health-monitor';
import { MCPSessionManager } from '@/lib/mcp/session-manager';
import { handleStreamableHTTPRequest, StreamableHTTPOptions } from '@/lib/mcp/streamable-http/server';
import { ToolRegistry } from '@/lib/mcp/tool-registry';

// Mock the MCP SDK Server
const mockServer = {
  request: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
} as any as Server;

// Mock dependencies
vi.mock('@/lib/mcp/auth');
vi.mock('@/lib/mcp/tool-registry');
vi.mock('@/lib/mcp/session-manager');
vi.mock('@/lib/mcp/health-monitor');
vi.mock('@/lib/mcp/error-handler');

describe('Streamable HTTP Server', () => {
  let options: StreamableHTTPOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    options = {
      requireApiAuth: true,
      stateless: false,
      allowedTools: ['test_tool'],
      blockedTools: ['blocked_tool'],
      allowedServers: ['test_server'],
      blockedServers: ['blocked_server'],
    };

    // Setup default mock responses
    vi.mocked(MCPAuth.getInstance).mockReturnValue({
      authenticateRequest: vi.fn().mockResolvedValue({
        success: true,
        profileUuid: 'test-profile-uuid',
      }),
    } as any);

    vi.mocked(ToolRegistry.getInstance).mockReturnValue({
      getAllowedToolsForProfile: vi.fn().mockResolvedValue({
        tools: [
          {
            name: 'test_tool',
            description: 'Test tool',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        total: 1,
        filtered: 0,
        blocked: 0,
      }),
      isToolAllowed: vi.fn().mockResolvedValue({
        allowed: true,
        reason: '',
      }),
    } as any);

    vi.mocked(MCPSessionManager.getInstance).mockReturnValue({
      createOrGetSession: vi.fn().mockResolvedValue({
        id: 'test-session-id',
      }),
      terminateSession: vi.fn().mockResolvedValue(true),
      cleanupExpiredSessions: vi.fn().mockReturnValue(0),
      getSessionStats: vi.fn().mockReturnValue({
        total: 0,
        active: 0,
      }),
      updateSessionMetadata: vi.fn().mockReturnValue(true),
    } as any);

    vi.mocked(MCPHealthMonitor.getInstance).mockReturnValue({
      getHealthStatus: vi.fn().mockResolvedValue({
        status: 'healthy',
        uptime: 1000,
        requests: 10,
        errors: 0,
      }),
      getMetrics: vi.fn().mockResolvedValue({
        requests: 10,
        errors: 0,
        averageResponseTime: 100,
      }),
      recordRequest: vi.fn(),
    } as any);

    vi.mocked(MCPErrorHandler.getInstance).mockReturnValue({
      handleMCPError: vi.fn().mockImplementation((error, id) => {
        return NextResponse.json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
            data: error instanceof Error ? error.message : String(error),
          },
          id,
        }, { status: 500 });
      }),
      createErrorResponse: vi.fn().mockImplementation((code, message, id, data, status = 500) => {
        return NextResponse.json({
          jsonrpc: '2.0',
          error: {
            code,
            message,
            data,
          },
          id,
        }, { status });
      }),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('OPTIONS requests', () => {
    it('should handle OPTIONS requests with correct CORS headers', async () => {
      const request = new NextRequest('https://example.com/api/mcp-streamable-http', {
        method: 'OPTIONS',
      });

      const response = await handleStreamableHTTPRequest(request, mockServer, options);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET, POST, DELETE, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type, Authorization');
    });
  });

  describe('POST requests', () => {
    it('should handle tools/list with authentication', async () => {
      const request = new NextRequest('https://example.com/api/mcp-streamable-http', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 'test-id',
        }),
      });

      const response = await handleStreamableHTTPRequest(request, mockServer, options);

      expect(response.status).toBe(200);
      expect(MCPAuth.getInstance().authenticateRequest).toHaveBeenCalledWith(request);
      expect(ToolRegistry.getInstance().getAllowedToolsForProfile).toHaveBeenCalledWith(
        'test-profile-uuid',
        {
          allowedTools: ['test_tool'],
          blockedTools: ['blocked_tool'],
          allowedServers: ['test_server'],
          blockedServers: ['blocked_server'],
        }
      );
    });

    it('should handle tools/call with permission checking', async () => {
      const request = new NextRequest('https://example.com/api/mcp-streamable-http', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'test_tool',
            arguments: { test: 'value' },
          },
          id: 'test-id',
        }),
      });

      const response = await handleStreamableHTTPRequest(request, mockServer, options);

      expect(response.status).toBe(200);
      expect(ToolRegistry.getInstance().isToolAllowed).toHaveBeenCalledWith(
        'test-profile-uuid',
        'test_tool',
        {
          allowedTools: ['test_tool'],
          blockedTools: ['blocked_tool'],
          allowedServers: ['test_server'],
          blockedServers: ['blocked_server'],
        }
      );
    });

    it('should reject unauthorized requests', async () => {
      vi.mocked(MCPAuth.getInstance).mockReturnValue({
        authenticateRequest: vi.fn().mockResolvedValue({
          success: false,
          error: NextResponse.json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Unauthorized',
            },
            id: null,
          }, { status: 401 }),
        }),
      } as any);

      const request = new NextRequest('https://example.com/api/mcp-streamable-http', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 'test-id',
        }),
      });

      const response = await handleStreamableHTTPRequest(request, mockServer, options);

      expect(response.status).toBe(401);
    });

    it('should handle stateless mode', async () => {
      const statelessOptions = { ...options, stateless: true };
      
      const request = new NextRequest('https://example.com/api/mcp-streamable-http', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 'test-id',
        }),
      });

      const response = await handleStreamableHTTPRequest(request, mockServer, statelessOptions);

      expect(response.status).toBe(200);
    });
  });

  describe('GET requests', () => {
    it('should handle GET requests with appropriate response', async () => {
      const request = new NextRequest('https://example.com/api/mcp-streamable-http', {
        method: 'GET',
      });

      const response = await handleStreamableHTTPRequest(request, mockServer, options);

      expect(response.status).toBe(501);
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: 'SSE streams not fully supported in Next.js API routes. Use POST for JSON-RPC messages.',
        },
        id: null,
      });
    });
  });

  describe('DELETE requests', () => {
    it('should handle DELETE requests for session cleanup', async () => {
      const request = new NextRequest('https://example.com/api/mcp-streamable-http', {
        method: 'DELETE',
        headers: {
          'mcp-session-id': 'test-session-id',
        },
      });

      const response = await handleStreamableHTTPRequest(request, mockServer, options);

      expect(response.status).toBe(200);
      expect(MCPSessionManager.getInstance().terminateSession).toHaveBeenCalledWith('test-session-id');
    });

    it('should handle DELETE requests in stateless mode', async () => {
      const statelessOptions = { ...options, stateless: true };
      
      const request = new NextRequest('https://example.com/api/mcp-streamable-http', {
        method: 'DELETE',
      });

      const response = await handleStreamableHTTPRequest(request, mockServer, statelessOptions);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        success: true,
        message: 'Stateless mode - no session to terminate',
      });
    });
  });

  describe('Health checks', () => {
    it('should handle health check requests', async () => {
      const request = new NextRequest('https://example.com/api/mcp-streamable-http/health', {
        method: 'GET',
      });

      const response = await handleStreamableHTTPRequest(request, mockServer, options);

      expect(response.status).toBe(200);
      expect(MCPHealthMonitor.getInstance().getHealthStatus).toHaveBeenCalled();
    });

    it('should handle metrics requests', async () => {
      const request = new NextRequest('https://example.com/api/mcp-streamable-http/metrics', {
        method: 'GET',
      });

      const response = await handleStreamableHTTPRequest(request, mockServer, options);

      expect(response.status).toBe(200);
      expect(MCPHealthMonitor.getInstance().getMetrics).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle internal server errors', async () => {
      vi.mocked(MCPAuth.getInstance).mockReturnValue({
        authenticateRequest: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      } as any);

      const request = new NextRequest('https://example.com/api/mcp-streamable-http', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 'test-id',
        }),
      });

      const response = await handleStreamableHTTPRequest(request, mockServer, options);

      expect(response.status).toBe(500);
      expect(MCPErrorHandler.getInstance().handleMCPError).toHaveBeenCalled();
    });

    it('should handle unsupported methods', async () => {
      const request = new NextRequest('https://example.com/api/mcp-streamable-http', {
        method: 'PATCH',
      });

      const response = await handleStreamableHTTPRequest(request, mockServer, options);

      expect(response.status).toBe(405);
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Method PATCH not allowed',
        },
        id: null,
      });
    });
  });

  describe('Tool filtering', () => {
    it('should block tools that are not allowed', async () => {
      vi.mocked(ToolRegistry.getInstance).mockReturnValue({
        getAllowedToolsForProfile: vi.fn().mockResolvedValue({
          tools: [],
          total: 0,
          filtered: 1,
          blocked: 1,
        }),
        isToolAllowed: vi.fn().mockResolvedValue({
          allowed: false,
          reason: 'Tool is blocked',
        }),
      } as any);

      const request = new NextRequest('https://example.com/api/mcp-streamable-http', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'blocked_tool',
            arguments: { test: 'value' },
          },
          id: 'test-id',
        }),
      });

      const response = await handleStreamableHTTPRequest(request, mockServer, options);

      expect(response.status).toBe(200);
      expect(MCPErrorHandler.getInstance().createErrorResponse).toHaveBeenCalledWith(
        expect.any(Number),
        'Tool access denied',
        'test-id',
        { toolName: 'blocked_tool' }
      );
    });
  });

  describe('Session management', () => {
    it('should create and maintain sessions in stateful mode', async () => {
      const request = new NextRequest('https://example.com/api/mcp-streamable-http', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-api-key',
          'mcp-session-id': 'test-session-id',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 'test-id',
        }),
      });

      const response = await handleStreamableHTTPRequest(request, mockServer, options);

      expect(response.status).toBe(200);
      expect(MCPSessionManager.getInstance().createOrGetSession).toHaveBeenCalledWith('test-session-id', mockServer);
      expect(response.headers.get('mcp-session-id')).toBe('test-session-id');
    });
  });
});