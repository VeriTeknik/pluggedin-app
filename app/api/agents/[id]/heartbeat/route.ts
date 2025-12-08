import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import {
  agentsTable,
  agentHeartbeatsTable,
  agentLifecycleEventsTable,
  AgentState,
} from '@/db/schema';

import { authenticate } from '../../../auth';

/**
 * @swagger
 * /api/agents/{id}/heartbeat:
 *   post:
 *     summary: Receive heartbeat from PAP agent (liveness-only)
 *     description: |
 *       Records agent heartbeat for zombie detection (PAP-RFC-001 §8.1).
 *       CRITICAL: Heartbeat contains ONLY liveness data (mode + uptime).
 *       NO metrics allowed here - use /metrics endpoint instead.
 *
 *       Zombie detection: One missed heartbeat interval → AGENT_UNHEALTHY
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
 *               - mode
 *               - uptime_seconds
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [EMERGENCY, IDLE, SLEEP]
 *                 description: Heartbeat mode (affects interval)
 *               uptime_seconds:
 *                 type: integer
 *                 description: Agent uptime in seconds
 *     responses:
 *       200:
 *         description: Heartbeat recorded successfully.
 *       400:
 *         description: Bad Request - Invalid heartbeat data.
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       404:
 *         description: Not Found - Agent does not exist.
 *       500:
 *         description: Internal Server Error - Failed to record heartbeat.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const { id: agentId } = await params;

    // Parse request body
    const body = await request.json();
    const { mode, uptime_seconds } = body;

    // Validate required fields
    if (!mode || uptime_seconds === undefined) {
      return NextResponse.json(
        { error: 'Fields "mode" and "uptime_seconds" are required' },
        { status: 400 }
      );
    }

    // Validate mode
    const validModes = ['EMERGENCY', 'IDLE', 'SLEEP'];
    if (!validModes.includes(mode)) {
      return NextResponse.json(
        { error: `Invalid mode. Must be one of: ${validModes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate uptime_seconds
    if (typeof uptime_seconds !== 'number' || uptime_seconds < 0) {
      return NextResponse.json(
        { error: 'uptime_seconds must be a non-negative number' },
        { status: 400 }
      );
    }

    // CRITICAL: Verify NO metrics are included (zombie prevention enforcement)
    const disallowedFields = ['cpu_percent', 'memory_mb', 'requests_handled', 'custom_metrics'];
    for (const field of disallowedFields) {
      if (field in body) {
        return NextResponse.json(
          {
            error: `Field "${field}" not allowed in heartbeat. Use /metrics endpoint for resource telemetry.`,
            zombie_prevention: 'PAP-RFC-001 §8.1 requires strict heartbeat/metrics separation',
          },
          { status: 400 }
        );
      }
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
    const now = new Date();
    let stateTransition = null;

    // Record heartbeat
    await db.insert(agentHeartbeatsTable).values({
      agent_uuid: agentId,
      mode,
      uptime_seconds,
      timestamp: now,
    });

    // PROVISIONED → ACTIVE transition on first heartbeat (PAP-RFC-001 §7.2)
    if (agent.state === AgentState.PROVISIONED) {
      await db
        .update(agentsTable)
        .set({
          state: AgentState.ACTIVE,
          activated_at: now,
          last_heartbeat_at: now,
          metadata: {
            ...(agent.metadata as Record<string, unknown> || {}),
            last_heartbeat: now.toISOString(),
            last_heartbeat_mode: mode,
          },
        })
        .where(eq(agentsTable.uuid, agentId));

      // Log lifecycle event for state transition
      await db.insert(agentLifecycleEventsTable).values({
        agent_uuid: agentId,
        event_type: 'ACTIVATED',
        from_state: AgentState.PROVISIONED,
        to_state: AgentState.ACTIVE,
        metadata: {
          triggered_by: 'heartbeat',
          first_heartbeat_mode: mode,
          uptime_seconds,
        },
      });

      stateTransition = {
        from: AgentState.PROVISIONED,
        to: AgentState.ACTIVE,
      };
    } else {
      // Just update last_heartbeat timestamp and metadata
      await db
        .update(agentsTable)
        .set({
          last_heartbeat_at: now,
          metadata: {
            ...(agent.metadata as Record<string, unknown> || {}),
            last_heartbeat: now.toISOString(),
            last_heartbeat_mode: mode,
          },
        })
        .where(eq(agentsTable.uuid, agentId));
    }

    return NextResponse.json({
      message: stateTransition ? 'Heartbeat recorded, agent activated' : 'Heartbeat recorded',
      agent_uuid: agentId,
      mode,
      uptime_seconds,
      state_transition: stateTransition,
    });
  } catch (error) {
    console.error('Error recording heartbeat:', error);
    return NextResponse.json(
      { error: 'Failed to record heartbeat' },
      { status: 500 }
    );
  }
}
