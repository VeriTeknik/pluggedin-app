// Using 'any' type for server to access internal handlers
// The MCP SDK Server doesn't expose a public API for direct handler invocation
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { MCPAuth } from '../auth';
import { MCPErrorCode,MCPErrorHandler } from '../error-handler';
import { MCPHealthMonitor } from '../health-monitor';
import { MCPSessionManager } from '../session-manager';
import { ToolRegistry } from '../tool-registry';

// Session manager instance
const sessionManager = MCPSessionManager.getInstance();
// Health monitor instance
const healthMonitor = MCPHealthMonitor.getInstance();
// Error handler instance
const errorHandler = MCPErrorHandler.getInstance();
// Tool registry instance
const toolRegistry = ToolRegistry.getInstance();

/**
 * Helper function to create a JSON response with session ID header
 */
function createSessionResponse(data: any, sessionId: string, status?: number) {
  const response = NextResponse.json(data, status ? { status } : undefined);
  response.headers.set('Mcp-Session-Id', sessionId);
  return response;
}

export interface StreamableHTTPOptions {
  requireApiAuth?: boolean;
  stateless?: boolean;
  allowedTools?: string[];
  blockedTools?: string[];
  allowedServers?: string[];
  blockedServers?: string[];
}

/**
 * Handle Streamable HTTP requests for MCP protocol
 * This implementation is designed to work with Next.js API routes
 */
export async function handleStreamableHTTPRequest(
  request: NextRequest,
  server: any,
  options: StreamableHTTPOptions = {}
): Promise<NextResponse> {
  const { requireApiAuth = true, stateless = false, allowedTools, blockedTools, allowedServers, blockedServers } = options;
  const method = request.method;
  const url = new URL(request.url);
  
  try {
    // Handle OPTIONS requests (CORS preflight)
    if (method === 'OPTIONS') {
      return handleOptionsRequest();
    }

    // Handle POST requests (JSON-RPC messages)
    if (method === 'POST') {
      return handlePostRequest(request, server, { requireApiAuth, stateless, allowedTools, blockedTools, allowedServers, blockedServers });
    }

    // Handle GET requests (SSE stream - simplified for Next.js)
    if (method === 'GET') {
      return handleGetRequest(request, { stateless });
    }

    // Handle DELETE requests (session cleanup)
    if (method === 'DELETE') {
      return handleDeleteRequest(request, { stateless });
    }

    // Handle HEAD requests (for health checks and metadata)
    if (method === 'HEAD') {
      return handleHeadRequest();
    }

    // Handle PUT requests (for configuration updates)
    if (method === 'PUT') {
      return handlePutRequest(request, { requireApiAuth });
    }

    // Handle health check endpoint (public access)
    if (url.pathname.endsWith('/health')) {
      return handleHealthCheck();
    }

    // Handle metrics endpoint (public access)
    if (url.pathname.endsWith('/metrics')) {
      return handleMetrics();
    }

    // Handle unsupported methods
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: `Method ${method} not allowed`,
        },
        id: null,
      },
      { status: 405 }
    );
  } catch (error) {
    return errorHandler.handleMCPError(error, null);
  }
}

/**
 * Handle OPTIONS requests (CORS preflight)
 */
function handleOptionsRequest(): NextResponse {
  const response = new NextResponse(null, { status: 200 });
  
  // Comprehensive CORS headers following OpenAI MCP guidelines
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS, HEAD, PUT');
  response.headers.set('Access-Control-Allow-Headers',
    'Content-Type, Authorization, mcp-session-id, X-Requested-With, Accept, Origin, Cache-Control');
  response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours
  response.headers.set('Access-Control-Allow-Credentials', 'false');
  response.headers.set('Access-Control-Expose-Headers', 'mcp-session-id, X-Rate-Limit-Limit, X-Rate-Limit-Remaining');
  
  return response;
}

/**
 * Handle POST requests (JSON-RPC messages)
 */
