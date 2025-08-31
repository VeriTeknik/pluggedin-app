import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { oauthProvider } from '@/lib/oauth/provider';
import { RateLimiters } from '@/lib/rate-limiter';
import { getCorsHeaders, getSecurityHeaders } from '@/lib/oauth/cors';

// Token request schema
const tokenRequestSchema = z.discriminatedUnion('grant_type', [
  // Authorization code grant
  z.object({
    grant_type: z.literal('authorization_code'),
    code: z.string(),
    redirect_uri: z.string().url(),
    client_id: z.string(),
    client_secret: z.string().optional(),
    code_verifier: z.string().optional(), // PKCE
  }),
  // Refresh token grant
  z.object({
    grant_type: z.literal('refresh_token'),
    refresh_token: z.string(),
    client_id: z.string(),
    client_secret: z.string().optional(),
  }),
]);

/**
 * OAuth 2.0 Token endpoint
 * Exchanges authorization codes for access tokens
 */
export async function POST(request: NextRequest) {
  // Apply rate limiting for token requests (stricter than authorization)
  const rateLimitResult = await RateLimiters.sensitive(request);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: 'rate_limit_exceeded',
        error_description: 'Too many token requests. Please try again later.',
      },
      { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': rateLimitResult.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': new Date(rateLimitResult.reset).toISOString(),
        }
      }
    );
  }

  try {
    // Parse request based on content type
    let body: any;
    const contentType = request.headers.get('content-type');
    
    if (contentType?.includes('application/x-www-form-urlencoded')) {
      const text = await request.text();
      const params = new URLSearchParams(text);
      body = Object.fromEntries(params.entries());
    } else {
      body = await request.json();
    }

    // Also check for Basic Auth in headers
    const authHeader = request.headers.get('authorization');
    let clientId = body.client_id;
    let clientSecret = body.client_secret;
    
    if (authHeader?.startsWith('Basic ')) {
      const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
      const [basicClientId, basicClientSecret] = credentials.split(':');
      clientId = clientId || basicClientId;
      clientSecret = clientSecret || basicClientSecret;
    }

    // Update body with extracted credentials
    body.client_id = clientId;
    body.client_secret = clientSecret;

    // Log the request for debugging
    console.log('Token request body:', body);
    
    // Validate request
    const validationResult = tokenRequestSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('Token validation failed:', validationResult.error.errors);
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Invalid token request: ' + validationResult.error.errors.map(e => e.message).join(', '),
        },
        { 
          status: 400,
          headers: {
            ...getCorsHeaders(request.headers.get('origin')),
            ...getSecurityHeaders(),
          }
        }
      );
    }

    const data = validationResult.data;

    // For PKCE flows (with code_verifier), client_secret is optional
    // Only validate client_secret if it's provided or if there's no code_verifier
    const isPKCEFlow = data.grant_type === 'authorization_code' && data.code_verifier;
    
    // Validate client - for PKCE, don't require client_secret
    const clientValidation = await oauthProvider.validateClient(
      data.client_id,
      isPKCEFlow ? undefined : data.client_secret
    );
    
    if (!clientValidation.valid) {
      console.error('Client validation failed:', clientValidation.error);
      return NextResponse.json(
        {
          error: 'invalid_client',
          error_description: clientValidation.error,
        },
        { 
          status: 401,
          headers: {
            ...getCorsHeaders(request.headers.get('origin')),
            ...getSecurityHeaders(),
          }
        }
      );
    }

    // Handle different grant types
    if (data.grant_type === 'authorization_code') {
      const result = await oauthProvider.exchangeCodeForTokens({
        code: data.code,
        clientId: data.client_id,
        clientSecret: data.client_secret,
        redirectUri: data.redirect_uri,
        codeVerifier: data.code_verifier,
      });

      if (!result.success) {
        console.error('Token exchange failed:', result.error);
        return NextResponse.json(
          {
            error: 'invalid_grant',
            error_description: result.error,
          },
          { 
            status: 400,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            }
          }
        );
      }

      return NextResponse.json(result.tokens, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Cache-Control': 'no-store',
        }
      });
    }

    if (data.grant_type === 'refresh_token') {
      const result = await oauthProvider.refreshAccessToken(
        data.refresh_token,
        data.client_id
      );

      if (!result.success) {
        return NextResponse.json(
          {
            error: 'invalid_grant',
            error_description: result.error,
          },
          { 
            status: 400,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            }
          }
        );
      }

      return NextResponse.json(result.tokens, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Cache-Control': 'no-store',
        }
      });
    }

    // Should not reach here due to discriminated union
    return NextResponse.json(
      {
        error: 'unsupported_grant_type',
        error_description: 'Grant type not supported',
      },
      { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      }
    );
  } catch (error) {
    console.error('Token endpoint error:', error);
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Internal server error',
      },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      }
    );
  }
}

/**
 * OPTIONS handler for CORS
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}