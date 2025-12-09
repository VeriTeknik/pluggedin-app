import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import {
  agentsTable,
  agentLifecycleEventsTable,
  AgentState,
} from '@/db/schema';

import { authenticate } from '../../../auth';
import { kubernetesService } from '@/lib/services/kubernetes-service';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';

/**
 * @swagger
 * /api/agents/{id}/shutdown:
 *   post:
 *     summary: Gracefully shutdown a PAP agent
 *     description: |
 *       Initiates graceful shutdown by transitioning agent to DRAINING state.
 *       The agent will:
 *       1. Stop accepting new work
 *       2. Complete in-flight requests
 *       3. Scale Kubernetes deployment to 0
 *       4. Transition to TERMINATED after drain period
 *
 *       Valid transitions: ACTIVE → DRAINING → TERMINATED
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
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               drain_timeout_seconds:
 *                 type: integer
 *                 description: Maximum time to wait for drain completion (default 300)
 *                 default: 300
 *                 minimum: 10
 *                 maximum: 3600
 *     responses:
 *       200:
 *         description: Successfully initiated shutdown.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 agent:
 *                   type: object
 *                 kubernetes:
 *                   type: object
 *       400:
 *         description: Bad Request - Invalid state transition or parameters.
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       404:
 *         description: Not Found - Agent does not exist.
 *       500:
 *         description: Internal Server Error - Failed to shutdown agent.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Apply rate limiting
    const rateLimitResult = await EnhancedRateLimiters.agentLifecycle(request);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rateLimitResult.retryAfter },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfter || 60),
            'X-RateLimit-Limit': String(rateLimitResult.limit),
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
            'X-RateLimit-Reset': new Date(rateLimitResult.reset).toISOString(),
          },
        }
      );
    }

    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const { id: agentId } = await params;

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const rawDrainTimeout = body.drain_timeout_seconds;

    // Validate drain timeout - must be an integer within bounds
    let drainTimeoutSeconds = 300; // default
    if (rawDrainTimeout !== undefined) {
      // Coerce to number and validate it's a positive integer
      const parsed = Number(rawDrainTimeout);
      if (!Number.isInteger(parsed) || parsed < 10 || parsed > 3600) {
        return NextResponse.json(
          { error: 'drain_timeout_seconds must be an integer between 10 and 3600' },
          { status: 400 }
        );
      }
      drainTimeoutSeconds = parsed;
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

    // Validate state transition (PAP-RFC-001 §7.2)
    // Valid: ACTIVE → DRAINING
    // Invalid: NEW, PROVISIONED, DRAINING (already draining), TERMINATED, KILLED
    const validTransitions = [AgentState.ACTIVE];
    if (!validTransitions.includes(agent.state as AgentState)) {
      return NextResponse.json(
        {
          error: `Invalid state transition: ${agent.state} → DRAINING. Agent must be in ACTIVE state.`,
          current_state: agent.state,
          allowed_states: validTransitions,
        },
        { status: 400 }
      );
    }

    // Scale Kubernetes deployment to 0 (graceful drain)
    let kubernetesResult = { success: true, message: 'No Kubernetes deployment' };
    if (agent.kubernetes_deployment) {
      kubernetesResult = await kubernetesService.scaleAgent(
        agent.kubernetes_deployment,
        0, // Scale to 0 replicas
        agent.kubernetes_namespace || 'agents'
      );
    }

    // Update agent state to DRAINING
    // Use optimistic locking - include current state in WHERE clause to prevent race conditions
    const updateResult = await db
      .update(agentsTable)
      .set({
        state: AgentState.DRAINING,
        metadata: {
          ...(agent.metadata as Record<string, unknown> || {}),
          drain_started_at: new Date().toISOString(),
          drain_timeout_seconds: drainTimeoutSeconds,
        },
      })
      .where(
        and(
          eq(agentsTable.uuid, agentId),
          eq(agentsTable.state, AgentState.ACTIVE) // Optimistic lock - only transition from ACTIVE
        )
      )
      .returning();

    // Check if update succeeded (no rows affected means state changed concurrently)
    if (updateResult.length === 0) {
      // Attempt to undo the Kubernetes scale (best effort)
      if (agent.kubernetes_deployment) {
        await kubernetesService.scaleAgent(
          agent.kubernetes_deployment,
          1,
          agent.kubernetes_namespace || 'agents'
        ).catch(() => {});
      }
      return NextResponse.json(
        {
          error: 'Shutdown failed due to concurrent modification',
          hint: 'Agent state changed while processing. Refresh and retry.',
        },
        { status: 409 } // Conflict
      );
    }

    const updatedAgent = updateResult[0];

    // Log lifecycle event
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: agentId,
      event_type: 'STATE_CHANGE',
      from_state: agent.state,
      to_state: AgentState.DRAINING,
      metadata: {
        triggered_by: auth.project.user_id,
        drain_timeout_seconds: drainTimeoutSeconds,
        kubernetes_result: kubernetesResult,
      },
    });

    return NextResponse.json({
      message: 'Agent shutdown initiated. Transitioning to DRAINING state.',
      agent: updatedAgent,
      kubernetes: kubernetesResult,
      drain_timeout_seconds: drainTimeoutSeconds,
    });
  } catch (error) {
    console.error('Error shutting down agent:', error);
    return NextResponse.json(
      { error: 'Failed to shutdown agent' },
      { status: 500 }
    );
  }
}