async function handlePostRequest(
  request: NextRequest,
  server: any,
  options: { requireApiAuth: boolean; stateless: boolean; allowedTools?: string[]; blockedTools?: string[]; allowedServers?: string[]; blockedServers?: string[]; }
): Promise<NextResponse> {
  const { requireApiAuth, stateless, allowedTools, blockedTools, allowedServers, blockedServers } = options;
  
  // Get session ID from header
  const sessionId = request.headers.get('mcp-session-id') || randomUUID();
  
  // Parse request body
  const body = await request.json();
  
  // Set CORS headers
  const response = new NextResponse();
  
  // Apply comprehensive CORS headers to all responses
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS, HEAD, PUT');
  response.headers.set('Access-Control-Allow-Headers',
    'Content-Type, Authorization, mcp-session-id, X-Requested-With, Accept, Origin, Cache-Control');
  response.headers.set('Access-Control-Expose-Headers', 'mcp-session-id, X-Rate-Limit-Limit, X-Rate-Limit-Remaining');
  
  // Check authentication
  let authResult: any = null;
  
  // Build the expected resource URL for OAuth audience validation (RFC 8707)
  const expectedResource = request.url;
  
  // For tools/list, authentication is optional but enhances functionality
  if (body.method === 'tools/list') {
    authResult = await MCPAuth.getInstance().authenticateRequest(request, expectedResource);
    // If auth fails for tools/list, continue anyway (public tools only)
    if (!authResult.success) {
      console.log('No authentication provided for tools/list - returning public tools only');
      authResult = { success: false, profileUuid: null };
    }
  } 
  // For other protected operations, authentication is required
  else if (requireApiAuth && isProtectedOperation(body)) {
    authResult = await MCPAuth.getInstance().authenticateRequest(request, expectedResource);
    if (!authResult.success) {
      return authResult.error!;
    }
  }
  
  // Record request in health monitor
  const startTime = Date.now();

  // Apply tool filtering if configured
  if (body.method === 'tools/list' && authResult?.profileUuid) {
    return await handleToolsList(body, server, {
      profileUuid: authResult.profileUuid,
      allowedTools: options.allowedTools,
      blockedTools: options.blockedTools,
      allowedServers: options.allowedServers,
      blockedServers: options.blockedServers
    });
  }

  if (body.method === 'tools/call' && authResult?.profileUuid) {
    // Check if tool is allowed before calling
    const toolName = body.params?.name;
    if (toolName) {
      // Check if it's a static tool first
      const { staticTools } = await import('../tools/static-tools');
      const isStaticTool = staticTools.some(tool => tool.name === toolName);
      
      // If it's not a static tool, check permissions in the database
      if (!isStaticTool) {
        const isAllowed = await toolRegistry.isToolAllowed(
          authResult.profileUuid,
          toolName,
          {
            allowedTools: options.allowedTools,
            blockedTools: options.blockedTools,
            allowedServers: options.allowedServers,
            blockedServers: options.blockedServers
          }
        );

        if (!isAllowed.allowed) {
          return errorHandler.createErrorResponse(
            MCPErrorCode.TOOL_PERMISSION_DENIED,
            isAllowed.reason || 'Tool access denied',
            body.id,
            { toolName }
          );
        }
      }
    }
  }
  
  // Handle stateless mode
  if (stateless) {
    const result = await handleStatelessRequest(body, server);
    const responseTime = Date.now() - startTime;
    healthMonitor.recordRequest(responseTime, false);
    return result;
  }
  
  // Handle stateful mode
  const result = await handleStatefulRequest(body, server, sessionId, response);
  const responseTime = Date.now() - startTime;
  healthMonitor.recordRequest(responseTime, false);
  return result;
}

/**
 * Handle GET requests (SSE stream - simplified for Next.js)
 */
async function handleGetRequest(
  request: NextRequest,
  options: { stateless: boolean }
): Promise<NextResponse> {
  const { stateless } = options;
  const sessionId = request.headers.get('mcp-session-id');
  
  // Create a simple SSE stream that stays open
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(encoder.encode('event: open\ndata: {"type":"connected"}\n\n'));
      
      // Keep the connection alive with periodic pings
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode('event: ping\ndata: {"type":"ping"}\n\n'));
        } catch (error) {
          clearInterval(interval);
        }
      }, 30000); // Ping every 30 seconds
      
      // Clean up on close
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id',
    },
  });
}

/**
 * Handle DELETE requests (session cleanup)
 */
async function handleDeleteRequest(
  request: NextRequest,
  options: { stateless: boolean }
): Promise<NextResponse> {
  const { stateless } = options;
  const sessionId = request.headers.get('mcp-session-id');
  
  if (stateless) {
    return NextResponse.json({ 
      success: true, 
      message: 'Stateless mode - no session to terminate' 
    });
  }
  
  if (!sessionId) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Session ID required for DELETE'
        }
      },
      { status: 400 }
    );
  }
  
  const success = await sessionManager.terminateSession(sessionId);
  if (success) {
    return NextResponse.json({
      success: true,
      message: 'Session terminated'
    });
  } else {
    return NextResponse.json({
      success: true,
      message: 'Session not found'
    });
  }
}

