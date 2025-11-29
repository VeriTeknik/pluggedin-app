import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import {
  agentsTable,
  agentLifecycleEventsTable,
  AgentState,
} from '@/db/schema';

import { authenticate } from '../../../auth';

/**
 * @swagger
 * /api/agents/{id}/state:
 *   post:
 *     summary: Report state change from PAP agent
 *     description: |
 *       Agent reports state transitions to Station for audit trail.
 *       Station validates transition against normative FSM (PAP-RFC-001 §7.2).
 *
 *       Valid transitions:
 *       NEW → PROVISIONED → ACTIVE ↔ DRAINING → TERMINATED
 *                               ↓ (error)
 *                             KILLED
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
 *               - from_state
 *               - to_state
 *             properties:
 *               from_state:
 *                 type: string
 *                 enum: [NEW, PROVISIONED, ACTIVE, DRAINING, TERMINATED, KILLED]
 *               to_state:
 *                 type: string
 *                 enum: [NEW, PROVISIONED, ACTIVE, DRAINING, TERMINATED, KILLED]
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: State change recorded successfully.
 *       400:
 *         description: Bad Request - Invalid state transition.
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       404:
 *         description: Not Found - Agent does not exist.
 *       500:
 *         description: Internal Server Error - Failed to record state change.
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
    const { from_state, to_state, timestamp } = body;

    // Validate required fields
    if (!from_state || !to_state) {
      return NextResponse.json(
        { error: 'Fields "from_state" and "to_state" are required' },
        { status: 400 }
      );
    }

    // Validate states
    const validStates = Object.values(AgentState);
    if (!validStates.includes(from_state as AgentState)) {
      return NextResponse.json(
        { error: `Invalid from_state. Must be one of: ${validStates.join(', ')}` },
        { status: 400 }
      );
    }
    if (!validStates.includes(to_state as AgentState)) {
      return NextResponse.json(
        { error: `Invalid to_state. Must be one of: ${validStates.join(', ')}` },
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

    // Validate state transition (normative FSM enforcement)
    const validTransitions: Map<AgentState, AgentState[]> = new Map([
      [AgentState.NEW, [AgentState.PROVISIONED, AgentState.KILLED]],
      [AgentState.PROVISIONED, [AgentState.ACTIVE, AgentState.TERMINATED, AgentState.KILLED]],
      [AgentState.ACTIVE, [AgentState.DRAINING, AgentState.KILLED]],
      [AgentState.DRAINING, [AgentState.TERMINATED, AgentState.ACTIVE, AgentState.KILLED]],
      [AgentState.TERMINATED, []],
      [AgentState.KILLED, []],
    ]);

    const allowedNextStates = validTransitions.get(from_state as AgentState) || [];
    if (!allowedNextStates.includes(to_state as AgentState)) {
      return NextResponse.json(
        {
          error: `Invalid state transition: ${from_state} → ${to_state}`,
          allowed_transitions: allowedNextStates,
          normative_fsm: 'PAP-RFC-001 §7.2',
        },
        { status: 400 }
      );
    }

    // Update agent state
    const updateData: {
      state: AgentState;
      provisioned_at?: Date;
      activated_at?: Date;
      terminated_at?: Date;
    } = {
      state: to_state as AgentState,
    };

    // Set lifecycle timestamps
    if (to_state === AgentState.PROVISIONED && !agent.provisioned_at) {
      updateData.provisioned_at = new Date();
    }
    if (to_state === AgentState.ACTIVE && !agent.activated_at) {
      updateData.activated_at = new Date();
    }
    if ((to_state === AgentState.TERMINATED || to_state === AgentState.KILLED) && !agent.terminated_at) {
      updateData.terminated_at = new Date();
    }

    await db
      .update(agentsTable)
      .set(updateData)
      .where(eq(agentsTable.uuid, agentId));

    // Log lifecycle event
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: agentId,
      event_type: 'STATE_CHANGE',
      from_state: from_state as AgentState,
      to_state: to_state as AgentState,
      metadata: {
        reported_by_agent: true,
        timestamp: timestamp || new Date().toISOString(),
      },
    });

    return NextResponse.json({
      message: 'State change recorded',
      agent_uuid: agentId,
      from_state,
      to_state,
      current_state: to_state,
    });
  } catch (error) {
    console.error('Error recording state change:', error);
    return NextResponse.json(
      { error: 'Failed to record state change' },
      { status: 500 }
    );
  }
}
