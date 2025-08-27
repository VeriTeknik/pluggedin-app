import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { oauthProvider } from '@/lib/oauth/provider';

// DCR request schema based on RFC 7591
const dcrRequestSchema = z.object({
  client_name: z.string().min(1).max(255),
  redirect_uris: z.array(z.string().url()),
  grant_types: z.array(z.string()).optional().default(['authorization_code']),
  response_types: z.array(z.string()).optional().default(['code']),
  scope: z.string().optional().default('mcp:read mcp:execute'),
  token_endpoint_auth_method: z.string().optional().default('client_secret_basic'),
});

/**
 * Dynamic Client Registration endpoint (RFC 7591)
 * Used by Claude and other MCP clients to register dynamically
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request
    const validationResult = dcrRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Invalid client registration request',
        },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          }
        }
      );
    }

    const data = validationResult.data;

    // Register the client
    const result = await oauthProvider.registerClient({
      name: data.client_name,
      redirectUris: data.redirect_uris,
      grantTypes: data.grant_types,
      responseTypes: data.response_types,
      scope: data.scope,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'server_error',
          error_description: result.error || 'Failed to register client',
        },
        { 
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          }
        }
      );
    }

    // Return DCR response with CORS headers
    return NextResponse.json({
      client_id: result.client!.clientId,
      client_secret: result.client!.clientSecret,
      client_name: result.client!.name,
      redirect_uris: result.client!.redirectUris,
      grant_types: data.grant_types,
      response_types: data.response_types,
      scope: data.scope,
      token_endpoint_auth_method: data.token_endpoint_auth_method,
      // Add OAuth endpoints for client discovery
      authorization_endpoint: `${process.env.NEXTAUTH_URL}/api/oauth/authorize`,
      token_endpoint: `${process.env.NEXTAUTH_URL}/api/oauth/token`,
      revocation_endpoint: `${process.env.NEXTAUTH_URL}/api/oauth/revoke`,
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  } catch (error) {
    console.error('DCR error:', error);
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Internal server error during registration',
      },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      }
    );
  }
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }
  });
}

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414)
 * Provides discovery information about the OAuth server
 */
export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:12005';
  
  return NextResponse.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    revocation_endpoint: `${baseUrl}/api/oauth/revoke`,
    registration_endpoint: `${baseUrl}/api/oauth/client/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256', 'plain'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    scopes_supported: ['mcp:read', 'mcp:execute'],
    ui_locales_supported: ['en', 'tr', 'zh', 'hi', 'ja', 'nl'],
  }, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}