/**
 * Check if the operation requires authentication
 */
function isProtectedOperation(body: any): boolean {
  if (!body || typeof body !== 'object') {
    return false;
  }
  
  const method = body.method;
  
  // Special case: pluggedin_setup tool doesn't require authentication
  if (method === 'tools/call' && body.params?.name === 'pluggedin_setup') {
    return false;
  }
  
  return method && (
    method.startsWith('tools/') || 
    method.startsWith('resources/') ||
    method === 'tools/call' ||
    method === 'resources/read'
  );
}

/**
 * Handle stateless request (create new session for each request)
 */
async function handleStatelessRequest(body: any, server: any): Promise<NextResponse> {
  try {
    // The server has request handlers that we set up, we need to call them directly
    // The MCP SDK doesn't expose a direct way to invoke handlers, so we'll use the
    // server's internal handler mechanism
    
    // Handle initialize method
    if (body.method === 'initialize') {
      return NextResponse.json({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2025-06-18',
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false, subscribe: false },
            prompts: { listChanged: false },
            logging: {}
          },
          serverInfo: {
            name: 'pluggedin-mcp',
            version: '1.0.0'
          }
        },
        id: body.id
      });
    }
    
    // Handle notifications/initialized (client confirming initialization complete)
    if (body.method === 'notifications/initialized') {
      console.log('[MCP] Client initialized notification received');
      return NextResponse.json({
        jsonrpc: '2.0',
        result: {},
        id: body.id || null
      });
    }
    
    // Handle logging/setLevel
    if (body.method === 'logging/setLevel') {
      console.log('[MCP] Logging level set:', body.params);
      return NextResponse.json({
        jsonrpc: '2.0',
        result: {},
        id: body.id
      });
    }
    
    // Handle resources/list
    if (body.method === 'resources/list') {
      console.log('[MCP] Resources list requested');
      return NextResponse.json({
        jsonrpc: '2.0',
        result: {
          resources: []
        },
        id: body.id
      });
    }
    
    // Handle resources/templates/list
    if (body.method === 'resources/templates/list') {
      console.log('[MCP] Resource templates list requested');
      return NextResponse.json({
        jsonrpc: '2.0',
        result: {
          resourceTemplates: []
        },
        id: body.id
      });
    }
    
    // Handle prompts/list
    if (body.method === 'prompts/list') {
      console.log('[MCP] Prompts list requested');
      return NextResponse.json({
        jsonrpc: '2.0',
        result: {
          prompts: []
        },
        id: body.id
      });
    }
    
    // Handle ping method
    if (body.method === 'ping') {
      console.log('[MCP] Ping received');
      return NextResponse.json({
        jsonrpc: '2.0',
        result: {},
        id: body.id
      });
    }
    
    if (body.method === 'tools/list') {
      // Get the handler from the server
      const handler = (server as any)._requestHandlers?.get('tools/list');
      if (handler) {
        const result = await handler({ method: 'tools/list', params: body.params || {} });
        return createSessionResponse({
          jsonrpc: '2.0',
          result,
          id: body.id
        }, sessionId);
      } else {
        return createSessionResponse({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found',
            data: 'tools/list handler not available'
          },
          id: body.id
        }, sessionId, 404);
      }
    }
    
    if (body.method === 'tools/call') {
      // Get the handler from the server
      const handler = (server as any)._requestHandlers?.get('tools/call');
      if (handler) {
        const result = await handler({
          method: 'tools/call',
          params: body.params || {}
        });
        return createSessionResponse({
          jsonrpc: '2.0',
          result,
          id: body.id
        }, sessionId);
      } else {
        return createSessionResponse({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found',
            data: 'tools/call handler not available'
          },
          id: body.id
        }, sessionId, 404);
      }
    }
    
    // Handle other methods as needed
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: `Method ${body.method} not supported in stateless mode`
        },
        id: body.id
      },
      { status: 501 }
    );
  } catch (error) {
    console.error('Error handling stateless request:', error);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
          data: error instanceof Error ? error.message : String(error)
        },
        id: body.id
      },
      { status: 500 }
    );
  }
}

