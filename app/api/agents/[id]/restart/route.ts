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
 * /api/agents/{id}/restart:
 *   post:
 *     summary: Restart a PAP agent
 *     description: |
 *       Restarts the agent by performing a rolling restart of the Kubernetes deployment.
 *       This is useful for:
 *       - Recovering from errors
 *       - Applying configuration changes
 *       - Clearing agent state
 *
 *       The agent will transition to PROVISIONED state and then back to ACTIVE
 *       once it sends its first heartbeat after restart.
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               force:
 *                 type: boolean
 *                 description: Force restart even if agent is not in a restartable state
 *     responses:
 *       200:
 *         description: Agent restart initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 agent_uuid:
 *                   type: string
 *                 previous_state:
 *                   type: string
 *                 new_state:
 *                   type: string
 *       400:
 *         description: Bad Request - Agent is not in a restartable state.
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       404:
 *         description: Not Found - Agent does not exist.
 *       500:
 *         description: Internal Server Error - Failed to restart agent.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const { id: agentId } = await params;

    // Parse optional body
    let force = false;
    try {
      const body = await request.json();
      force = body.force === true;
    } catch {
      // No body provided, use defaults
    }

    // Verify agent exists and belongs to profile
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

    // Check if agent can be restarted
    const restartableStates = [
      AgentState.PROVISIONED,
      AgentState.ACTIVE,
      AgentState.DRAINING,
    ];

    if (!restartableStates.includes(agent.state as AgentState) && !force) {
      return NextResponse.json(
        {
          error: `Agent in state ${agent.state} cannot be restarted`,
          restartable_states: restartableStates,
          hint: 'Use force=true to restart anyway',
        },
        { status: 400 }
      );
    }

    // Check if agent has Kubernetes deployment
    if (!agent.kubernetes_deployment) {
      return NextResponse.json(
        { error: 'Agent has no Kubernetes deployment to restart' },
        { status: 400 }
      );
    }

    const namespace = agent.kubernetes_namespace || 'agents';
    const deploymentName = agent.kubernetes_deployment;

    // Perform rolling restart by patching the deployment with a restart annotation
    // This is the Kubernetes-native way to restart a deployment
    const restartResult = await kubernetesService.restartDeployment(
      deploymentName,
      namespace
    );

    if (!restartResult.success) {
      return NextResponse.json(
        { error: restartResult.message },
        { status: 500 }
      );
    }

    const previousState = agent.state;

    // Update agent state to PROVISIONED (will become ACTIVE on first heartbeat)
    await db
      .update(agentsTable)
      .set({
        state: AgentState.PROVISIONED,
        last_heartbeat_at: null, // Clear last heartbeat
      })
      .where(eq(agentsTable.uuid, agentId));

    // Log lifecycle event
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: agentId,
      event_type: 'RESTARTED',
      from_state: previousState as AgentState,
      to_state: AgentState.PROVISIONED,
      metadata: {
        triggered_by: auth.project.user_id,
        force,
        kubernetes_deployment: deploymentName,
        kubernetes_namespace: namespace,
      },
    });

    return NextResponse.json({
      message: 'Agent restart initiated',
      agent_uuid: agentId,
      previous_state: previousState,
      new_state: AgentState.PROVISIONED,
      kubernetes: restartResult,
    });
  } catch (error) {
    console.error('Error restarting agent:', error);
    return NextResponse.json(
      { error: 'Failed to restart agent' },
      { status: 500 }
    );
  }
}
