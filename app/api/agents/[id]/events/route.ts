import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { agentsTable } from '@/db/schema';
import { kubernetesService } from '@/lib/services/kubernetes-service';

import { authenticate } from '../../../auth';

/**
 * @swagger
 * /api/agents/{id}/events:
 *   get:
 *     summary: Get agent Kubernetes events
 *     description: |
 *       Returns Kubernetes events for the agent's deployment and pods.
 *       Events include scheduling, pulling images, creating containers, etc.
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
 *         description: Kubernetes events for the agent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 events:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [Normal, Warning]
 *                       reason:
 *                         type: string
 *                       message:
 *                         type: string
 *                       count:
 *                         type: integer
 *                       firstTimestamp:
 *                         type: string
 *                         format: date-time
 *                       lastTimestamp:
 *                         type: string
 *                         format: date-time
 *                       source:
 *                         type: string
 *                 pods:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       phase:
 *                         type: string
 *                       ready:
 *                         type: boolean
 *                       restarts:
 *                         type: integer
 *       401:
 *         description: Unauthorized - Invalid or missing API key
 *       404:
 *         description: Agent not found or no deployment
 *       500:
 *         description: Failed to fetch events
 */
export async function GET(
  request: NextRequest,
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

    if (!agent.kubernetes_deployment) {
      return NextResponse.json(
        { error: 'No Kubernetes deployment found for this agent' },
        { status: 404 }
      );
    }

    const namespace = agent.kubernetes_namespace || 'agents';

    // Get events from Kubernetes
    const events = await kubernetesService.getAgentEvents(
      agent.kubernetes_deployment,
      namespace
    );

    // Get pod status
    const pods = await kubernetesService.getAgentPodStatus(
      agent.kubernetes_deployment,
      namespace
    );

    // Get deployment status
    const deploymentStatus = await kubernetesService.getDeploymentStatus(
      agent.kubernetes_deployment,
      namespace
    );

    return NextResponse.json({
      events,
      pods,
      deploymentStatus,
    });
  } catch (error) {
    console.error('Error fetching agent events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
