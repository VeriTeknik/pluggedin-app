import { NextRequest, NextResponse } from 'next/server';
import { createMCPServer } from '@/lib/mcp/server';
import { handleStreamableHTTPRequest } from '@/lib/mcp/streamable-http/server';
import { MCPAuth } from '@/lib/mcp/auth';

/**
 * Root-level /mcp endpoint for MCP Streamable HTTP
 * Handles authentication via OAuth bearer tokens or API keys
 */

// Per-profile server instances to maintain profile context
const profileServers: Map<string, any> = new Map();
// Default server for unauthenticated requests
let defaultServer: any = null;

/**
 * Get or create MCP server for a specific profile
 */
async function getMCPServer(profileUuid?: string) {
  if (!profileUuid) {
    // Return default server for unauthenticated requests
    if (!defaultServer) {
      defaultServer = await createMCPServer();
    }
    return defaultServer;
  }
  
  // Get or create profile-specific server
  if (!profileServers.has(profileUuid)) {
    const server = await createMCPServer(profileUuid);
    profileServers.set(profileUuid, server);
  }
  
  return profileServers.get(profileUuid);
}

export async function POST(request: NextRequest) {
  console.log('[MCP] POST request received');
  
  // Try to get profile UUID from authentication (don't fail if not authenticated)
  const authResult = await MCPAuth.getInstance().authenticateRequest(request);
  const profileUuid = authResult.success ? authResult.profileUuid : undefined;
  
  console.log('[MCP] Auth result:', authResult.success ? 'success' : 'failed', 'Profile UUID:', profileUuid);
  
  // Get server for this profile (or default if no profile)
  const server = await getMCPServer(profileUuid);
  
  return handleStreamableHTTPRequest(request, server, {
    requireApiAuth: true, // Require authentication
    stateless: false, // Support sessions
  });
}

export async function GET(request: NextRequest) {
  // Try to get profile UUID from authentication
  const authResult = await MCPAuth.getInstance().authenticateRequest(request);
  const profileUuid = authResult.success ? authResult.profileUuid : undefined;
  
  const server = await getMCPServer(profileUuid);
  return handleStreamableHTTPRequest(request, server, {
    requireApiAuth: true,
    stateless: false,
  });
}

export async function DELETE(request: NextRequest) {
  // Try to get profile UUID from authentication
  const authResult = await MCPAuth.getInstance().authenticateRequest(request);
  const profileUuid = authResult.success ? authResult.profileUuid : undefined;
  
  const server = await getMCPServer(profileUuid);
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