import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import {
  agentsTable,
  agentLifecycleEventsTable,
  agentHeartbeatsTable,
  agentMetricsTable,
} from '@/db/schema';

import { authenticate } from '../../../auth';
import { kubernetesService } from '@/lib/services/kubernetes-service';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';
import { serializeForJson } from '@/lib/serialize-for-json';
import { redactSensitiveMetadata } from '@/lib/agent-helpers';

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Apply rate limiting (resource-intensive operation)
    const rateLimitResult = await EnhancedRateLimiters.agentIntensive(request);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rateLimitResult.retryAfter },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfter || 60),
            'X-RateLimit-Limit': String(rateLimitResult.limit),
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
            'X-RateLimit-Reset': new Date(rateLimitResult.reset).toISOString(),
          },
        }
      );
    }

    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const { id: agentId } = await params;

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const includeTelemetry = body.include_telemetry ?? false;
    const rawTelemetryLimit = body.telemetry_limit;

    // Validate telemetry_limit BEFORE using it
    // SECURITY: Ensure integer type to prevent injection via Drizzle's .limit()
    const telemetryLimit = rawTelemetryLimit === undefined ? 100 : rawTelemetryLimit;
    if (
      typeof telemetryLimit !== 'number' ||
      !Number.isInteger(telemetryLimit) ||
      telemetryLimit < 1 ||
      telemetryLimit > 10000
    ) {
      return NextResponse.json(
        { error: 'telemetry_limit must be an integer between 1 and 10000' },
        { status: 400 }
      );
    }

    // Use transaction for consistent snapshot of agent data
    // This ensures all fetched data reflects the same point in time
    const snapshot = await db.transaction(async (tx) => {
      // Fetch agent
      const agents = await tx
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
        return { notFound: true } as const;
      }

      const agent = agents[0];

      // Fetch lifecycle events (audit trail - limited to prevent unbounded queries)
      // Default limit of 1000 most recent events per agent
      const LIFECYCLE_EVENTS_LIMIT = 1000;
      const lifecycleEvents = await tx
        .select()
        .from(agentLifecycleEventsTable)
        .where(eq(agentLifecycleEventsTable.agent_uuid, agentId))
        .orderBy(desc(agentLifecycleEventsTable.timestamp))
        .limit(LIFECYCLE_EVENTS_LIMIT);

      // Optionally include telemetry history
      let heartbeats: unknown[] = [];
      let metrics: unknown[] = [];

      if (includeTelemetry) {
        heartbeats = await tx
          .select()
          .from(agentHeartbeatsTable)
          .where(eq(agentHeartbeatsTable.agent_uuid, agentId))
          .orderBy(desc(agentHeartbeatsTable.timestamp))
          .limit(telemetryLimit);

        metrics = await tx
          .select()
          .from(agentMetricsTable)
          .where(eq(agentMetricsTable.agent_uuid, agentId))
          .orderBy(desc(agentMetricsTable.timestamp))
          .limit(telemetryLimit);
      }

      return {
        notFound: false,
        agent,
        lifecycleEvents,
        heartbeats,
        metrics,
      } as const;
    });

    // Handle not found case (after transaction)
    if (snapshot.notFound) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    const { agent, lifecycleEvents, heartbeats, metrics } = snapshot;

    // Get Kubernetes deployment configuration (outside transaction - external API call)
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

    // SECURITY: Redact sensitive fields from agent metadata before export
    // This prevents accidental exposure of API keys, tokens, secrets, etc.
    const redactedAgent = {
      ...agent,
      metadata: redactSensitiveMetadata(agent.metadata as Record<string, unknown>),
    };

    // Also redact lifecycle event metadata
    const redactedLifecycleEvents = lifecycleEvents.map(event => ({
      ...event,
      metadata: redactSensitiveMetadata(event.metadata as Record<string, unknown>),
    }));

    // Build export object
    const exportData: {
      export_version: string;
      exported_at: string;
      agent: typeof redactedAgent;
      lifecycle_events: typeof redactedLifecycleEvents;
      kubernetes_config: typeof kubernetesConfig;
      telemetry?: {
        heartbeats: unknown[];
        metrics: unknown[];
      };
    } = {
      export_version: 'pap-export/1.0',
      exported_at: new Date().toISOString(),
      agent: redactedAgent,
      lifecycle_events: redactedLifecycleEvents,
      kubernetes_config: kubernetesConfig,
    };

    // Add telemetry if requested
    if (includeTelemetry) {
      exportData.telemetry = {
        heartbeats,
        metrics,
      };
    }

    // Log lifecycle event for audit trail (outside transaction - doesn't need to be atomic)
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: agentId,
      event_type: 'EXPORTED',
      from_state: agent.state,
      to_state: agent.state, // State doesn't change on export
      metadata: {
        triggered_by: auth.project.user_id, // Consistent with other lifecycle events
        include_telemetry: includeTelemetry,
        telemetry_records: includeTelemetry
          ? {
              heartbeats: heartbeats.length,
              metrics: metrics.length,
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
