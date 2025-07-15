import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { getSessionManager } from '@/lib/mcp/sessions/SessionManager';
import { handleStreamableHTTPRequest } from '@/lib/mcp/streamable-http/handler';

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
    
    // Get user session for authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse the request body
    const body = await req.json();
    
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

    // Add CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
    response.headers.set('Access-Control-Expose-Headers', 'Mcp-Session-Id');

    // Add session ID to response if provided
    if (result.sessionId) {
      response.headers.set('Mcp-Session-Id', result.sessionId);
    }

    return response;
  } catch (error) {
    console.error('[MCP API] POST error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
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

    // Return SSE response
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id',
        'Access-Control-Expose-Headers': 'Mcp-Session-Id',
      },
    });
  } catch (error) {
    console.error('[MCP API] GET error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
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

    return NextResponse.json(
      { success: true },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id',
          'Access-Control-Expose-Headers': 'Mcp-Session-Id',
        },
      }
    );
  } catch (error) {
    console.error('[MCP API] DELETE error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS requests (CORS preflight)
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Mcp-Session-Id',
      'Access-Control-Expose-Headers': 'Mcp-Session-Id',
      'Access-Control-Max-Age': '86400',
    },
  });
}