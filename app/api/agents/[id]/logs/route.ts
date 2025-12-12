import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import { agentsTable } from '@/db/schema';
import { kubernetesService } from '@/lib/services/kubernetes-service';

import { authenticate } from '../../../auth';

/**
 * @swagger
 * /api/agents/{id}/logs:
 *   get:
 *     summary: Get agent pod logs
 *     description: |
 *       Returns container logs from the agent's Kubernetes pod.
 *       Logs are returned with timestamps and support tail limiting.
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
 *       - name: tail
 *         in: query
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Number of log lines to return (max 1000)
 *     responses:
 *       200:
 *         description: Container logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: string
 *                   description: Raw log output with timestamps
 *                 lines:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       timestamp:
 *                         type: string
 *                       message:
 *                         type: string
 *       401:
 *         description: Unauthorized - Invalid or missing API key
 *       404:
 *         description: Agent not found or no deployment
 *       500:
 *         description: Failed to fetch logs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const { id: agentId } = await params;
    const { searchParams } = new URL(request.url);
    const tail = Math.min(parseInt(searchParams.get('tail') || '100'), 1000);

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

    // Get logs from Kubernetes
    const logs = await kubernetesService.getAgentLogs(
      agent.kubernetes_deployment,
      agent.kubernetes_namespace || 'agents',
      tail
    );

    if (logs === null) {
      return NextResponse.json({
        logs: '',
        lines: [],
        error: 'Could not retrieve logs. The pod may not be running yet.',
      });
    }

    // Parse logs into structured format
    const lines = logs
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        // Kubernetes log format: "2024-01-01T12:00:00.000000000Z message..."
        const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+(.*)$/);
        if (match) {
          return {
            timestamp: match[1],
            message: match[2],
          };
        }
        return {
          timestamp: null,
          message: line,
        };
      });

    return NextResponse.json({
      logs,
      lines,
      tailLines: tail,
    });
  } catch (error) {
    console.error('Error fetching agent logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}
