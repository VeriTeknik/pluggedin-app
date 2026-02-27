/**
 * Cluster Alerts API - Receives alerts from PAP Heartbeat Collectors
 *
 * POST /api/clusters/{clusterId}/alerts
 *   - Receives alerts from collectors when agents die, enter EMERGENCY, or restart
 *   - Authenticated via Bearer token (collector API key)
 *
 * GET /api/clusters/{clusterId}/alerts
 *   - List alerts for a cluster
 *   - Requires session auth (admin only)
 */

import { and,desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { authenticate } from '@/app/api/auth';
import { db } from '@/db';
import { AlertSeverity,clusterAlertsTable, ClusterAlertType, clustersTable } from '@/db/schema';

// Collector API key from environment
const COLLECTOR_API_KEY = process.env.PAP_COLLECTOR_API_KEY;

// Validation schema for incoming alerts
const alertSchema = z.object({
  type: z.enum(['AGENT_DEATH', 'EMERGENCY_MODE', 'RESTART_DETECTED']),
  agent_uuid: z.string().uuid(),
  agent_name: z.string(),
  cluster_id: z.string(),
  severity: z.enum(['critical', 'warning', 'info']),
  details: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
});

/**
 * Validate collector API key using constant-time comparison.
 * SECURITY: Prevents timing attacks by ensuring comparison time is constant
 * regardless of key length differences or match position.
 */
function validateCollectorAuth(authHeader: string | null): boolean {
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7).trim();

  // If no collector key is configured, reject all requests
  if (!COLLECTOR_API_KEY) {
    console.warn('[Clusters] PAP_COLLECTOR_API_KEY not configured - rejecting alert');
    return false;
  }

  // SECURITY: Constant-time comparison that handles different lengths
  // XOR the lengths first (different lengths will always fail)
  // Then iterate over max length to prevent timing leakage
  const maxLength = Math.max(token.length, COLLECTOR_API_KEY.length);
  let result = token.length ^ COLLECTOR_API_KEY.length;

  for (let i = 0; i < maxLength; i++) {
    const a = i < token.length ? token.charCodeAt(i) : 0;
    const b = i < COLLECTOR_API_KEY.length ? COLLECTOR_API_KEY.charCodeAt(i) : 0;
    result |= a ^ b;
  }

  return result === 0;
}

/**
 * POST /api/clusters/{clusterId}/alerts
 *
 * Receive an alert from a collector.
 * Authentication: Bearer token matching PAP_COLLECTOR_API_KEY
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ clusterId: string }> }
) {
  const { clusterId } = await params;

  // Validate Authorization header
  const authHeader = request.headers.get('authorization');
  if (!validateCollectorAuth(authHeader)) {
    return NextResponse.json(
      { error: 'Invalid or missing collector API key' },
      { status: 401 }
    );
  }

  // Check request size to prevent DoS from massive payloads
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > 10_000) {
    return NextResponse.json(
      { error: 'Request body too large' },
      { status: 413 }
    );
  }

  try {
    const body = await request.json();
    const validatedAlert = alertSchema.parse(body);

    // Verify cluster_id matches URL
    if (validatedAlert.cluster_id !== clusterId) {
      return NextResponse.json(
        { error: 'Cluster ID mismatch' },
        { status: 400 }
      );
    }

    // Find or create cluster
    let cluster = await db.query.clustersTable.findFirst({
      where: eq(clustersTable.cluster_id, clusterId),
    });

    if (!cluster) {
      // Auto-register cluster on first alert
      const [newCluster] = await db
        .insert(clustersTable)
        .values({
          cluster_id: clusterId,
          name: clusterId,
          last_alert_at: new Date(),
          last_seen_at: new Date(),
        })
        .returning();
      cluster = newCluster;
      console.log(`[Clusters] Auto-registered new cluster: ${clusterId}`);
    } else {
      // Update last_alert_at
      await db
        .update(clustersTable)
        .set({
          last_alert_at: new Date(),
          last_seen_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(clustersTable.uuid, cluster.uuid));
    }

    // Store the alert
    const [alert] = await db
      .insert(clusterAlertsTable)
      .values({
        cluster_uuid: cluster.uuid,
        alert_type: validatedAlert.type as ClusterAlertType,
        agent_uuid: validatedAlert.agent_uuid,
        agent_name: validatedAlert.agent_name,
        severity: validatedAlert.severity as AlertSeverity,
        details: validatedAlert.details || {},
        alert_timestamp: new Date(validatedAlert.timestamp),
      })
      .returning();

    console.log(
      `[Clusters] Alert received: ${validatedAlert.type} for agent ${validatedAlert.agent_name} in cluster ${clusterId}`
    );

    return NextResponse.json({
      received: true,
      alert_uuid: alert.uuid,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid alert payload', details: error.errors },
        { status: 400 }
      );
    }

    console.error('[Clusters] Error processing alert:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/clusters/{clusterId}/alerts
 *
 * List alerts for a cluster.
 * Query params:
 *   - limit: number (default 50)
 *   - acknowledged: boolean (filter by acknowledgement status)
 *   - severity: 'critical' | 'warning' | 'info'
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
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const acknowledged = url.searchParams.get('acknowledged');
  const severity = url.searchParams.get('severity');

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

    // Build query conditions
    const conditions = [eq(clusterAlertsTable.cluster_uuid, cluster.uuid)];

    if (acknowledged !== null) {
      conditions.push(eq(clusterAlertsTable.acknowledged, acknowledged === 'true'));
    }

    if (severity) {
      conditions.push(eq(clusterAlertsTable.severity, severity as AlertSeverity));
    }

    // Fetch alerts
    const alerts = await db
      .select()
      .from(clusterAlertsTable)
      .where(and(...conditions))
      .orderBy(desc(clusterAlertsTable.created_at))
      .limit(limit);

    return NextResponse.json({
      cluster_id: clusterId,
      cluster_name: cluster.name,
      alerts,
      total: alerts.length,
    });
  } catch (error) {
    console.error('[Clusters] Error fetching alerts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