/**
 * Handle stateful request (maintain session across requests)
 */
async function handleStatefulRequest(
  body: any, 
  server: any, 
  sessionId: string, 
  response: NextResponse
): Promise<NextResponse> {
  try {
    // Create or update session
    const session = await sessionManager.createOrGetSession(sessionId, server);
    console.log(`Streamable HTTP session ${session.id} accessed`);
    
    // Handle initialize method
    if (body.method === 'initialize') {
      const initResponse = NextResponse.json({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2025-06-18',
          capabilities: {
            tools: { listChanged: false },
            resources: { listChanged: false, subscribe: false },
            prompts: { listChanged: false },
            logging: {}
          },
          serverInfo: {
            name: 'pluggedin-mcp',
            version: '1.0.0'
          }
        },
        id: body.id
      });
      
      // Set session ID in response header
      initResponse.headers.set('Mcp-Session-Id', sessionId);
      
      return initResponse;
    }
    
    // Handle notifications/initialized (client confirming initialization complete)
    if (body.method === 'notifications/initialized') {
      // This is a notification, no response needed but MCP expects a result
      console.log('[MCP] Client initialized notification received');
      return createSessionResponse({
        jsonrpc: '2.0',
        result: {},
        id: body.id || null
      }, sessionId);
    }
    
    // Handle logging/setLevel
    if (body.method === 'logging/setLevel') {
      console.log('[MCP] Logging level set:', body.params);
      return createSessionResponse({
        jsonrpc: '2.0',
        result: {},
        id: body.id
      }, sessionId);
    }
    
    // Handle resources/list
    if (body.method === 'resources/list') {
      console.log('[MCP] Resources list requested');
      return createSessionResponse({
        jsonrpc: '2.0',
        result: {
          resources: []
        },
        id: body.id
      }, sessionId);
    }
    
    // Handle resources/templates/list
    if (body.method === 'resources/templates/list') {
      console.log('[MCP] Resource templates list requested');
      return createSessionResponse({
        jsonrpc: '2.0',
        result: {
          resourceTemplates: []
        },
        id: body.id
      }, sessionId);
    }
    
    // Handle prompts/list
    if (body.method === 'prompts/list') {
      console.log('[MCP] Prompts list requested');
      return createSessionResponse({
        jsonrpc: '2.0',
        result: {
          prompts: []
        },
        id: body.id
      }, sessionId);
    }
    
    // Handle ping (health check)
    if (body.method === 'ping') {
      console.log('[MCP] Ping received');
      return createSessionResponse({
        jsonrpc: '2.0',
        result: {},
        id: body.id
      }, sessionId);
    }
    
    // Set session ID in response header for other methods
    response.headers.set('Mcp-Session-Id', sessionId);
    
    // Process the request using the server's handlers directly
    if (body.method === 'tools/list') {
      // Get the handler from the server
      const handler = (server as any)._requestHandlers?.get('tools/list');
      if (handler) {
        const result = await handler({ method: 'tools/list', params: body.params || {} });
        return createSessionResponse({
          jsonrpc: '2.0',
          result,
          id: body.id
        }, sessionId);
      } else {
        return createSessionResponse({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found',
            data: 'tools/list handler not available'
          },
          id: body.id
        }, sessionId, 404);
      }
    }
    
    if (body.method === 'tools/call') {
      // Get the handler from the server
      const handler = (server as any)._requestHandlers?.get('tools/call');
      if (handler) {
        const result = await handler({
          method: 'tools/call',
          params: body.params || {}
        });
        return createSessionResponse({
          jsonrpc: '2.0',
          result,
          id: body.id
        }, sessionId);
      } else {
        return createSessionResponse({
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: 'Method not found',
            data: 'tools/call handler not available'
          },
          id: body.id
        }, sessionId, 404);
      }
    }
    
    // Handle other methods as needed
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: `Method ${body.method} not supported`
        },
        id: body.id
      },
      { status: 501 }
    );
  } catch (error) {
    return errorHandler.handleMCPError(error, body.id);
  }
}

/**
 * Handle HEAD requests (for health checks and metadata)
 */
