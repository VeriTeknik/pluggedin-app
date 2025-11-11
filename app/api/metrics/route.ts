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
  // Default: localhost + Docker networks only (restrictive for security)
  // PRODUCTION: Set METRICS_ALLOWED_IPS in .env with your Grafana/Prometheus server IPs
  // Example: METRICS_ALLOWED_IPS="127.0.0.1,::1,172.17.0.0/16,172.18.0.0/16,10.0.0.0/8,185.96.168.253/32"
  const allowedIpsEnv = process.env.METRICS_ALLOWED_IPS || '127.0.0.1,::1,172.17.0.0/16,172.18.0.0/16';
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
 * Supports both IPv4 and IPv6
 */
function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    // Detect IPv6
    if (ip.includes(':') || cidr.includes(':')) {
      return isIpv6InCidr(ip, cidr);
    }

    // IPv4 validation
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
 * Check if an IPv6 address is within a CIDR range
 */
function isIpv6InCidr(ip: string, cidr: string): boolean {
  try {
    const [range, bits] = cidr.split('/');
    const prefixLength = parseInt(bits);

    // Expand and normalize IPv6 addresses
    const ipExpanded = expandIPv6(ip);
    const rangeExpanded = expandIPv6(range);

    if (!ipExpanded || !rangeExpanded) {
      return false;
    }

    // Convert to binary string for comparison
    const ipBinary = ipv6ToBinary(ipExpanded);
    const rangeBinary = ipv6ToBinary(rangeExpanded);

    // Compare prefix bits
    return ipBinary.substring(0, prefixLength) === rangeBinary.substring(0, prefixLength);
  } catch (error) {
    console.error('[Metrics] Invalid IPv6 CIDR range:', cidr, error);
    return false;
  }
}

/**
 * Expand IPv6 address to full notation
 * Example: ::1 -> 0000:0000:0000:0000:0000:0000:0000:0001
 */
function expandIPv6(ip: string): string | null {
  try {
    // Handle IPv4-mapped IPv6 addresses (::ffff:192.0.2.1)
    if (ip.includes('.')) {
      const ipv4Match = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/i);
      if (ipv4Match) {
        const ipv4 = ipv4Match[1];
        const ipv4Hex = ipv4.split('.').map(octet =>
          parseInt(octet).toString(16).padStart(2, '0')
        ).join('');
        ip = `0000:0000:0000:0000:0000:ffff:${ipv4Hex.substring(0, 4)}:${ipv4Hex.substring(4)}`;
      }
    }

    // Split on '::'
    const parts = ip.split('::');

    if (parts.length > 2) {
      return null; // Invalid: more than one '::'
    }

    let left: string[] = [];
    let right: string[] = [];

    if (parts.length === 1) {
      // No '::' compression
      left = parts[0].split(':');
    } else {
      // Handle '::' compression
      left = parts[0] ? parts[0].split(':') : [];
      right = parts[1] ? parts[1].split(':') : [];
    }

    // Calculate missing segments
    const missingSegments = 8 - (left.length + right.length);
    const middle = Array(missingSegments).fill('0000');

    // Combine all segments
    const allSegments = [...left, ...middle, ...right];

    // Pad each segment to 4 hex digits
    return allSegments.map(seg => seg.padStart(4, '0')).join(':');
  } catch (error) {
    return null;
  }
}

/**
 * Convert expanded IPv6 address to binary string
 */
function ipv6ToBinary(expandedIp: string): string {
  return expandedIp
    .split(':')
    .map(segment => parseInt(segment, 16).toString(2).padStart(16, '0'))
    .join('');
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
