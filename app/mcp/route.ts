import { NextRequest, NextResponse } from 'next/server';
import { createMCPServer } from '@/lib/mcp/server';
import { handleStreamableHTTPRequest } from '@/lib/mcp/streamable-http/server';

/**
 * Root-level /mcp endpoint for MCP Streamable HTTP
 * Handles authentication via OAuth bearer tokens or API keys
 */

// Global server instance to maintain state across requests
let globalServer: any = null;

/**
 * Initialize the MCP server if not already created
 */
async function getMCPServer() {
  if (!globalServer) {
    globalServer = await createMCPServer();
  }
  return globalServer;
}

export async function POST(request: NextRequest) {
  console.log('[MCP] POST request received');
  const server = await getMCPServer();
  return handleStreamableHTTPRequest(request, server, {
    requireApiAuth: true, // Require authentication
    stateless: false, // Support sessions
  });
}

export async function GET(request: NextRequest) {
  const server = await getMCPServer();
  return handleStreamableHTTPRequest(request, server, {
    requireApiAuth: true,
    stateless: false,
  });
}

export async function DELETE(request: NextRequest) {
  const server = await getMCPServer();
  return handleStreamableHTTPRequest(request, server, {
    requireApiAuth: true,
    stateless: false,
  });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Id, X-OAuth-Token, X-API-Key, Mcp-Session-Id',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Credentials': 'false',
    },
  });
}