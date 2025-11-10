/**
 * Health Check Endpoint for Prometheus and Load Balancers
 *
 * This endpoint provides basic health status for monitoring systems.
 * Used by Prometheus for liveness/readiness probes and load balancers.
 *
 * Returns:
 * - 200 OK: Service is healthy
 * - 503 Service Unavailable: Service has issues
 *
 * Checks:
 * - Service availability (always true if responding)
 * - Database connectivity (optional, can be extended)
 */

import { NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    service: boolean;
    database: boolean;
  };
  version?: string;
  environment?: string;
}

/**
 * GET /api/health
 * Returns the health status of the application
 */
export async function GET() {
  const startTime = Date.now();

  const healthStatus: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      service: true,
      database: false,
    },
    version: process.env.APP_VERSION || '2.18.0',
    environment: process.env.NODE_ENV || 'development',
  };

  // Check database connectivity
  try {
    // Simple query to check database is responsive
    await db.execute(sql`SELECT 1 as health_check`);
    healthStatus.checks.database = true;
  } catch (error) {
    console.error('Database health check failed:', error);
    healthStatus.checks.database = false;
    healthStatus.status = 'unhealthy';
  }

  // Determine overall status
  const isHealthy = healthStatus.checks.service && healthStatus.checks.database;
  healthStatus.status = isHealthy ? 'healthy' : 'unhealthy';

  const statusCode = isHealthy ? 200 : 503;
  const duration = Date.now() - startTime;

  const response = NextResponse.json(healthStatus, { status: statusCode });

  // Add custom headers for debugging
  response.headers.set('X-Health-Check-Duration', `${duration}ms`);
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');

  return response;
}

/**
 * HEAD /api/health
 * Lightweight health check (no body)
 * Useful for load balancers that only need status code
 */
export async function HEAD() {
  try {
    // Quick database check
    await db.execute(sql`SELECT 1 as health_check`);

    return new NextResponse(null, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    return new NextResponse(null, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
}
