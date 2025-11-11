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
 * - Database connectivity
 *
 * Security:
 * - Basic health status accessible to all (for load balancers)
 * - Detailed info (version, environment) only for whitelisted IPs
 * - Uses same METRICS_ALLOWED_IPS as /api/metrics endpoint
 */

import { sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime?: number;  // Only for whitelisted IPs
  checks: {
    service: boolean;
    database: boolean;
  };
  version?: string;      // Only for whitelisted IPs
  environment?: string;  // Only for whitelisted IPs
}

/**
 * Check if IP is allowed to see detailed health info
 * Reuses same IP whitelist as /api/metrics for consistency
 */
function isMonitoringIp(clientIp: string | null): boolean {
  if (!clientIp) return false;

  const allowedIpsEnv = process.env.METRICS_ALLOWED_IPS || '127.0.0.1,::1,172.17.0.0/16,172.18.0.0/16';
  const allowedIps = allowedIpsEnv.split(',').map(ip => ip.trim());

  // Check exact match
  if (allowedIps.includes(clientIp)) {
    return true;
  }

  // Check CIDR ranges (simplified for health endpoint)
  for (const allowed of allowedIps) {
    if (allowed.includes('/')) {
      try {
        const [range, bits] = allowed.split('/');
        if (clientIp.includes(':') && range.includes(':')) {
          // Skip IPv6 CIDR for simplicity - rarely needed for health checks
          continue;
        }
        if (!clientIp.includes(':') && !range.includes(':')) {
          // Basic IPv4 CIDR check
          const mask = ~(2 ** (32 - parseInt(bits)) - 1);
          const ipToNum = (ip: string) => ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
          if ((ipToNum(clientIp) & mask) === (ipToNum(range) & mask)) {
            return true;
          }
        }
      } catch {
        continue;
      }
    }
  }

  return false;
}

/**
 * GET /api/health
 * Returns the health status of the application
 *
 * Expected polling frequency: Every 10-30 seconds by load balancers
 * Database query is lightweight (SELECT 1) and should complete in <100ms
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Extract client IP for access control
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const clientIp = forwardedFor?.split(',')[0]?.trim() || realIp || null;
  const isMonitoring = isMonitoringIp(clientIp);

  // Initialize health status (status set after checks)
  const healthStatus: HealthStatus = {
    status: 'healthy', // Will be updated after checks
    timestamp: new Date().toISOString(),
    checks: {
      service: true,
      database: false,
    },
  };

  // Only include detailed info for whitelisted monitoring IPs
  if (isMonitoring) {
    healthStatus.uptime = process.uptime();
    healthStatus.version = process.env.APP_VERSION || '2.18.0';
    healthStatus.environment = process.env.NODE_ENV || 'development';
  }

  // Check database connectivity
  try {
    // Simple query to check database is responsive
    await db.execute(sql`SELECT 1 as health_check`);
    healthStatus.checks.database = true;
  } catch (error) {
    // Sanitize error message to avoid leaking connection details
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Health Check] Database check failed:', errorMessage);
    healthStatus.checks.database = false;
  }

  // Determine overall status (single source of truth)
  const isHealthy = healthStatus.checks.service && healthStatus.checks.database;
  healthStatus.status = isHealthy ? 'healthy' : 'unhealthy';

  const statusCode = isHealthy ? 200 : 503;
  const duration = Date.now() - startTime;

  const response = NextResponse.json(healthStatus, { status: statusCode });

  // Add custom headers for monitoring
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
    // Sanitize error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Health Check] Database check failed (HEAD):', errorMessage);

    return new NextResponse(null, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
}
