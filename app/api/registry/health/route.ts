import { NextRequest, NextResponse } from 'next/server';

import { PluggedinRegistryClient } from '@/lib/registry/pluggedin-registry-client';
import { RateLimiters } from '@/lib/rate-limiter';
import { createErrorResponse, getSafeErrorMessage } from '@/lib/api-errors';

export async function GET(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await RateLimiters.api(request);
  
  if (!rateLimitResult.allowed) {
    const response = createErrorResponse('Too many requests', 429, 'RATE_LIMIT_EXCEEDED');
    // Add rate limit headers
    response.headers.set('X-RateLimit-Limit', rateLimitResult.limit.toString());
    response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    response.headers.set('X-RateLimit-Reset', rateLimitResult.reset.toString());
    response.headers.set('Retry-After', Math.ceil((rateLimitResult.reset - Date.now()) / 1000).toString());
    return response;
  }
  try {
    const client = new PluggedinRegistryClient();
    const isHealthy = await client.healthCheck();
    
    return NextResponse.json({
      status: isHealthy ? 'ok' : 'error',
      registry_url: process.env.REGISTRY_API_URL || 'https://registry.plugged.in/v0'
    });
  } catch (error) {
    console.error('Registry health check failed:', error);
    return createErrorResponse(
      getSafeErrorMessage(error),
      503,
      'REGISTRY_UNAVAILABLE'
    );
  }
}