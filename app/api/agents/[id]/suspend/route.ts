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
 * /api/agents/{id}/suspend:
 *   post:
 *     summary: Suspend a PAP agent
 *     description: |
 *       Suspends the agent by scaling the Kubernetes deployment to 0 replicas.
 *       This is a temporary pause that preserves the agent's state and configuration.
 *
 *       Unlike shutdown, suspend:
 *       - Does NOT change agent state to DRAINING or TERMINATED
 *       - Marks the agent as intentionally suspended in metadata
 *       - Prevents zombie alerts from being triggered
 *       - Can be resumed at any time
 *
 *       Use case: Temporarily pause an agent for maintenance, cost savings, or debugging.
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
 *               reason:
 *                 type: string
 *                 description: Optional reason for suspending the agent
 *     responses:
 *       200:
 *         description: Agent suspended successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 agent_uuid:
 *                   type: string
 *                 suspended:
 *                   type: boolean
 *                 kubernetes:
 *                   type: object
 *       400:
 *         description: Bad Request - Agent cannot be suspended (e.g., already terminated).
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       404:
 *         description: Not Found - Agent does not exist.
 *       500:
 *         description: Internal Server Error - Failed to suspend agent.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const { id: agentId } = params;

    // Parse optional body
    let reason = '';
    try {
      const body = await request.json();
      reason = body.reason || '';
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

    // Check if agent can be suspended (not already terminated or killed)
    const nonSuspendableStates = [AgentState.TERMINATED, AgentState.KILLED];
    if (nonSuspendableStates.includes(agent.state as AgentState)) {
      return NextResponse.json(
        {
          error: `Agent in state ${agent.state} cannot be suspended`,
          hint: 'Terminated agents must be deleted and recreated',
        },
        { status: 400 }
      );
    }

    // Check if already suspended
    const metadata = agent.metadata as Record<string, unknown> || {};
    if (metadata.intentionally_suspended === true) {
      return NextResponse.json(
        {
          error: 'Agent is already suspended',
          hint: 'Use the resume endpoint to bring it back online',
        },
        { status: 400 }
      );
    }

    // Check if agent has Kubernetes deployment
    if (!agent.kubernetes_deployment) {
      return NextResponse.json(
        { error: 'Agent has no Kubernetes deployment to suspend' },
        { status: 400 }
      );
    }

    const namespace = agent.kubernetes_namespace || 'agents';
    const deploymentName = agent.kubernetes_deployment;

    // Scale deployment to 0 replicas
    const scaleResult = await kubernetesService.scaleAgent(
      deploymentName,
      0, // Scale to 0 replicas
      namespace
    );

    if (!scaleResult.success) {
      return NextResponse.json(
        { error: scaleResult.message },
        { status: 500 }
      );
    }

    // Update agent metadata to mark as intentionally suspended
    const now = new Date().toISOString();
    await db
      .update(agentsTable)
      .set({
        metadata: {
          ...metadata,
          intentionally_suspended: true,
          suspended_at: now,
          suspended_reason: reason || 'User requested suspension',
          suspended_by: auth.project.user_id,
        },
      })
      .where(eq(agentsTable.uuid, agentId));

    // Log lifecycle event
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: agentId,
      event_type: 'SUSPENDED',
      from_state: agent.state,
      to_state: agent.state, // State doesn't change
      metadata: {
        triggered_by: auth.project.user_id,
        reason,
        kubernetes_deployment: deploymentName,
        kubernetes_namespace: namespace,
      },
    });

    return NextResponse.json({
      message: 'Agent suspended successfully',
      agent_uuid: agentId,
      suspended: true,
      suspended_at: now,
      kubernetes: scaleResult,
    });
  } catch (error) {
    console.error('Error suspending agent:', error);
    return NextResponse.json(
      { error: 'Failed to suspend agent' },
      { status: 500 }
    );
  }
}
