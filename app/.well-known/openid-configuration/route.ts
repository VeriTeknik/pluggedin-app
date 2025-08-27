import { NextResponse } from 'next/server';

/**
 * OpenID Connect Discovery endpoint
 * OpenID Connect Discovery 1.0 compliant
 * https://openid.net/specs/openid-connect-discovery-1_0.html
 */
export async function GET() {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:12005';
  
  const configuration = {
    // Required OpenID Provider Metadata
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    userinfo_endpoint: `${baseUrl}/api/oauth/userinfo`,
    jwks_uri: `${baseUrl}/api/oauth/jwks`,
    
    // Recommended fields
    registration_endpoint: `${baseUrl}/api/oauth/client/register`,
    scopes_supported: [
      'openid',
      'profile',
      'email',
      'mcp:read',
      'mcp:execute',
      'mcp:write',
      'offline_access'
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
    
    acr_values_supported: [
      'urn:mace:incommon:iap:silver',
      'urn:mace:incommon:iap:bronze'
    ],
    
    subject_types_supported: [
      'public',
      'pairwise'
    ],
    
    id_token_signing_alg_values_supported: [
      'RS256',
      'HS256'
    ],
    
    id_token_encryption_alg_values_supported: [
      'RSA1_5',
      'RSA-OAEP',
      'A128KW',
      'A256KW'
    ],
    
    id_token_encryption_enc_values_supported: [
      'A128CBC-HS256',
      'A256CBC-HS512',
      'A128GCM',
      'A256GCM'
    ],
    
    userinfo_signing_alg_values_supported: [
      'RS256',
      'HS256'
    ],
    
    request_object_signing_alg_values_supported: [
      'RS256',
      'HS256'
    ],
    
    token_endpoint_auth_methods_supported: [
      'client_secret_post',
      'client_secret_basic',
      'client_secret_jwt',
      'private_key_jwt',
      'none'
    ],
    
    token_endpoint_auth_signing_alg_values_supported: [
      'RS256',
      'HS256'
    ],
    
    display_values_supported: [
      'page',
      'popup',
      'touch',
      'wap'
    ],
    
    claim_types_supported: [
      'normal',
      'distributed'
    ],
    
    claims_supported: [
      'sub',
      'iss',
      'auth_time',
      'name',
      'given_name',
      'family_name',
      'preferred_username',
      'email',
      'email_verified',
      'profile',
      'picture',
      'locale',
      'profile_uuid',
      'profile_name',
      'project_uuid',
      'project_name'
    ],
    
    service_documentation: `${baseUrl}/docs/api-reference`,
    
    claims_locales_supported: [
      'en',
      'tr',
      'zh',
      'hi',
      'ja',
      'nl'
    ],
    
    ui_locales_supported: [
      'en',
      'tr',
      'zh',
      'hi',
      'ja',
      'nl'
    ],
    
    claims_parameter_supported: true,
    request_parameter_supported: true,
    request_uri_parameter_supported: true,
    require_request_uri_registration: false,
    
    op_policy_uri: `${baseUrl}/legal/privacy-policy`,
    op_tos_uri: `${baseUrl}/legal/terms-of-service`,
    
    // Additional endpoints
    revocation_endpoint: `${baseUrl}/api/oauth/revoke`,
    introspection_endpoint: `${baseUrl}/api/oauth/introspect`,
    
    // PKCE support
    code_challenge_methods_supported: [
      'S256',
      'plain'
    ],
    
    // MCP-specific extensions
    mcp_endpoints: {
      tools_list: `${baseUrl}/mcp`,
      tools_execute: `${baseUrl}/mcp`,
      resource_endpoint: `${baseUrl}/api/mcp`,
      oauth_callback: `${baseUrl}/api/mcp/oauth/callback`
    }
  };

  return NextResponse.json(configuration, {
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