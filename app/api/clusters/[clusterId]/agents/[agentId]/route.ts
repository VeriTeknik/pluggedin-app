/**
 * Single Agent Proxy API - Queries collector for specific agent status
 *
 * GET /api/clusters/{clusterId}/agents/{agentId}
 *   - Proxies request to collector's GET /agents/{agentId}
 *   - Returns detailed status for a single agent
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { clustersTable } from '@/db/schema';

/**
 * GET /api/clusters/{clusterId}/agents/{agentId}
 *
 * Proxy to collector to get single agent status.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ clusterId: string; agentId: string }> }
) {
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
        },
        signal: AbortSignal.timeout(10000), // 10s timeout
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
