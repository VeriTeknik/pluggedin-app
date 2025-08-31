import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { oauthProvider } from '@/lib/oauth/provider';
import { RateLimiters } from '@/lib/rate-limiter';
import { getCorsHeaders, getSecurityHeaders } from '@/lib/oauth/cors';

// Token revocation request schema (RFC 7009)
const revokeRequestSchema = z.object({
  token: z.string(),
  token_type_hint: z.enum(['access_token', 'refresh_token']).optional(),
  client_id: z.string(),
  client_secret: z.string().optional(),
});

/**
 * OAuth 2.0 Token Revocation endpoint (RFC 7009)
 * Allows clients to revoke access and refresh tokens
 */
export async function POST(request: NextRequest) {
  // Apply rate limiting for revocation requests
  const rateLimitResult = await RateLimiters.registryOAuth(request);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: 'rate_limit_exceeded',
        error_description: 'Too many revocation requests. Please try again later.',
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

    // Validate request
    const validatedData = revokeRequestSchema.parse({
      ...body,
      client_id: clientId,
      client_secret: clientSecret,
    });

    // Validate client credentials
    const clientValidation = await oauthProvider.validateClient(
      validatedData.client_id,
      validatedData.client_secret
    );
    
    if (!clientValidation.valid) {
      // Per RFC 7009, invalid client credentials should return 401
      return NextResponse.json(
        { error: 'invalid_client' },
        { status: 401 }
      );
    }

    // Revoke the token
    const result = await oauthProvider.revokeToken(validatedData.token);
    
    // Per RFC 7009, the server responds with HTTP 200 regardless of whether
    // the token was found or not (to prevent token scanning attacks)
    const origin = request.headers.get('origin');
    return new NextResponse(null, { 
      status: 200,
      headers: {
        ...getCorsHeaders(origin),
        ...getSecurityHeaders(),
      }
    });
  } catch (error) {
    console.error('Token revocation error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Invalid revocation request parameters',
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    }
  });
}