import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import {
  agentsTable,
  agentMetricsTable,
} from '@/db/schema';

import { authenticate } from '../../../auth';

/**
 * @swagger
 * /api/agents/{id}/metrics:
 *   post:
 *     summary: Receive resource metrics from PAP agent
 *     description: |
 *       Records agent resource consumption metrics (PAP-RFC-001 §8.2).
 *       CRITICAL: Sent on SEPARATE CHANNEL from heartbeats.
 *       This separation is the PAP zombie prevention superpower!
 *
 *       Metrics include:
 *       - CPU usage percentage
 *       - Memory usage in MB
 *       - Request count
 *       - Custom application metrics
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
 *               - cpu_percent
 *               - memory_mb
 *               - requests_handled
 *             properties:
 *               cpu_percent:
 *                 type: number
 *                 description: CPU usage percentage (0-100+ for multi-core)
 *               memory_mb:
 *                 type: number
 *                 description: Memory usage in megabytes
 *               requests_handled:
 *                 type: integer
 *                 description: Total requests handled since startup
 *               custom_metrics:
 *                 type: object
 *                 description: Custom application-specific metrics
 *                 additionalProperties:
 *                   type: number
 *     responses:
 *       200:
 *         description: Metrics recorded successfully.
 *       400:
 *         description: Bad Request - Invalid metrics data.
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       404:
 *         description: Not Found - Agent does not exist.
 *       500:
 *         description: Internal Server Error - Failed to record metrics.
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
    const { cpu_percent, memory_mb, requests_handled, custom_metrics } = body;

    // Validate required fields
    if (
      cpu_percent === undefined ||
      memory_mb === undefined ||
      requests_handled === undefined
    ) {
      return NextResponse.json(
        {
          error:
            'Fields "cpu_percent", "memory_mb", and "requests_handled" are required',
        },
        { status: 400 }
      );
    }

    // Validate field types
    if (typeof cpu_percent !== 'number' || cpu_percent < 0) {
      return NextResponse.json(
        { error: 'cpu_percent must be a non-negative number' },
        { status: 400 }
      );
    }
    if (typeof memory_mb !== 'number' || memory_mb < 0) {
      return NextResponse.json(
        { error: 'memory_mb must be a non-negative number' },
        { status: 400 }
      );
    }
    if (typeof requests_handled !== 'number' || requests_handled < 0) {
      return NextResponse.json(
        { error: 'requests_handled must be a non-negative number' },
        { status: 400 }
      );
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

    // Record metrics
    await db.insert(agentMetricsTable).values({
      agent_uuid: agentId,
      cpu_percent: Math.round(cpu_percent),
      memory_mb: Math.round(memory_mb),
      requests_handled,
      custom_metrics: custom_metrics || {},
      timestamp: new Date(),
    });

    // Update agent's last_metrics timestamp
    await db
      .update(agentsTable)
      .set({
        metadata: {
          ...(agent.metadata as Record<string, unknown> || {}),
          last_metrics: new Date().toISOString(),
          last_cpu_percent: Math.round(cpu_percent),
          last_memory_mb: Math.round(memory_mb),
        },
      })
      .where(eq(agentsTable.uuid, agentId));

    return NextResponse.json({
      message: 'Metrics recorded',
      agent_uuid: agentId,
      cpu_percent: Math.round(cpu_percent),
      memory_mb: Math.round(memory_mb),
      requests_handled,
    });
  } catch (error) {
    console.error('Error recording metrics:', error);
    return NextResponse.json(
      { error: 'Failed to record metrics' },
      { status: 500 }
    );
  }
}
