import { NextResponse } from 'next/server';

/**
 * OAuth 2.0 Authorization Server Metadata endpoint
 * RFC 8414 compliant discovery endpoint
 * https://datatracker.ietf.org/doc/html/rfc8414
 */
export async function GET() {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:12005';
  
  const metadata = {
    // Required fields
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    
    // Optional but recommended fields
    registration_endpoint: `${baseUrl}/api/oauth/client/register`,
    revocation_endpoint: `${baseUrl}/api/oauth/revoke`,
    introspection_endpoint: `${baseUrl}/api/oauth/introspect`,
    
    // Supported OAuth 2.0 features
    scopes_supported: [
      'mcp:read',
      'mcp:execute',
      'mcp:write',
      'profile',
      'openid',
      'email'
    ],
    
    response_types_supported: [
      'code',
      'token',
      'id_token',
      'code token',
      'code id_token',
      'token id_token',
      'code token id_token'
    ],
    
    response_modes_supported: [
      'query',
      'fragment',
      'form_post'
    ],
    
    grant_types_supported: [
      'authorization_code',
      'implicit',
      'refresh_token',
      'client_credentials'
    ],
    
    code_challenge_methods_supported: [
      'S256',
      'plain'
    ],
    
    token_endpoint_auth_methods_supported: [
      'client_secret_post',
      'client_secret_basic',
      'client_secret_jwt',
      'none'
    ],
    
    token_endpoint_auth_signing_alg_values_supported: [
      'RS256',
      'HS256'
    ],
    
    // Service documentation
    service_documentation: `${baseUrl}/docs/api-reference`,
    
    // UI locales supported
    ui_locales_supported: [
      'en',
      'tr',
      'zh',
      'hi',
      'ja',
      'nl'
    ],
    
    // Claims supported
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'iat',
      'auth_time',
      'nonce',
      'profile_uuid',
      'profile_name',
      'project_uuid',
      'project_name'
    ],
    
    // Additional endpoints
    userinfo_endpoint: `${baseUrl}/api/oauth/userinfo`,
    jwks_uri: `${baseUrl}/api/oauth/jwks`,
    
    // MCP-specific extensions
    mcp_endpoints: {
      tools_list: `${baseUrl}/mcp`,
      tools_execute: `${baseUrl}/mcp`,
      resource_endpoint: `${baseUrl}/api/mcp`,
      oauth_callback: `${baseUrl}/api/mcp/oauth/callback`
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