import { NextRequest, NextResponse } from 'next/server';
import { handleStreamableHTTPRequest } from '@/lib/mcp/streamable-http/server';

/**
 * Root-level /mcp endpoint for MCP Streamable HTTP
 * Handles authentication via OAuth bearer tokens or API keys
 */

export async function POST(request: NextRequest) {
  return handleStreamableHTTPRequest(request, {}, {
    requireApiAuth: false, // Allow OAuth tokens
    stateless: false,
  });
}

export async function GET(request: NextRequest) {
  return handleStreamableHTTPRequest(request, {}, {
    requireApiAuth: false,
    stateless: false,
  });
}

export async function DELETE(request: NextRequest) {
  return handleStreamableHTTPRequest(request, {}, {
    requireApiAuth: false,
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
    },
  });
}