function handleHeadRequest(): NextResponse {
  const response = new NextResponse(null, { status: 200 });
  
  // Add headers for service information
  response.headers.set('X-MCP-Version', '2024-11-05');
  response.headers.set('X-Service', 'pluggedin-mcp-streamable-http');
  response.headers.set('X-Service-Version', '1.0.0');
  response.headers.set('X-Capabilities', 'tools,resources,logging');
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS, HEAD, PUT');
  response.headers.set('Access-Control-Allow-Headers',
    'Content-Type, Authorization, mcp-session-id, X-Requested-With, Accept, Origin, Cache-Control');
  
  return response;
}

/**
 * Handle PUT requests (for configuration updates)
 */
async function handlePutRequest(
  request: NextRequest,
  options: { requireApiAuth: boolean }
): Promise<NextResponse> {
  const { requireApiAuth } = options;
  
  // Check authentication for configuration updates
  if (requireApiAuth) {
    const expectedResource = request.url;
    const authResult = await MCPAuth.getInstance().authenticateRequest(request, expectedResource);
    if (!authResult.success) {
      return authResult.error!;
    }
  }
  
  try {
    const body = await request.json();
    const sessionId = request.headers.get('mcp-session-id');
    
    // Handle session configuration updates
    if (sessionId && body.config) {
      const success = sessionManager.updateSessionMetadata(sessionId, body.config);
      if (success) {
        return createSessionResponse({
          success: true,
          message: 'Session configuration updated'
        });
      } else {
        return NextResponse.json(
          {
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Session not found'
            }
          },
          { status: 404 }
        );
      }
    }
    
    // Handle global configuration updates
    if (body.globalConfig) {
      // In a real implementation, you would update global configuration here
      return NextResponse.json({
        success: true,
        message: 'Global configuration updated'
      });
    }
    
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid configuration update request'
        }
      },
      { status: 400 }
    );
  } catch (error) {
    return errorHandler.handleMCPError(error, null);
  }
}

/**
 * Handle health check requests
 */
async function handleHealthCheck(): Promise<NextResponse> {
  try {
    const healthStatus = await healthMonitor.getHealthStatus();
    
    const response = NextResponse.json(healthStatus);
    
    // Add CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Set appropriate status code based on health
    if (healthStatus.status === 'unhealthy') {
      response.headers.set('Content-Type', 'application/json');
      return new NextResponse(JSON.stringify(healthStatus), {
        status: 503,
        headers: response.headers
      });
    }
    
    return response;
  } catch (error) {
    return errorHandler.createErrorResponse(
      MCPErrorCode.INTERNAL_ERROR,
      'Health check failed',
      null,
      { originalError: error instanceof Error ? error.message : String(error) },
      503
    );
  }
}

/**
 * Handle metrics requests
 */
async function handleMetrics(): Promise<NextResponse> {
  try {
    const metrics = await healthMonitor.getMetrics();
    
    const response = NextResponse.json(metrics);
    
    // Add CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Content-Type', 'application/json');
    
    return response;
  } catch (error) {
    return errorHandler.createErrorResponse(
      MCPErrorCode.INTERNAL_ERROR,
      'Metrics collection failed',
      null,
      { originalError: error instanceof Error ? error.message : String(error) },
      500
    );
  }
}

/**
 * Cleanup expired sessions
 */
export function cleanupExpiredSessions(maxAge: number = 30 * 60 * 1000): number {
  return sessionManager.cleanupExpiredSessions();
}

/**
 * Handle tools list with filtering
 */
async function handleToolsList(
  body: any,
  server: any,
  options: {
    profileUuid: string;
    allowedTools?: string[];
    blockedTools?: string[];
    allowedServers?: string[];
    blockedServers?: string[];
  }
): Promise<NextResponse> {
  try {
    const { profileUuid, allowedTools, blockedTools, allowedServers, blockedServers } = options;

    // Get filtered tools
    const result = await toolRegistry.getAllowedToolsForProfile(profileUuid, {
      allowedTools,
      blockedTools,
      allowedServers,
      blockedServers
    });

    // Format response according to MCP tools/list format
    const toolsResponse = {
      tools: result.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      })),
      meta: {
        total: result.total,
        filtered: result.filtered,
        blocked: result.blocked
      }
    };

    return NextResponse.json({
      jsonrpc: '2.0',
      result: toolsResponse,
      id: body.id
    });
  } catch (error) {
    return errorHandler.handleMCPError(error, body.id);
  }
}

/**
 * Get session statistics
 */
export function getSessionStats(): { total: number; active: number } {
  const stats = sessionManager.getSessionStats();
  return {
    total: stats.total,
    active: stats.active
  };
}