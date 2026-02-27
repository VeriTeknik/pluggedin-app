import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import {
  AccessLevel,
  agentHeartbeatsTable,
  agentLifecycleEventsTable,
  agentMetricsTable,
  agentsTable,
  AgentState,
} from '@/db/schema';
import { EnhancedRateLimiters } from '@/lib/rate-limiter-redis';
import { serializeForJson } from '@/lib/serialize-for-json';
import { kubernetesService } from '@/lib/services/kubernetes-service';

import { authenticate } from '../../auth';

/**
 * Apply rate limiting and return 429 response if exceeded.
 */
async function applyRateLimit(
  request: NextRequest,
  limiter: typeof EnhancedRateLimiters.agentRead
): Promise<NextResponse | null> {
  const result = await limiter(request);
  if (!result.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', retryAfter: result.retryAfter },
      {
        status: 429,
        headers: {
          'Retry-After': String(result.retryAfter || 60),
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': String(result.remaining),
          'X-RateLimit-Reset': new Date(result.reset).toISOString(),
        },
      }
    );
  }
  return null;
}

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(request, EnhancedRateLimiters.agentRead);
    if (rateLimitResponse) return rateLimitResponse;

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

    // Fetch all related data in parallel for better performance
    const [recentHeartbeats, recentMetrics, lifecycleEvents, kubernetesStatus] = await Promise.all([
      // Recent heartbeats (last 10)
      db
        .select()
        .from(agentHeartbeatsTable)
        .where(eq(agentHeartbeatsTable.agent_uuid, agentId))
        .orderBy(desc(agentHeartbeatsTable.timestamp))
        .limit(10),

      // Recent metrics (last 10)
      db
        .select()
        .from(agentMetricsTable)
        .where(eq(agentMetricsTable.agent_uuid, agentId))
        .orderBy(desc(agentMetricsTable.timestamp))
        .limit(10),

      // Lifecycle events (limit to 100 most recent to prevent unbounded queries)
      db
        .select()
        .from(agentLifecycleEventsTable)
        .where(eq(agentLifecycleEventsTable.agent_uuid, agentId))
        .orderBy(desc(agentLifecycleEventsTable.timestamp))
        .limit(100),

      // Kubernetes deployment status (null if no deployment)
      agent.kubernetes_deployment
        ? kubernetesService.getDeploymentStatus(
            agent.kubernetes_deployment,
            agent.kubernetes_namespace || 'agents'
          )
        : Promise.resolve(null),
    ]);

    return NextResponse.json(serializeForJson({
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(request, EnhancedRateLimiters.agentDelete);
    if (rateLimitResponse) return rateLimitResponse;

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

    // Delete from Kubernetes (unified delete handles all template types)
    let kubernetesResult: { success: boolean; message: string } = { success: true, message: 'No Kubernetes deployment' };
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

/**
 * @swagger
 * /api/agents/{id}:
 *   patch:
 *     summary: Update a PAP agent
 *     description: |
 *       Updates agent properties like access level, metadata, etc.
 *       Use this to enable/disable link sharing (public access).
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
 *         description: The UUID of the agent to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               access_level:
 *                 type: string
 *                 enum: [PRIVATE, PUBLIC]
 *                 description: Access control level (PUBLIC enables link sharing)
 *               metadata:
 *                 type: object
 *                 description: Additional metadata to merge
 *     responses:
 *       200:
 *         description: Successfully updated the agent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 agent:
 *                   type: object
 *       400:
 *         description: Bad Request - Invalid access level or parameters.
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       404:
 *         description: Not Found - Agent does not exist or does not belong to the profile.
 *       500:
 *         description: Internal Server Error - Failed to update agent.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(request, EnhancedRateLimiters.agentUpdate);
    if (rateLimitResponse) return rateLimitResponse;

    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    const { id: agentId } = await params;
    const body = await request.json();
    const { access_level, metadata: newMetadata } = body;

    // Validate metadata size to prevent abuse (max 64KB)
    if (newMetadata !== undefined) {
      const metadataStr = JSON.stringify(newMetadata);
      if (metadataStr.length > 65536) {
        return NextResponse.json(
          { error: 'Metadata exceeds maximum size of 64KB' },
          { status: 400 }
        );
      }
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

    // Build update object
    const updateData: {
      access_level?: typeof AccessLevel[keyof typeof AccessLevel];
      metadata?: Record<string, unknown>;
    } = {};

    // Validate and set access_level if provided
    if (access_level !== undefined) {
      const validAccessLevels = Object.values(AccessLevel);
      if (!validAccessLevels.includes(access_level)) {
        return NextResponse.json(
          { error: `Invalid access_level. Must be one of: ${validAccessLevels.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.access_level = access_level;
    }

    // Merge metadata if provided
    if (newMetadata !== undefined) {
      updateData.metadata = {
        ...(agent.metadata as Record<string, unknown> || {}),
        ...newMetadata,
      };
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Update agent
    const [updatedAgent] = await db
      .update(agentsTable)
      .set(updateData)
      .where(eq(agentsTable.uuid, agentId))
      .returning();

    // Log lifecycle event for access level change
    if (access_level !== undefined && access_level !== agent.access_level) {
      await db.insert(agentLifecycleEventsTable).values({
        agent_uuid: agentId,
        event_type: 'ACCESS_LEVEL_CHANGED',
        from_state: agent.state,
        to_state: agent.state,
        metadata: {
          triggered_by: auth.project.user_id,
          previous_access_level: agent.access_level,
          new_access_level: access_level,
        },
      });
    }

    return NextResponse.json({
      message: 'Agent updated successfully',
      agent: serializeForJson(updatedAgent),
    });
  } catch (error) {
    console.error('Error updating agent:', error);
    return NextResponse.json(
      { error: 'Failed to update agent' },
      { status: 500 }
    );
  }
}
