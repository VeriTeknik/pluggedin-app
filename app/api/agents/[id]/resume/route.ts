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
 * /api/agents/{id}/resume:
 *   post:
 *     summary: Resume a suspended PAP agent
 *     description: |
 *       Resumes a previously suspended agent by scaling the Kubernetes deployment back to 1 replica.
 *
 *       This endpoint:
 *       - Scales the deployment back to 1 replica
 *       - Clears the intentionally_suspended flag
 *       - Sets agent state to PROVISIONED (will become ACTIVE on first heartbeat)
 *
 *       Use case: Bring a suspended agent back online after maintenance or cost-saving pause.
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
 *     responses:
 *       200:
 *         description: Agent resumed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 agent_uuid:
 *                   type: string
 *                 resumed:
 *                   type: boolean
 *                 kubernetes:
 *                   type: object
 *       400:
 *         description: Bad Request - Agent is not suspended or cannot be resumed.
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       404:
 *         description: Not Found - Agent does not exist.
 *       500:
 *         description: Internal Server Error - Failed to resume agent.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const { id: agentId } = params;

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

    // Check if agent is terminated or killed (cannot be resumed)
    const nonResumableStates = [AgentState.TERMINATED, AgentState.KILLED];
    if (nonResumableStates.includes(agent.state as AgentState)) {
      return NextResponse.json(
        {
          error: `Agent in state ${agent.state} cannot be resumed`,
          hint: 'Terminated agents must be deleted and recreated',
        },
        { status: 400 }
      );
    }

    // Check if agent is actually suspended
    const metadata = agent.metadata as Record<string, unknown> || {};
    if (metadata.intentionally_suspended !== true) {
      return NextResponse.json(
        {
          error: 'Agent is not suspended',
          hint: 'This agent is already running or in a different state',
        },
        { status: 400 }
      );
    }

    // Check if agent has Kubernetes deployment
    if (!agent.kubernetes_deployment) {
      return NextResponse.json(
        { error: 'Agent has no Kubernetes deployment to resume' },
        { status: 400 }
      );
    }

    const namespace = agent.kubernetes_namespace || 'agents';
    const deploymentName = agent.kubernetes_deployment;

    // Scale deployment back to 1 replica
    const scaleResult = await kubernetesService.scaleAgent(
      deploymentName,
      1, // Scale to 1 replica
      namespace
    );

    if (!scaleResult.success) {
      return NextResponse.json(
        { error: scaleResult.message },
        { status: 500 }
      );
    }

    const previousState = agent.state;
    const now = new Date().toISOString();

    // Update agent: clear suspension flag and set state to PROVISIONED
    // (will become ACTIVE on first heartbeat)
    const { intentionally_suspended, suspended_at, suspended_reason, suspended_by, ...restMetadata } = metadata;
    await db
      .update(agentsTable)
      .set({
        state: AgentState.PROVISIONED,
        last_heartbeat_at: null, // Clear last heartbeat (will be set when agent sends heartbeat)
        metadata: {
          ...restMetadata,
          resumed_at: now,
          resumed_by: auth.project.user_id,
          previous_suspension: {
            suspended_at,
            suspended_reason,
            suspended_by,
          },
        },
      })
      .where(eq(agentsTable.uuid, agentId));

    // Log lifecycle event
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: agentId,
      event_type: 'RESUMED',
      from_state: previousState,
      to_state: AgentState.PROVISIONED,
      metadata: {
        triggered_by: auth.project.user_id,
        was_suspended_at: suspended_at,
        was_suspended_reason: suspended_reason,
        kubernetes_deployment: deploymentName,
        kubernetes_namespace: namespace,
      },
    });

    return NextResponse.json({
      message: 'Agent resumed successfully',
      agent_uuid: agentId,
      resumed: true,
      resumed_at: now,
      previous_state: previousState,
      new_state: AgentState.PROVISIONED,
      kubernetes: scaleResult,
    });
  } catch (error) {
    console.error('Error resuming agent:', error);
    return NextResponse.json(
      { error: 'Failed to resume agent' },
      { status: 500 }
    );
  }
}
