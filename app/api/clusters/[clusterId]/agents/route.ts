/**
 * Cluster Agents Proxy API - Queries collector for agent status
 *
 * GET /api/clusters/{clusterId}/agents
 *   - Proxies request to collector's GET /agents
 *   - Returns agent status from collector's in-memory state
 *
 * GET /api/clusters/{clusterId}/agents/{agentId}
 *   - Proxies request to collector's GET /agents/{agentId}
 *   - Returns single agent status
 *
 * This is an "on-demand" query - only called when UI needs agent data.
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { authenticate } from '@/app/api/auth';
import { db } from '@/db';
import { clustersTable } from '@/db/schema';

/**
 * Timeout for collector requests in milliseconds.
 * Set to 10 seconds to allow for slow network conditions.
 */
const COLLECTOR_REQUEST_TIMEOUT_MS = 10_000;

/**
 * API key for authenticating with collectors.
 */
const COLLECTOR_API_KEY = process.env.PAP_COLLECTOR_API_KEY;

/**
 * Maximum response size from collector in bytes (5MB for agent list).
 * Prevents memory exhaustion from malicious/misconfigured collectors.
 */
const MAX_COLLECTOR_RESPONSE_BYTES = 5_242_880;

/**
 * GET /api/clusters/{clusterId}/agents
 *
 * Proxy to collector to get all agents.
 * Requires authenticated user.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clusterId: string }> }
) {
  // Authenticate the request
  const auth = await authenticate(request);
  if (auth.error) {
    return auth.error;
  }

  const { clusterId } = await params;

  try {
    // Find cluster
    const cluster = await db.query.clustersTable.findFirst({
      where: eq(clustersTable.cluster_id, clusterId),
    });

    if (!cluster) {
      return NextResponse.json(
        { error: 'Cluster not found' },
        { status: 404 }
      );
    }

    if (!cluster.collector_url) {
      return NextResponse.json(
        { error: 'Cluster has no collector configured' },
        { status: 503 }
      );
    }

    // Proxy request to collector
    const collectorResponse = await fetch(`${cluster.collector_url}/agents`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(COLLECTOR_API_KEY && { 'X-Collector-Key': COLLECTOR_API_KEY }),
      },
      signal: AbortSignal.timeout(COLLECTOR_REQUEST_TIMEOUT_MS),
    });

    if (!collectorResponse.ok) {
      console.error(
        `[Clusters] Collector returned ${collectorResponse.status} for ${clusterId}`
      );
      return NextResponse.json(
        { error: 'Collector unavailable', status: collectorResponse.status },
        { status: 502 }
      );
    }

    // Check response size before parsing
    const contentLength = collectorResponse.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_COLLECTOR_RESPONSE_BYTES) {
      console.error(
        `[Clusters] Collector response too large: ${contentLength} bytes for ${clusterId}`
      );
      return NextResponse.json(
        { error: 'Collector response too large' },
        { status: 502 }
      );
    }

    const data = await collectorResponse.json();

    // Update cluster stats from collector response
    if (data.stats) {
      await db
        .update(clustersTable)
        .set({
          agent_count: data.stats.total,
          healthy_agent_count: data.stats.healthy,
          last_seen_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(clustersTable.uuid, cluster.uuid));
    }

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Collector request timed out' },
        { status: 504 }
      );
    }

    console.error('[Clusters] Error proxying to collector:', error);
    return NextResponse.json(
      { error: 'Failed to contact collector' },
      { status: 502 }
    );
  }
}
