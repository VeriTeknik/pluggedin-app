import { NextRequest } from 'next/server';

import { createMCPServer } from '@/lib/mcp/server';
import { handleStreamableHTTPRequest } from '@/lib/mcp/streamable-http/server';

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

/**
 * Main MCP Streamable HTTP endpoint
 * Handles all HTTP methods (GET, POST, DELETE, OPTIONS)
 */
export async function GET(request: NextRequest) {
  const server = await getMCPServer();
  return handleStreamableHTTPRequest(request, server, {
    requireApiAuth: true,
    stateless: false
  });
}

export async function POST(request: NextRequest) {
  const server = await getMCPServer();
  return handleStreamableHTTPRequest(request, server, {
    requireApiAuth: true,
    stateless: false
  });
}

export async function DELETE(request: NextRequest) {
  const server = await getMCPServer();
  return handleStreamableHTTPRequest(request, server, {
    requireApiAuth: true,
    stateless: false
  });
}

export async function OPTIONS(request: NextRequest) {
  const server = await getMCPServer();
  return handleStreamableHTTPRequest(request, server, {
    requireApiAuth: false,
    stateless: false
  });
}