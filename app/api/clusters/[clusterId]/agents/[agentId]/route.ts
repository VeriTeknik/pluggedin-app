/**
 * Single Agent Proxy API - Queries collector for specific agent status
 *
 * GET /api/clusters/{clusterId}/agents/{agentId}
 *   - Proxies request to collector's GET /agents/{agentId}
 *   - Returns detailed status for a single agent
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
 * Maximum response size from collector in bytes (1MB).
 * Prevents memory exhaustion from malicious/misconfigured collectors.
 */
const MAX_COLLECTOR_RESPONSE_BYTES = 1_048_576;

/**
 * GET /api/clusters/{clusterId}/agents/{agentId}
 *
 * Proxy to collector to get single agent status.
 * Requires authenticated user.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clusterId: string; agentId: string }> }
) {
  // Authenticate the request
  const auth = await authenticate(request);
  if (auth.error) {
    return auth.error;
  }

  const { clusterId, agentId } = await params;

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
    const collectorResponse = await fetch(
      `${cluster.collector_url}/agents/${agentId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(COLLECTOR_API_KEY && { 'X-Collector-Key': COLLECTOR_API_KEY }),
        },
        signal: AbortSignal.timeout(COLLECTOR_REQUEST_TIMEOUT_MS),
      }
    );

    if (!collectorResponse.ok) {
      if (collectorResponse.status === 404) {
        return NextResponse.json(
          { error: 'Agent not found in collector' },
          { status: 404 }
        );
      }

      console.error(
        `[Clusters] Collector returned ${collectorResponse.status} for agent ${agentId}`
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
        `[Clusters] Collector response too large: ${contentLength} bytes for agent ${agentId}`
      );
      return NextResponse.json(
        { error: 'Collector response too large' },
        { status: 502 }
      );
    }

    const data = await collectorResponse.json();
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
