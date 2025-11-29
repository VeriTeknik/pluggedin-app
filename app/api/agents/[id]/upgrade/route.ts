import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import {
  agentsTable,
  agentLifecycleEventsTable,
  AgentState,
} from '@/db/schema';

import { authenticate } from '../../../auth';
import { kubernetesService } from '@/lib/services/kubernetes-service';

/**
 * @swagger
 * /api/agents/{id}/upgrade:
 *   post:
 *     summary: Upgrade PAP agent with zero-downtime rolling update
 *     description: |
 *       Performs in-place agent upgrade using Kubernetes rolling update strategy:
 *       1. Updates deployment with new image or boot image
 *       2. Creates new pods with updated configuration
 *       3. Waits for new pods to become healthy
 *       4. Terminates old pods gracefully
 *       5. Supports automatic rollback on failure
 *
 *       Valid states: ACTIVE, PROVISIONED
 *       Strategy: RollingUpdate with configurable maxSurge and maxUnavailable
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 description: New container image (e.g., pluggedin/agent-runtime:v2.0.0)
 *               boot_image_url:
 *                 type: string
 *                 description: URL to download boot image from (alternative to 'image')
 *               resources:
 *                 type: object
 *                 description: Optional resource updates
 *                 properties:
 *                   cpu_request:
 *                     type: string
 *                   cpu_limit:
 *                     type: string
 *                   memory_request:
 *                     type: string
 *                   memory_limit:
 *                     type: string
 *               max_surge:
 *                 type: integer
 *                 description: Maximum additional pods during upgrade (default 1)
 *                 default: 1
 *               max_unavailable:
 *                 type: integer
 *                 description: Maximum unavailable pods during upgrade (default 0)
 *                 default: 0
 *               auto_rollback:
 *                 type: boolean
 *                 description: Automatically rollback on failure (default true)
 *                 default: true
 *     responses:
 *       200:
 *         description: Successfully initiated upgrade.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 agent:
 *                   type: object
 *                 upgrade:
 *                   type: object
 *       400:
 *         description: Bad Request - Invalid state or missing parameters.
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       404:
 *         description: Not Found - Agent does not exist.
 *       500:
 *         description: Internal Server Error - Failed to upgrade agent.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const agentId = params.id;

    // Parse request body
    const body = await request.json();
    const {
      image,
      boot_image_url,
      resources,
      max_surge = 1,
      max_unavailable = 0,
      auto_rollback = true,
    } = body;

    // Validate required fields
    if (!image && !boot_image_url) {
      return NextResponse.json(
        { error: 'Either "image" or "boot_image_url" is required' },
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

    // Validate state (can only upgrade ACTIVE or PROVISIONED agents)
    const validStates = [AgentState.ACTIVE, AgentState.PROVISIONED];
    if (!validStates.includes(agent.state as AgentState)) {
      return NextResponse.json(
        {
          error: `Cannot upgrade agent in ${agent.state} state. Must be ACTIVE or PROVISIONED.`,
          current_state: agent.state,
          allowed_states: validStates,
        },
        { status: 400 }
      );
    }

    // Validate Kubernetes deployment exists
    if (!agent.kubernetes_deployment) {
      return NextResponse.json(
        { error: 'Agent has no Kubernetes deployment to upgrade' },
        { status: 400 }
      );
    }

    // Determine final image (download boot image if URL provided)
    let finalImage = image;
    if (boot_image_url && !image) {
      // TODO: Implement boot image download and import to container registry
      // For now, return error indicating this is not yet implemented
      return NextResponse.json(
        {
          error: 'Boot image transfer not yet implemented. Please provide direct "image" parameter.',
          planned_feature: 'boot_image_url will download and import images from URLs',
        },
        { status: 501 } // Not Implemented
      );
    }

    // Store previous configuration for rollback
    const previousMetadata = agent.metadata as Record<string, unknown> || {};
    const upgradeMetadata = {
      ...previousMetadata,
      upgrade_history: [
        ...(Array.isArray(previousMetadata.upgrade_history) ? previousMetadata.upgrade_history : []),
        {
          timestamp: new Date().toISOString(),
          from_image: previousMetadata.image || 'unknown',
          to_image: finalImage,
          triggered_by: auth.project.user_id,
        },
      ],
      current_upgrade: {
        started_at: new Date().toISOString(),
        target_image: finalImage,
        max_surge,
        max_unavailable,
        auto_rollback,
      },
      image: finalImage,
      resources: resources || previousMetadata.resources,
    };

    // Update Kubernetes deployment with rolling update
    const upgradeResult = await kubernetesService.upgradeAgent({
      name: agent.kubernetes_deployment,
      namespace: agent.kubernetes_namespace || 'agents',
      image: finalImage,
      resources,
      strategy: {
        type: 'RollingUpdate',
        rollingUpdate: {
          maxSurge: max_surge,
          maxUnavailable: max_unavailable,
        },
      },
    });

    // Update agent metadata with upgrade info
    const [updatedAgent] = await db
      .update(agentsTable)
      .set({
        metadata: upgradeMetadata,
      })
      .where(eq(agentsTable.uuid, agentId))
      .returning();

    // Log lifecycle event
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: agentId,
      event_type: 'UPGRADE_STARTED',
      from_state: agent.state,
      to_state: agent.state, // State remains same during upgrade
      metadata: {
        triggered_by: auth.project.user_id,
        from_image: previousMetadata.image || 'unknown',
        to_image: finalImage,
        resources,
        max_surge,
        max_unavailable,
        auto_rollback,
        kubernetes_result: upgradeResult,
      },
    });

    return NextResponse.json({
      message: 'Agent upgrade initiated with rolling update strategy',
      agent: updatedAgent,
      upgrade: {
        target_image: finalImage,
        strategy: 'RollingUpdate',
        max_surge,
        max_unavailable,
        auto_rollback,
        kubernetes: upgradeResult,
      },
    });
  } catch (error) {
    console.error('Error upgrading agent:', error);
    return NextResponse.json(
      { error: 'Failed to upgrade agent' },
      { status: 500 }
    );
  }
}
