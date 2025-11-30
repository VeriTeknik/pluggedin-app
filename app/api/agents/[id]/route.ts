import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import {
  agentsTable,
  agentLifecycleEventsTable,
  agentHeartbeatsTable,
  agentMetricsTable,
  AgentState,
} from '@/db/schema';

import { authenticate } from '../../auth';
import { kubernetesService } from '@/lib/services/kubernetes-service';

/**
 * @swagger
 * /api/agents/{id}:
 *   get:
 *     summary: Get a specific PAP agent by ID
 *     description: Retrieves detailed information about a specific PAP agent, including recent heartbeats, metrics, and lifecycle events. Requires API key authentication.
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
 *         description: Successfully retrieved agent details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agent:
 *                   type: object
 *                 recentHeartbeats:
 *                   type: array
 *                   items:
 *                     type: object
 *                 recentMetrics:
 *                   type: array
 *                   items:
 *                     type: object
 *                 lifecycleEvents:
 *                   type: array
 *                   items:
 *                     type: object
 *                 kubernetesStatus:
 *                   type: object
 *                   nullable: true
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       404:
 *         description: Not Found - Agent does not exist or does not belong to the profile.
 *       500:
 *         description: Internal Server Error - Failed to fetch agent.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const { id: agentId } = await params;

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

    // Fetch recent heartbeats (last 10)
    const recentHeartbeats = await db
      .select()
      .from(agentHeartbeatsTable)
      .where(eq(agentHeartbeatsTable.agent_uuid, agentId))
      .orderBy(desc(agentHeartbeatsTable.timestamp))
      .limit(10);

    // Fetch recent metrics (last 10)
    const recentMetrics = await db
      .select()
      .from(agentMetricsTable)
      .where(eq(agentMetricsTable.agent_uuid, agentId))
      .orderBy(desc(agentMetricsTable.timestamp))
      .limit(10);

    // Fetch lifecycle events
    const lifecycleEvents = await db
      .select()
      .from(agentLifecycleEventsTable)
      .where(eq(agentLifecycleEventsTable.agent_uuid, agentId))
      .orderBy(desc(agentLifecycleEventsTable.timestamp));

    // Get Kubernetes deployment status
    let kubernetesStatus = null;
    if (agent.kubernetes_deployment) {
      kubernetesStatus = await kubernetesService.getDeploymentStatus(
        agent.kubernetes_deployment,
        agent.kubernetes_namespace || 'agents'
      );
    }

    // Convert BigInt values to numbers for JSON serialization
    const serializeBigInt = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'bigint') return Number(obj);
      if (Array.isArray(obj)) return obj.map(serializeBigInt);
      if (typeof obj === 'object') {
        const result: any = {};
        for (const key in obj) {
          result[key] = serializeBigInt(obj[key]);
        }
        return result;
      }
      return obj;
    };

    return NextResponse.json(serializeBigInt({
      agent,
      recentHeartbeats,
      recentMetrics,
      lifecycleEvents,
      kubernetesStatus,
    }));
  } catch (error) {
    console.error('Error fetching agent:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent' },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/agents/{id}:
 *   delete:
 *     summary: Delete a PAP agent
 *     description: Terminates and deletes a PAP agent, including its Kubernetes deployment. This operation transitions the agent to TERMINATED state and removes all associated resources. Requires API key authentication.
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
 *         description: The UUID of the agent to delete
 *     responses:
 *       200:
 *         description: Successfully deleted the agent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 kubernetes:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                     message:
 *                       type: string
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       404:
 *         description: Not Found - Agent does not exist or does not belong to the profile.
 *       500:
 *         description: Internal Server Error - Failed to delete agent.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const { id: agentId } = await params;

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

    // Delete from Kubernetes
    let kubernetesResult = { success: true, message: 'No Kubernetes deployment' };
    if (agent.kubernetes_deployment) {
      kubernetesResult = await kubernetesService.deleteAgent(
        agent.kubernetes_deployment,
        agent.kubernetes_namespace || 'agents'
      );
    }

    // Update agent state to TERMINATED
    await db
      .update(agentsTable)
      .set({
        state: AgentState.TERMINATED,
        terminated_at: new Date(),
      })
      .where(eq(agentsTable.uuid, agentId));

    // Log lifecycle event
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: agentId,
      event_type: 'TERMINATED',
      from_state: agent.state,
      to_state: AgentState.TERMINATED,
      metadata: {
        triggered_by: auth.project.user_id,
        kubernetes_result: kubernetesResult,
      },
    });

    return NextResponse.json({
      message: 'Agent terminated successfully',
      kubernetes: kubernetesResult,
    });
  } catch (error) {
    console.error('Error deleting agent:', error);
    return NextResponse.json(
      { error: 'Failed to delete agent' },
      { status: 500 }
    );
  }
}
