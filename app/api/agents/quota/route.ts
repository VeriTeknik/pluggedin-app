import { count, eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db';
import { agentsTable, AgentState } from '@/db/schema';

import { authenticate } from '../../auth';

/**
 * @swagger
 * /api/agents/quota:
 *   get:
 *     summary: Get agent quota and usage for the active profile
 *     description: |
 *       Returns quota information including:
 *       - Current agent count (total and by state)
 *       - Maximum allowed agents per profile
 *       - Remaining quota
 *       - Resource usage summary
 *
 *       Useful for:
 *       - Checking if more agents can be created
 *       - Monitoring resource consumption
 *       - Capacity planning
 *     tags:
 *       - PAP Agents
 *     security:
 *       - apiKey: []
 *     responses:
 *       200:
 *         description: Successfully retrieved quota information.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   type: object
 *                   properties:
 *                     uuid:
 *                       type: string
 *                     name:
 *                       type: string
 *                 quota:
 *                   type: object
 *                   properties:
 *                     max_agents:
 *                       type: integer
 *                       description: Maximum agents allowed (-1 for unlimited)
 *                     current_agents:
 *                       type: integer
 *                       description: Total agent count
 *                     remaining:
 *                       type: integer
 *                       description: Remaining quota (-1 for unlimited)
 *                     can_create_more:
 *                       type: boolean
 *                 agents_by_state:
 *                   type: object
 *                   description: Agent count grouped by state
 *                 resource_usage:
 *                   type: object
 *                   description: Optional resource consumption summary
 *       401:
 *         description: Unauthorized - Invalid or missing API key.
 *       500:
 *         description: Internal Server Error - Failed to fetch quota.
 */
export async function GET(request: Request) {
  try {
    const auth = await authenticate(request);
    if (auth.error) return auth.error;

    // Get total agent count for profile
    const totalAgentsResult = await db
      .select({ count: count() })
      .from(agentsTable)
      .where(eq(agentsTable.profile_uuid, auth.activeProfile.uuid));

    const totalAgents = totalAgentsResult[0]?.count || 0;

    // Get agent count by state
    const agentsByStateResult = await db
      .select({
        state: agentsTable.state,
        count: count(),
      })
      .from(agentsTable)
      .where(eq(agentsTable.profile_uuid, auth.activeProfile.uuid))
      .groupBy(agentsTable.state);

    const agentsByState = agentsByStateResult.reduce(
      (acc, row) => {
        acc[row.state] = row.count;
        return acc;
      },
      {} as Record<string, number>
    );

    // Calculate quota limits
    // TODO: Make this configurable per profile (e.g., from profile metadata or subscription tier)
    // For now, use sensible defaults:
    // - Free tier: 10 agents
    // - Pro tier: 100 agents
    // - Enterprise: unlimited (-1)
    const profileMetadata = auth.activeProfile.metadata as Record<string, unknown> | null;
    const tier = (profileMetadata?.subscription_tier as string) || 'free';

    let maxAgents = 10; // Default: free tier
    if (tier === 'pro') maxAgents = 100;
    if (tier === 'enterprise') maxAgents = -1; // unlimited

    // Allow override from profile metadata
    if (profileMetadata?.max_agents !== undefined) {
      maxAgents = profileMetadata.max_agents as number;
    }

    const remaining = maxAgents === -1 ? -1 : Math.max(0, maxAgents - totalAgents);
    const canCreateMore = maxAgents === -1 || totalAgents < maxAgents;

    // Calculate active agents (PROVISIONED + ACTIVE)
    const activeAgents =
      (agentsByState[AgentState.PROVISIONED] || 0) + (agentsByState[AgentState.ACTIVE] || 0);

    // Build response
    const quotaInfo = {
      profile: {
        uuid: auth.activeProfile.uuid,
        name: auth.activeProfile.name,
        tier,
      },
      quota: {
        max_agents: maxAgents,
        current_agents: totalAgents,
        remaining,
        can_create_more: canCreateMore,
      },
      agents_by_state: {
        total: totalAgents,
        new: agentsByState[AgentState.NEW] || 0,
        provisioned: agentsByState[AgentState.PROVISIONED] || 0,
        active: agentsByState[AgentState.ACTIVE] || 0,
        draining: agentsByState[AgentState.DRAINING] || 0,
        terminated: agentsByState[AgentState.TERMINATED] || 0,
        killed: agentsByState[AgentState.KILLED] || 0,
        active_total: activeAgents,
      },
      resource_usage: {
        note: 'Resource metrics aggregation not yet implemented',
        // TODO: Aggregate resource consumption from agent_metrics table
        // planned_metrics: {
        //   total_cpu_percent: 0,
        //   total_memory_mb: 0,
        //   avg_cpu_percent: 0,
        //   avg_memory_mb: 0,
        //   requests_handled_total: 0,
        // },
      },
    };

    return NextResponse.json(quotaInfo);
  } catch (error) {
    console.error('Error fetching quota:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quota information' },
      { status: 500 }
    );
  }
}
