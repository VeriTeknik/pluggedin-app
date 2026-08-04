import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { handleConnectorRequest } from '@/lib/mcp/connector/handle-request';
import { getSessionManager } from '@/lib/mcp/sessions/SessionManager';
import { handleStreamableHTTPRequest } from '@/lib/mcp/streamable-http/handler';
import { buildUnauthorizedResponse } from '@/lib/oauth/provider/authenticate';
import { getCorsHeaders, handleCorsOptions } from '@/lib/security/cors';
import { createSecureErrorResponse, ErrorCode } from '@/lib/security/error-handler';

/**
 * MCP Streamable HTTP endpoint
 * Implements the single /mcp endpoint that handles:
 * - POST: JSON-RPC messages
 * - GET: SSE stream for server-to-client messages
 * - DELETE: Clean up session
 */

// Handle POST requests (JSON-RPC messages)
export async function POST(req: NextRequest) {
  try {
    // Get the session ID from headers
    const sessionId = req.headers.get('Mcp-Session-Id');

    // Parse the request body once: both paths below need it, and a Request
    // body can only be read a single time.
    const body = await req.json();

    // Two callers reach this endpoint and they authenticate differently.
    //
    // A bearer token means the hosted connector: MCP 2026-07-28, stateless, no
    // Mcp-Session-Id, authorized by an OAuth access token. A cookie means the
    // older session-based streamable transport, kept working until the local
    // proxy is retired.
    //
    // Branching rather than rewriting is deliberate. Nothing in this repository
    // calls the session path today and the proxy uses /api/mcp-servers, but
    // "no caller I can find" is not "no caller", and deleting a live endpoint
    // to save one conditional is a poor trade.
    if (req.headers.get('authorization')?.startsWith('Bearer ')) {
      return handleConnectorRequest(req, body);
    }

    // Get user session for authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      // Neither credential. Answer with the connector's challenge rather than a
      // bare 401: the WWW-Authenticate header is how Claude learns where the
      // authorization server is, and it is ignored on any status but 401.
      return buildUnauthorizedResponse(
        `${(process.env.NEXTAUTH_URL ?? '').replace(/\/+$/, '')}/.well-known/oauth-protected-resource`
      );
    }

    // Handle the Streamable HTTP request
    const result = await handleStreamableHTTPRequest({
      method: 'POST',
      sessionId,
      userId: session.user.id,
      body,
      headers: Object.fromEntries(req.headers.entries()),
    });

    // Return response with appropriate headers
    const response = NextResponse.json(result.body, {
      status: result.status || 200,
    });

    // Add secure CORS headers
    const corsHeaders = getCorsHeaders(req);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value as string);
    });

    // Add session ID to response if provided
    if (result.sessionId) {
      response.headers.set('Mcp-Session-Id', result.sessionId);
    }

    return response;
  } catch (error) {
    return createSecureErrorResponse(error, 500, ErrorCode.INTERNAL_ERROR, 'MCP API POST');
  }
}

// Handle GET requests (SSE stream)
export async function GET(req: NextRequest) {
  try {
    // Get the session ID from headers
    const sessionId = req.headers.get('Mcp-Session-Id');
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing Mcp-Session-Id header' },
        { status: 400 }
      );
    }

    // Get user session for authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Send initial connection message
        controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));

        // Set up message handler for this session
        const result = await handleStreamableHTTPRequest({
          method: 'GET',
          sessionId,
          userId: session.user.id,
          headers: Object.fromEntries(req.headers.entries()),
          streamController: controller,
          encoder,
        });

        if (!result.success) {
          controller.enqueue(encoder.encode(`data: {"error":"${result.error}"}\n\n`));
          controller.close();
        }
      },
      cancel() {
        // Clean up when client disconnects
      },
    });

    // Return SSE response with secure CORS headers
    const corsHeaders = getCorsHeaders(req);
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders,
      },
    });
  } catch (error) {
    return createSecureErrorResponse(error, 500, ErrorCode.INTERNAL_ERROR, 'MCP API GET');
  }
}

// Handle DELETE requests (session cleanup)
export async function DELETE(req: NextRequest) {
  try {
    // Get the session ID from headers
    const sessionId = req.headers.get('Mcp-Session-Id');
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing Mcp-Session-Id header' },
        { status: 400 }
      );
    }

    // Get user session for authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Delete the session
    const sessionManager = getSessionManager();
    await sessionManager.deleteSession(sessionId);

    const corsHeaders = getCorsHeaders(req);
    return NextResponse.json(
      { success: true },
      {
        headers: corsHeaders,
      }
    );
  } catch (error) {
    return createSecureErrorResponse(error, 500, ErrorCode.INTERNAL_ERROR, 'MCP API DELETE');
  }
}

// Handle OPTIONS requests (CORS preflight)
export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req);
}