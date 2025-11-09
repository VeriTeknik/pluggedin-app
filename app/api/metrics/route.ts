/**
 * Prometheus Metrics Endpoint
 *
 * Exposes application metrics in Prometheus format.
 * Should be scraped by Prometheus every 30-60 seconds.
 *
 * Security:
 * - IP whitelisting via METRICS_ALLOWED_IPS environment variable
 * - Supports CIDR notation for Docker networks
 * - Defaults: 127.0.0.1, ::1, Docker networks
 *
 * Configuration in Prometheus:
 * ```yaml
 * - job_name: 'pluggedin-app'
 *   metrics_path: '/api/metrics'
 *   static_configs:
 *     - targets: ['app.plugged.in']
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMetrics } from '@/lib/metrics';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Check if an IP address is allowed to access metrics
 * Supports both exact IP matches and CIDR notation
 */
function isIpAllowed(clientIp: string | null): boolean {
  if (!clientIp) {
    console.warn('[Metrics] No client IP detected, denying access');
    return false;
  }

  // Get allowed IPs from environment variable
  // Default: localhost + common Docker networks
  const allowedIpsEnv = process.env.METRICS_ALLOWED_IPS || '127.0.0.1,::1,172.17.0.0/16,172.18.0.0/16,10.0.0.0/8';
  const allowedIps = allowedIpsEnv.split(',').map(ip => ip.trim());

  // Check exact IP match first
  if (allowedIps.includes(clientIp)) {
    return true;
  }

  // Check CIDR ranges
  for (const allowedIp of allowedIps) {
    if (allowedIp.includes('/')) {
      if (isIpInCidr(clientIp, allowedIp)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if an IP is within a CIDR range
 * Supports IPv4 only for simplicity
 */
function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);

    const ipNum = ipToNumber(ip);
    const rangeNum = ipToNumber(range);

    return (ipNum & mask) === (rangeNum & mask);
  } catch (error) {
    console.error('[Metrics] Invalid CIDR range:', cidr, error);
    return false;
  }
}

/**
 * Convert IPv4 address to number
 */
function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

/**
 * Extract client IP from request headers
 * Checks X-Forwarded-For, X-Real-IP, and connection
 */
function getClientIp(request: NextRequest): string | null {
  // Check X-Forwarded-For (proxy/load balancer)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take the first IP (original client)
    return forwardedFor.split(',')[0].trim();
  }

  // Check X-Real-IP (nginx)
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  // Fallback to direct connection IP (not available in Next.js edge runtime)
  return null;
}

export async function GET(request: NextRequest) {
  try {
    // Security: IP whitelisting
    const clientIp = getClientIp(request);

    if (!isIpAllowed(clientIp)) {
      console.warn('[Metrics] Unauthorized access attempt from IP:', clientIp);
      return NextResponse.json(
        { error: 'Forbidden - IP not whitelisted' },
        { status: 403 }
      );
    }

    const metrics = await getMetrics();

    return new NextResponse(metrics, {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[Metrics] Error generating metrics:', error);
    return NextResponse.json(
      { error: 'Failed to generate metrics' },
      { status: 500 }
    );
  }
}
