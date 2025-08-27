import { NextResponse } from 'next/server';

/**
 * OAuth 2.0 Protected Resource Metadata for MCP endpoint
 * RFC 8707 compliant - Resource Indicators for OAuth 2.0
 * https://datatracker.ietf.org/doc/html/rfc8707
 */
export async function GET() {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:12005';
  
  const metadata = {
    // Resource identification
    resource: `${baseUrl}/mcp`,
    resource_documentation: `${baseUrl}/docs/api-reference`,
    resource_policy_uri: `${baseUrl}/legal/privacy-policy`,
    resource_tos_uri: `${baseUrl}/legal/terms-of-service`,
    
    // OAuth authorization servers that protect this resource
    authorization_servers: [
      baseUrl,
      `${baseUrl}/.well-known/oauth-authorization-server`
    ],
    
    // Scopes required for this resource
    scopes_supported: [
      'mcp:read',
      'mcp:execute',
      'mcp:write'
    ],
    
    // Bearer token usage
    bearer_methods_supported: [
      'header',
      'body',
      'query'
    ],
    
    // Resource capabilities
    resource_capabilities: {
      tools_discovery: true,
      tools_execution: true,
      resource_management: true,
      prompt_management: true,
      notification_support: true,
      document_management: true,
      rag_support: true
    },
    
    // Supported MCP operations
    mcp_operations: [
      'tools/list',
      'tools/call',
      'resources/list',
      'resources/read',
      'prompts/list',
      'prompts/get',
      'completion/complete'
    ],
    
    // Authentication requirements
    authentication_requirements: {
      tools_list: 'optional', // Can work without auth for public tools
      tools_call: 'required', // Requires authentication
      resources_list: 'required',
      resources_read: 'required',
      prompts_list: 'required',
      prompts_get: 'required'
    },
    
    // Rate limiting information
    rate_limits: {
      authenticated: {
        requests_per_minute: 60,
        requests_per_hour: 3600
      },
      unauthenticated: {
        requests_per_minute: 10,
        requests_per_hour: 100
      }
    },
    
    // Supported authentication methods
    authentication_methods_supported: [
      'bearer_token',
      'api_key',
      'session_cookie',
      'oauth2'
    ],
    
    // MCP protocol version
    mcp_protocol_version: '1.0',
    
    // Server capabilities
    server_capabilities: {
      stateful_sessions: true,
      stateless_mode: true,
      streaming: true,
      batch_requests: false,
      approval_flow: true
    },
    
    // Content types supported
    content_types_supported: [
      'application/json',
      'application/x-ndjson',
      'text/event-stream'
    ],
    
    // CORS configuration
    cors: {
      allowed_origins: ['*'],
      allowed_methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowed_headers: ['Content-Type', 'Authorization', 'X-Session-Id', 'X-OAuth-Token'],
      max_age: 3600
    }
  };

  return NextResponse.json(metadata, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}