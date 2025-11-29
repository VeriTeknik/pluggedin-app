import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import {
  agentsTable,
  agentLifecycleEventsTable,
  AgentState,
} from '@/db/schema';

import { authenticateApiKey } from '../../../auth';
import { kubernetesService } from '@/lib/services/kubernetes-service';

/**
 * @swagger
 * /api/agents/{id}/replicate:
 *   post:
 *     summary: Replicate (clone) a PAP agent
 *     description: |
 *       Creates a new agent by cloning the configuration of an existing agent.
 *       The new agent will have:
 *       - Same image, resources, and metadata as source
 *       - Different name and DNS (provided in request)
 *       - Independent lifecycle (NEW state)
 *       - No telemetry history (fresh start)
 *
 *       Use cases:
 *       - Scaling horizontally with same configuration
 *       - Creating test/staging copies
 *       - Disaster recovery (replicate before upgrade)
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
 *         description: The UUID of the source agent to replicate
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name for the new agent (must be DNS-safe)
 *                 pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$'
 *               description:
 *                 type: string
 *                 description: Optional description for the new agent
 *               deploy:
 *                 type: boolean
 *                 description: Automatically deploy to Kubernetes (default true)
 *                 default: true
 *               overrides:
 *                 type: object
 *                 description: Optional configuration overrides
 *                 properties:
 *                   image:
 *                     type: string
 *                   resources:
 *                     type: object
 *     responses:
 *       200:
 *         description: Successfully replicated agent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 source_agent:
 *                   type: object
 *                 new_agent:
 *                   type: object
 *                 deployment:
 *                   type: object
 *                   nullable: true
 *       400:
 *         description: Bad Request - Invalid name or name already exists.
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       404:
 *         description: Not Found - Source agent does not exist.
 *       500:
 *         description: Internal Server Error - Failed to replicate agent.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticateApiKey(request);
    if (auth.error) return auth.error;

    const sourceAgentId = params.id;

    // Parse request body
    const body = await request.json();
    const { name, description, deploy = true, overrides } = body;

    // Validate required fields
    if (!name) {
      return NextResponse.json(
        { error: 'Field "name" is required' },
        { status: 400 }
      );
    }

    // Validate DNS-safe name
    const dnsNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
    if (!dnsNameRegex.test(name)) {
      return NextResponse.json(
        {
          error:
            'Name must be DNS-safe: lowercase alphanumeric and hyphens only, must start and end with alphanumeric',
        },
        { status: 400 }
      );
    }

    // Fetch source agent
    const sourceAgents = await db
      .select()
      .from(agentsTable)
      .where(
        and(
          eq(agentsTable.uuid, sourceAgentId),
          eq(agentsTable.profile_uuid, auth.activeProfile.uuid)
        )
      )
      .limit(1);

    if (sourceAgents.length === 0) {
      return NextResponse.json(
        { error: 'Source agent not found' },
        { status: 404 }
      );
    }

    const sourceAgent = sourceAgents[0];

    // Check if name is already taken
    const existingAgents = await db
      .select()
      .from(agentsTable)
      .where(
        and(
          eq(agentsTable.name, name),
          eq(agentsTable.profile_uuid, auth.activeProfile.uuid)
        )
      )
      .limit(1);

    if (existingAgents.length > 0) {
      return NextResponse.json(
        { error: `Agent with name "${name}" already exists` },
        { status: 400 }
      );
    }

    // Generate DNS name
    const dnsName = `${name}.is.plugged.in`;

    // Clone metadata, applying overrides
    const sourceMetadata = (sourceAgent.metadata as Record<string, unknown>) || {};
    const newMetadata = {
      ...sourceMetadata,
      replicated_from: {
        agent_uuid: sourceAgent.uuid,
        agent_name: sourceAgent.name,
        replicated_at: new Date().toISOString(),
        replicated_by: auth.project.user_id,
      },
      // Apply overrides
      ...(overrides?.image && { image: overrides.image }),
      ...(overrides?.resources && { resources: overrides.resources }),
    };

    // Create new agent in database
    const [newAgent] = await db
      .insert(agentsTable)
      .values({
        name,
        dns_name: dnsName,
        profile_uuid: auth.activeProfile.uuid,
        state: AgentState.NEW,
        description: description || `Replica of ${sourceAgent.name}`,
        kubernetes_namespace: sourceAgent.kubernetes_namespace || 'agents',
        metadata: newMetadata,
      })
      .returning();

    // Log lifecycle event for new agent
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: newAgent.uuid,
      event_type: 'CREATED',
      from_state: null,
      to_state: AgentState.NEW,
      metadata: {
        triggered_by: auth.project.user_id,
        replicated_from: sourceAgent.uuid,
      },
    });

    // Log lifecycle event for source agent
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: sourceAgent.uuid,
      event_type: 'REPLICATED',
      from_state: sourceAgent.state,
      to_state: sourceAgent.state, // State doesn't change
      metadata: {
        triggered_by: auth.project.user_id,
        replica_uuid: newAgent.uuid,
        replica_name: newAgent.name,
      },
    });

    let deploymentResult = null;

    // Optionally deploy to Kubernetes
    if (deploy) {
      const image =
        overrides?.image || (sourceMetadata.image as string) || 'nginxinc/nginx-unprivileged:alpine';
      const resources =
        overrides?.resources || (sourceMetadata.resources as Record<string, string>);

      deploymentResult = await kubernetesService.deployAgent({
        name,
        dnsName,
        namespace: newAgent.kubernetes_namespace || 'agents',
        image,
        resources: resources
          ? {
              cpuRequest: resources.cpu_request,
              memoryRequest: resources.memory_request,
              cpuLimit: resources.cpu_limit,
              memoryLimit: resources.memory_limit,
            }
          : undefined,
      });

      // Update state based on deployment result
      if (deploymentResult.success) {
        await db
          .update(agentsTable)
          .set({
            state: AgentState.PROVISIONED,
            kubernetes_deployment: name,
            provisioned_at: new Date(),
          })
          .where(eq(agentsTable.uuid, newAgent.uuid));

        // Log provisioning event
        await db.insert(agentLifecycleEventsTable).values({
          agent_uuid: newAgent.uuid,
          event_type: 'PROVISIONED',
          from_state: AgentState.NEW,
          to_state: AgentState.PROVISIONED,
          metadata: {
            triggered_by: auth.project.user_id,
            kubernetes_result: deploymentResult,
          },
        });
      }
    }

    return NextResponse.json({
      message: `Agent replicated successfully from ${sourceAgent.name}`,
      source_agent: {
        uuid: sourceAgent.uuid,
        name: sourceAgent.name,
        state: sourceAgent.state,
      },
      new_agent: newAgent,
      deployment: deploymentResult,
    });
  } catch (error) {
    console.error('Error replicating agent:', error);
    return NextResponse.json(
      { error: 'Failed to replicate agent' },
      { status: 500 }
    );
  }
}
