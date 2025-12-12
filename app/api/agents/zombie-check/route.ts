import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { db } from '@/db';
import {
  agentLifecycleEventsTable,
  agentsTable,
  AgentState,
  HeartbeatMode,
} from '@/db/schema';
import {
  DEFAULT_HEARTBEAT_INTERVAL,
  HEARTBEAT_INTERVALS,
  ZOMBIE_AUTO_DRAIN_MULTIPLIER,
  ZOMBIE_GRACE_MULTIPLIER,
} from '@/lib/pap-constants';

// Map HeartbeatMode enum values to HEARTBEAT_INTERVALS keys
const MODE_INTERVALS: Record<string, number> = {
  [HeartbeatMode.EMERGENCY]: HEARTBEAT_INTERVALS.EMERGENCY,
  [HeartbeatMode.IDLE]: HEARTBEAT_INTERVALS.IDLE,
  [HeartbeatMode.SLEEP]: HEARTBEAT_INTERVALS.SLEEP,
};

/**
 * Verify cron authorization
 * Security: Fail closed - require CRON_SECRET in non-development environments
 */
function verifyCronAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isDevelopment = process.env.NODE_ENV === 'development';

  // In production, CRON_SECRET is required
  if (!cronSecret && !isDevelopment) {
    console.error('[Zombie Check] CRON_SECRET not configured in production');
    return NextResponse.json(
      { error: 'Zombie check endpoint not configured' },
      { status: 503 }
    );
  }

  // If CRON_SECRET is configured, verify authorization
  if (cronSecret && (!authHeader || authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  return null; // Auth passed
}

/**
 * @swagger
 * /api/agents/zombie-check:
 *   post:
 *     summary: Check for zombie agents (missed heartbeats)
 *     description: |
 *       Scans all ACTIVE agents for missed heartbeats (PAP-RFC-001 §8.1).
 *       Zombie detection: One missed heartbeat interval → AGENT_UNHEALTHY (480)
 *
 *       This endpoint should be called periodically by a cron job.
 *       Recommended interval: Every 30 seconds for timely detection.
 *     tags:
 *       - PAP Agents
 *       - Cron
 *     security:
 *       - cronSecret: []
 *     responses:
 *       200:
 *         description: Zombie check completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 checked:
 *                   type: integer
 *                   description: Number of active agents checked
 *                 unhealthy:
 *                   type: integer
 *                   description: Number of agents detected as unhealthy
 *                 drained:
 *                   type: integer
 *                   description: Number of agents auto-drained due to prolonged unresponsiveness
 *       401:
 *         description: Unauthorized - Invalid or missing CRON_SECRET.
 *       503:
 *         description: Service Unavailable - CRON_SECRET not configured in production.
 */
export async function POST(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const now = new Date();
    let checkedCount = 0;
    let unhealthyCount = 0;
    let drainedCount = 0;

    // Get all ACTIVE agents
    const activeAgents = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.state, AgentState.ACTIVE));

    for (const agent of activeAgents) {
      checkedCount++;

      const lastHeartbeat = agent.last_heartbeat_at;
      if (!lastHeartbeat) {
        // No heartbeat ever received but marked ACTIVE - this shouldn't happen
        // Log as unhealthy
        unhealthyCount++;
        await logUnhealthyEvent(agent.uuid, 'No heartbeat ever received while ACTIVE');
        continue;
      }

      // Get heartbeat mode from metadata
      const metadata = agent.metadata as Record<string, unknown> | null;
      const lastMode = (metadata?.last_heartbeat_mode as string) || HeartbeatMode.IDLE;
      const interval = MODE_INTERVALS[lastMode] || DEFAULT_HEARTBEAT_INTERVAL;

      // Calculate time since last heartbeat
      const timeSinceHeartbeat = now.getTime() - new Date(lastHeartbeat).getTime();
      const missedIntervals = Math.floor(timeSinceHeartbeat / interval);

      if (missedIntervals >= ZOMBIE_GRACE_MULTIPLIER) {
        unhealthyCount++;

        // Log unhealthy event
        await logUnhealthyEvent(
          agent.uuid,
          `Missed ${missedIntervals} heartbeat intervals (mode: ${lastMode}, interval: ${interval}ms)`,
          missedIntervals
        );

        // Auto-drain if too many missed intervals
        if (ZOMBIE_AUTO_DRAIN_MULTIPLIER > 0 && missedIntervals >= ZOMBIE_AUTO_DRAIN_MULTIPLIER) {
          // Use optimistic locking - only transition from ACTIVE to prevent invalid state transitions
          // This guards against race conditions where state changed between query and update
          const updateResult = await db
            .update(agentsTable)
            .set({
              state: AgentState.DRAINING,
            })
            .where(
              and(
                eq(agentsTable.uuid, agent.uuid),
                eq(agentsTable.state, AgentState.ACTIVE) // Only transition from ACTIVE
              )
            )
            .returning();

          // Only log event and count if update actually happened
          if (updateResult.length > 0) {
            await db.insert(agentLifecycleEventsTable).values([{
              agent_uuid: agent.uuid,
              event_type: 'AUTO_DRAINING',
              from_state: AgentState.ACTIVE,
              to_state: AgentState.DRAINING,
              metadata: {
                triggered_by: 'zombie_detection',
                missed_intervals: missedIntervals,
                last_heartbeat: new Date(lastHeartbeat).toISOString(),
                reason: `Agent unresponsive for ${missedIntervals} intervals`,
              },
            }]);

            drainedCount++;
            console.log(`[Zombie Check] Auto-draining agent ${agent.name} (${agent.uuid}) - ${missedIntervals} missed intervals`);
          } else {
            // State changed concurrently - log for debugging but don't count as drained
            console.log(`[Zombie Check] Skipped auto-drain for ${agent.name} (${agent.uuid}) - state changed concurrently`);
          }
        }
      }
    }

    console.log(`[Zombie Check] Checked ${checkedCount} agents, ${unhealthyCount} unhealthy, ${drainedCount} auto-drained`);

    return NextResponse.json({
      success: true,
      checked: checkedCount,
      unhealthy: unhealthyCount,
      drained: drainedCount,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('[Zombie Check] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agents/zombie-check
 * Get current zombie status for all agents
 */
export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const now = new Date();

    // Get all ACTIVE agents with their heartbeat info
    const activeAgents = await db
      .select({
        uuid: agentsTable.uuid,
        name: agentsTable.name,
        state: agentsTable.state,
        last_heartbeat_at: agentsTable.last_heartbeat_at,
        metadata: agentsTable.metadata,
      })
      .from(agentsTable)
      .where(eq(agentsTable.state, AgentState.ACTIVE));

    const agentStatus = activeAgents.map((agent) => {
      const lastHeartbeat = agent.last_heartbeat_at;
      const metadata = agent.metadata as Record<string, unknown> | null;
      const lastMode = (metadata?.last_heartbeat_mode as string) || HeartbeatMode.IDLE;
      const interval = MODE_INTERVALS[lastMode] || DEFAULT_HEARTBEAT_INTERVAL;

      if (!lastHeartbeat) {
        return {
          uuid: agent.uuid,
          name: agent.name,
          healthy: false,
          reason: 'No heartbeat received',
          lastHeartbeat: null,
          mode: lastMode,
          interval,
        };
      }

      const timeSinceHeartbeat = now.getTime() - new Date(lastHeartbeat).getTime();
      const missedIntervals = Math.floor(timeSinceHeartbeat / interval);
      const healthy = missedIntervals < ZOMBIE_GRACE_MULTIPLIER;

      return {
        uuid: agent.uuid,
        name: agent.name,
        healthy,
        missedIntervals,
        timeSinceHeartbeat,
        lastHeartbeat: new Date(lastHeartbeat).toISOString(),
        mode: lastMode,
        interval,
      };
    });

    const healthyCount = agentStatus.filter((a) => a.healthy).length;
    const unhealthyCount = agentStatus.filter((a) => !a.healthy).length;

    return NextResponse.json({
      success: true,
      summary: {
        total: activeAgents.length,
        healthy: healthyCount,
        unhealthy: unhealthyCount,
      },
      agents: agentStatus,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('[Zombie Check] Error getting status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Log an unhealthy agent event
 */
async function logUnhealthyEvent(
  agentUuid: string,
  reason: string,
  missedIntervals?: number
): Promise<void> {
  await db.insert(agentLifecycleEventsTable).values([{
    agent_uuid: agentUuid,
    event_type: 'UNHEALTHY',
    from_state: AgentState.ACTIVE,
    to_state: AgentState.ACTIVE, // State doesn't change, just logged
    metadata: {
      triggered_by: 'zombie_detection',
      reason,
      missed_intervals: missedIntervals,
      error_code: '480', // AGENT_UNHEALTHY per PAP-RFC-001 §10
    },
  }]);
}
