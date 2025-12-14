/**
 * Model Router Token Exchange
 *
 * Agents call this endpoint with their API key to get:
 * 1. A short-lived JWT token for authenticating with model router services
 * 2. The optimal service URL based on the requested model and region
 * 3. Expected latency and service information
 *
 * @route POST /api/v1/auth/model-router-token
 */

import { SignJWT } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticateApiKey } from '@/app/api/auth';
import {
  getBestServiceForModel,
  getAllServicesForModel,
} from '@/lib/services/service-router';

// Token configuration
const TOKEN_TTL_SECONDS = 300; // 5 minutes

// Get JWT secret from environment
function getJwtSecret(): Uint8Array {
  const secret = process.env.MODEL_ROUTER_JWT_SECRET;
  if (!secret) {
    throw new Error('MODEL_ROUTER_JWT_SECRET environment variable is required');
  }
  return new TextEncoder().encode(secret);
}

// Request validation schema
const tokenRequestSchema = z.object({
  model: z.string().min(1).optional(), // Model to route (optional, for optimal routing)
  region: z.string().optional(), // Preferred region
  capabilities: z.array(z.string()).optional(), // Required capabilities
});

/**
 * POST /api/v1/auth/model-router-token
 *
 * Exchange API key for a short-lived JWT token and optimal service URL
 */
export async function POST(request: NextRequest) {
  // Authenticate using API key
  const auth = await authenticateApiKey(request);
  if (auth.error) {
    return auth.error;
  }

  try {
    // Parse request body (may be empty)
    const body = await request.json().catch(() => ({}));
    const validated = tokenRequestSchema.parse(body);

    // Get JWT secret
    let jwtSecret: Uint8Array;
    try {
      jwtSecret = getJwtSecret();
    } catch (error) {
      console.error('[Token Exchange] JWT secret not configured:', error);
      return NextResponse.json(
        { error: 'Model router not configured' },
        { status: 503 }
      );
    }

    // Find optimal service if model is specified
    let serviceInfo: {
      service_uuid: string;
      service_url: string;
      service_name: string;
      latency_ms: number;
      region: string | null;
    } | null = null;

    let allServices: Array<{
      service_uuid: string;
      service_url: string;
      service_name: string;
      latency_ms: number;
    }> = [];

    if (validated.model) {
      // Get best service for this model
      serviceInfo = await getBestServiceForModel(validated.model, {
        preferredRegion: validated.region,
        requiredCapabilities: validated.capabilities,
      });

      if (!serviceInfo) {
        return NextResponse.json(
          {
            error: 'No available service for model',
            model: validated.model,
          },
          { status: 503 }
        );
      }

      // Get all available services for fallback
      allServices = await getAllServicesForModel(validated.model, {
        preferredRegion: validated.region,
        requiredCapabilities: validated.capabilities,
      });
    }

    // Generate JWT token
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      sub: auth.user.id,
      profile_uuid: auth.activeProfile.uuid,
      tier: 'standard', // TODO: Get from subscription tier
      model: validated.model,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + TOKEN_TTL_SECONDS)
      .setIssuer('plugged.in')
      .setAudience('model-router')
      .sign(jwtSecret);

    // Build response
    const response: {
      token: string;
      expires_in: number;
      token_type: string;
      model_router_url?: string;
      service_name?: string;
      expected_latency_ms?: number;
      region?: string | null;
      fallback_services?: Array<{
        url: string;
        name: string;
        latency_ms: number;
      }>;
    } = {
      token,
      expires_in: TOKEN_TTL_SECONDS,
      token_type: 'Bearer',
    };

    // Add service info if model was specified
    if (serviceInfo) {
      response.model_router_url = serviceInfo.service_url;
      response.service_name = serviceInfo.service_name;
      response.expected_latency_ms = serviceInfo.latency_ms;
      response.region = serviceInfo.region;

      // Add fallback services (excluding primary)
      if (allServices.length > 1) {
        response.fallback_services = allServices
          .slice(1, 4) // Max 3 fallbacks
          .map((s) => ({
            url: s.service_url,
            name: s.service_name,
            latency_ms: s.latency_ms,
          }));
      }
    }

    console.log(
      `[Token Exchange] Token issued for user ${auth.user.id}` +
        (validated.model ? `, model: ${validated.model}` : '') +
        (serviceInfo ? `, service: ${serviceInfo.service_name}` : '')
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Token Exchange] Error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: error.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/auth/model-router-token
 *
 * Get info about the token exchange endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/v1/auth/model-router-token',
    method: 'POST',
    description:
      'Exchange API key for a short-lived JWT token for model router authentication',
    request: {
      headers: {
        Authorization: 'Bearer <api_key>',
        'Content-Type': 'application/json',
      },
      body: {
        model: 'string (optional) - Model ID for optimal service routing',
        region: 'string (optional) - Preferred region (e.g., us-east, eu-west)',
        capabilities:
          'string[] (optional) - Required capabilities (e.g., streaming, vision)',
      },
    },
    response: {
      token: 'string - JWT token for model router authentication',
      expires_in: 'number - Token TTL in seconds (300)',
      token_type: 'string - Always "Bearer"',
      model_router_url: 'string (if model specified) - Optimal service URL',
      service_name: 'string (if model specified) - Service name',
      expected_latency_ms: 'number (if model specified) - Expected latency',
      fallback_services:
        'array (if model specified) - Alternative services for retry',
    },
  });
}
