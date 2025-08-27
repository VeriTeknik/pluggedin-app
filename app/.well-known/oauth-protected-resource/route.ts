import { NextResponse } from 'next/server';

/**
 * OAuth 2.0 Protected Resource Metadata endpoint (generic)
 * RFC 8707 compliant - Resource Indicators for OAuth 2.0
 * https://datatracker.ietf.org/doc/html/rfc8707
 */
export async function GET() {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:12005';
  
  const metadata = {
    // Resource server identification
    resource_server: baseUrl,
    resource_documentation: `${baseUrl}/docs/api-reference`,
    resource_policy_uri: `${baseUrl}/legal/privacy-policy`,
    resource_tos_uri: `${baseUrl}/legal/terms-of-service`,
    
    // OAuth authorization servers that protect these resources
    authorization_servers: [
      baseUrl,
      `${baseUrl}/.well-known/oauth-authorization-server`
    ],
    
    // Protected resources
    protected_resources: [
      {
        resource: `${baseUrl}/mcp`,
        description: 'MCP (Model Context Protocol) endpoint for AI tool execution',
        scopes_required: ['mcp:read', 'mcp:execute']
      },
      {
        resource: `${baseUrl}/api/mcp`,
        description: 'MCP API endpoint for direct tool access',
        scopes_required: ['mcp:read', 'mcp:execute', 'mcp:write']
      },
      {
        resource: `${baseUrl}/api/mcp-servers`,
        description: 'MCP server management endpoint',
        scopes_required: ['mcp:read', 'mcp:write']
      },
      {
        resource: `${baseUrl}/api/tools`,
        description: 'Direct tool management endpoint',
        scopes_required: ['mcp:read', 'mcp:execute']
      },
      {
        resource: `${baseUrl}/api/resources`,
        description: 'Resource management endpoint',
        scopes_required: ['mcp:read', 'mcp:write']
      },
      {
        resource: `${baseUrl}/api/prompts`,
        description: 'Prompt management endpoint',
        scopes_required: ['mcp:read', 'mcp:write']
      },
      {
        resource: `${baseUrl}/api/documents`,
        description: 'Document and RAG management endpoint',
        scopes_required: ['mcp:read', 'mcp:write']
      },
      {
        resource: `${baseUrl}/api/notifications`,
        description: 'Notification management endpoint',
        scopes_required: ['mcp:read', 'mcp:write']
      }
    ],
    
    // Global scopes supported
    scopes_supported: [
      'mcp:read',
      'mcp:execute',
      'mcp:write',
      'profile',
      'openid',
      'email',
      'offline_access'
    ],
    
    // Bearer token usage
    bearer_methods_supported: [
      'header',
      'body',
      'query'
    ],
    
    // Authentication methods supported
    authentication_methods_supported: [
      'bearer_token',
      'api_key',
      'session_cookie',
      'oauth2'
    ],
    
    // Rate limiting information
    rate_limits: {
      authenticated: {
        requests_per_minute: 60,
        requests_per_hour: 3600,
        requests_per_day: 50000
      },
      unauthenticated: {
        requests_per_minute: 10,
        requests_per_hour: 100,
        requests_per_day: 1000
      },
      api_key: {
        requests_per_minute: 120,
        requests_per_hour: 7200,
        requests_per_day: 100000
      }
    },
    
    // Server capabilities
    capabilities: {
      mcp_protocol: true,
      oauth2: true,
      openid_connect: true,
      api_keys: true,
      session_auth: true,
      rate_limiting: true,
      cors: true,
      websockets: false,
      server_sent_events: true,
      batch_operations: false
    },
    
    // Content types supported
    content_types_supported: [
      'application/json',
      'application/x-ndjson',
      'text/event-stream',
      'application/x-www-form-urlencoded'
    ],
    
    // CORS configuration
    cors: {
      allowed_origins: ['*'],
      allowed_methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowed_headers: [
        'Content-Type',
        'Authorization',
        'X-Session-Id',
        'X-OAuth-Token',
        'X-API-Key'
      ],
      exposed_headers: [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset'
      ],
      max_age: 3600,
      credentials: true
    },
    
    // API versioning
    api_version: '1.0.0',
    mcp_version: '1.0',
    
    // Service status
    service_status: 'operational',
    status_page: `${baseUrl}/api/health`
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