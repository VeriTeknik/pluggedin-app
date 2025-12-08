import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import {
  agentsTable,
  agentLifecycleEventsTable,
  agentHeartbeatsTable,
  agentMetricsTable,
} from '@/db/schema';

import { authenticate } from '../../../auth';
import { kubernetesService } from '@/lib/services/kubernetes-service';

// Convert BigInt and Date values for JSON serialization
const serializeForJson = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serializeForJson);
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      result[key] = serializeForJson(obj[key]);
    }
    return result;
  }
  return obj;
};

/**
 * @swagger
 * /api/agents/{id}/export:
 *   post:
 *     summary: Export PAP agent configuration and state to backup
 *     description: |
 *       Exports complete agent snapshot including:
 *       - Agent configuration (name, DNS, image, resources)
 *       - Current state and metadata
 *       - Lifecycle events (audit trail)
 *       - Optional: Recent heartbeats and metrics history
 *       - Kubernetes deployment configuration
 *
 *       Export format is JSON, suitable for disaster recovery or migration.
 *     tags:
 *       - PAP Agents
 *     security:
 *       - apiKey: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The UUID of the agent
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               include_telemetry:
 *                 type: boolean
 *                 description: Include heartbeat and metrics history (default false)
 *                 default: false
 *               telemetry_limit:
 *                 type: integer
 *                 description: Number of telemetry records to include (default 100)
 *                 default: 100
 *                 minimum: 1
 *                 maximum: 10000
 *     responses:
 *       200:
 *         description: Successfully exported agent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 export_version:
 *                   type: string
 *                   description: PAP export format version
 *                 exported_at:
 *                   type: string
 *                   format: date-time
 *                 agent:
 *                   type: object
 *                 lifecycle_events:
 *                   type: array
 *                 kubernetes_config:
 *                   type: object
 *                   nullable: true
 *                 telemetry:
 *                   type: object
 *                   nullable: true
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       404:
 *         description: Not Found - Agent does not exist.
 *       500:
 *         description: Internal Server Error - Failed to export agent.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const { id: agentId } = await params;

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const includeTelemetry = body.include_telemetry ?? false;
    const telemetryLimit = body.telemetry_limit || 100;

    // Validate telemetry limit
    if (telemetryLimit < 1 || telemetryLimit > 10000) {
      return NextResponse.json(
        { error: 'telemetry_limit must be between 1 and 10000' },
        { status: 400 }
      );
    }

    // Fetch agent
    const agents = await db
      .select()
      .from(agentsTable)
      .where(
        and(
          eq(agentsTable.uuid, agentId),
          eq(agentsTable.profile_uuid, auth.activeProfile.uuid)
        )
      )
      .limit(1);

    if (agents.length === 0) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    const agent = agents[0];

    // Fetch lifecycle events (complete audit trail)
    const lifecycleEvents = await db
      .select()
      .from(agentLifecycleEventsTable)
      .where(eq(agentLifecycleEventsTable.agent_uuid, agentId))
      .orderBy(desc(agentLifecycleEventsTable.timestamp));

    // Get Kubernetes deployment configuration
    let kubernetesConfig = null;
    if (agent.kubernetes_deployment) {
      const deploymentStatus = await kubernetesService.getDeploymentStatus(
        agent.kubernetes_deployment,
        agent.kubernetes_namespace || 'agents'
      );

      if (deploymentStatus) {
        kubernetesConfig = {
          deployment_name: agent.kubernetes_deployment,
          namespace: agent.kubernetes_namespace || 'agents',
          status: deploymentStatus,
          // Configuration can be restored from agent.metadata
        };
      }
    }

    // Build export object
    const exportData: {
      export_version: string;
      exported_at: string;
      agent: typeof agent;
      lifecycle_events: typeof lifecycleEvents;
      kubernetes_config: typeof kubernetesConfig;
      telemetry?: {
        heartbeats: unknown[];
        metrics: unknown[];
      };
    } = {
      export_version: 'pap-export/1.0',
      exported_at: new Date().toISOString(),
      agent,
      lifecycle_events: lifecycleEvents,
      kubernetes_config: kubernetesConfig,
    };

    // Optionally include telemetry history
    if (includeTelemetry) {
      const heartbeats = await db
        .select()
        .from(agentHeartbeatsTable)
        .where(eq(agentHeartbeatsTable.agent_uuid, agentId))
        .orderBy(desc(agentHeartbeatsTable.timestamp))
        .limit(telemetryLimit);

      const metrics = await db
        .select()
        .from(agentMetricsTable)
        .where(eq(agentMetricsTable.agent_uuid, agentId))
        .orderBy(desc(agentMetricsTable.timestamp))
        .limit(telemetryLimit);

      exportData.telemetry = {
        heartbeats,
        metrics,
      };
    }

    // Log lifecycle event for audit trail
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: agentId,
      event_type: 'EXPORTED',
      from_state: agent.state,
      to_state: agent.state, // State doesn't change on export
      metadata: {
        triggered_by: auth.user.id,
        include_telemetry: includeTelemetry,
        telemetry_records: includeTelemetry
          ? {
              heartbeats: exportData.telemetry?.heartbeats.length || 0,
              metrics: exportData.telemetry?.metrics.length || 0,
            }
          : null,
      },
    });

    return NextResponse.json(serializeForJson(exportData));
  } catch (error) {
    console.error('Error exporting agent:', error);
    return NextResponse.json(
      { error: 'Failed to export agent' },
      { status: 500 }
    );
  }
}
