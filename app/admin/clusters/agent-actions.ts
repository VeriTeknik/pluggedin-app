'use server';

import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db } from '@/db';
import {
  agentLifecycleEventsTable,
  agentsTable,
  AgentState,
  DeploymentStatus,
  users,
} from '@/db/schema';
import { getAdminEmails } from '@/lib/admin-notifications';
import { getAuthSession } from '@/lib/auth';
import { kubernetesService } from '@/lib/services/kubernetes-service';
import { sendNotification } from '@/lib/server-actions/notifications';

type ActionResult<T = void> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Check if the current user is an admin.
 * Returns user info if admin, null otherwise.
 */
async function checkAdminAuth(): Promise<{ userId: string; email: string } | null> {
  const session = await getAuthSession();

  if (!session?.user?.email || !session?.user?.id) {
    return null;
  }

  // Check database for admin status first
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  let isAdmin = user?.is_admin || false;

  // Fallback to environment variable check
  if (!isAdmin) {
    const adminEmails = getAdminEmails();
    isAdmin = adminEmails.includes(session.user.email);
  }

  if (!isAdmin) {
    return null;
  }

  return { userId: session.user.id, email: session.user.email };
}

type Agent = {
  uuid: string;
  name: string;
  dns_name: string;
  state: AgentState;
  deployment_status: DeploymentStatus;
  kubernetes_namespace: string | null;
  kubernetes_deployment: string | null;
  profile_uuid: string;
  created_at: Date;
  provisioned_at: Date | null;
  activated_at: Date | null;
  terminated_at: Date | null;
  last_heartbeat_at: Date | null;
  metadata: unknown;
};

/**
 * Get all agents with optional cluster filtering
 */
export async function getAgents(clusterNamespace?: string): Promise<ActionResult<Agent[]>> {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return { success: false, error: 'Unauthorized - Admin access required' };
    }

    const conditions = clusterNamespace
      ? [eq(agentsTable.kubernetes_namespace, clusterNamespace)]
      : [];

    const agents = await db
      .select({
        uuid: agentsTable.uuid,
        name: agentsTable.name,
        dns_name: agentsTable.dns_name,
        state: agentsTable.state,
        deployment_status: agentsTable.deployment_status,
        kubernetes_namespace: agentsTable.kubernetes_namespace,
        kubernetes_deployment: agentsTable.kubernetes_deployment,
        profile_uuid: agentsTable.profile_uuid,
        created_at: agentsTable.created_at,
        provisioned_at: agentsTable.provisioned_at,
        activated_at: agentsTable.activated_at,
        terminated_at: agentsTable.terminated_at,
        last_heartbeat_at: agentsTable.last_heartbeat_at,
        metadata: agentsTable.metadata,
      })
      .from(agentsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(agentsTable.created_at));

    return { success: true, data: agents };
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch agents',
    };
  }
}

/**
 * Resume an agent (transition from DRAINING back to ACTIVE state)
 * Optionally sends notification to agent owner
 */
export async function resumeAgent(
  agentId: string,
  options?: { sendNotification?: boolean; reason?: string }
): Promise<ActionResult> {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return { success: false, error: 'Unauthorized - Admin access required' };
    }

    // Find the agent
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.uuid, agentId),
    });

    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    // Only allow resuming DRAINING agents
    if (agent.state !== AgentState.DRAINING) {
      return {
        success: false,
        error: `Cannot resume agent in ${agent.state} state. Only DRAINING agents can be resumed.`,
      };
    }

    const previousState = agent.state;

    // Update agent state to ACTIVE
    await db
      .update(agentsTable)
      .set({
        state: AgentState.ACTIVE,
      })
      .where(eq(agentsTable.uuid, agentId));

    // Log lifecycle event
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: agentId,
      event_type: 'RESUMED',
      from_state: previousState,
      to_state: AgentState.ACTIVE,
      metadata: {
        triggered_by: admin.userId,
        admin_email: admin.email,
        reason: options?.reason || 'Admin resumed agent',
      },
    });

    // Send notification if requested
    if (options?.sendNotification) {
      try {
        await sendNotification({
          userId: agent.profile_uuid,
          title: `Agent Resumed: ${agent.name}`,
          message: options?.reason
            ? `Your agent "${agent.name}" has been resumed by an administrator. Reason: ${options.reason}`
            : `Your agent "${agent.name}" has been resumed by an administrator.`,
          type: 'success',
          sendEmail: true,
        });
      } catch (notifError) {
        console.error('Failed to send notification:', notifError);
        // Continue even if notification fails
      }
    }

    revalidatePath('/admin/clusters');
    return { success: true };
  } catch (error) {
    console.error('Failed to resume agent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resume agent',
    };
  }
}

/**
 * Suspend an agent (transition to DRAINING state)
 * Optionally sends notification to agent owner
 */
export async function suspendAgent(
  agentId: string,
  options?: { sendNotification?: boolean; reason?: string }
): Promise<ActionResult> {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return { success: false, error: 'Unauthorized - Admin access required' };
    }

    // Find the agent
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.uuid, agentId),
    });

    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    // Only allow suspending ACTIVE agents
    if (agent.state !== AgentState.ACTIVE) {
      return {
        success: false,
        error: `Cannot suspend agent in ${agent.state} state. Only ACTIVE agents can be suspended.`,
      };
    }

    const previousState = agent.state;

    // Update agent state to DRAINING
    await db
      .update(agentsTable)
      .set({
        state: AgentState.DRAINING,
      })
      .where(eq(agentsTable.uuid, agentId));

    // Log lifecycle event
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: agentId,
      event_type: 'SUSPENDED',
      from_state: previousState,
      to_state: AgentState.DRAINING,
      metadata: {
        triggered_by: admin.userId,
        admin_email: admin.email,
        reason: options?.reason || 'Admin initiated suspension',
      },
    });

    // Send notification if requested
    if (options?.sendNotification) {
      try {
        await sendNotification({
          userId: agent.profile_uuid,
          title: `Agent Suspended: ${agent.name}`,
          message: options?.reason
            ? `Your agent "${agent.name}" has been suspended by an administrator. Reason: ${options.reason}`
            : `Your agent "${agent.name}" has been suspended by an administrator.`,
          type: 'warning',
          sendEmail: true,
        });
      } catch (notifError) {
        console.error('Failed to send notification:', notifError);
        // Continue even if notification fails
      }
    }

    revalidatePath('/admin/clusters');
    return { success: true };
  } catch (error) {
    console.error('Failed to suspend agent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to suspend agent',
    };
  }
}

/**
 * Terminate an agent (transition to TERMINATED state and delete K8s resources)
 * Optionally sends notification to agent owner
 */
export async function terminateAgent(
  agentId: string,
  options?: { sendNotification?: boolean; reason?: string }
): Promise<ActionResult> {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return { success: false, error: 'Unauthorized - Admin access required' };
    }

    // Find the agent
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.uuid, agentId),
    });

    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    // Don't allow terminating already terminated/killed agents
    if (agent.state === AgentState.TERMINATED || agent.state === AgentState.KILLED) {
      return {
        success: false,
        error: `Agent is already ${agent.state}`,
      };
    }

    const previousState = agent.state;

    // Delete from Kubernetes if deployed
    if (agent.kubernetes_deployment && agent.kubernetes_namespace) {
      try {
        await kubernetesService.deleteAgent(
          agent.kubernetes_deployment,
          agent.kubernetes_namespace
        );
      } catch (k8sError) {
        console.error('Failed to delete Kubernetes resources:', k8sError);
        // Continue with database update even if K8s deletion fails
      }
    }

    // Update agent state to TERMINATED
    await db
      .update(agentsTable)
      .set({
        state: AgentState.TERMINATED,
        terminated_at: new Date(),
        deployment_status: DeploymentStatus.UNDEPLOYED,
      })
      .where(eq(agentsTable.uuid, agentId));

    // Log lifecycle event
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: agentId,
      event_type: 'TERMINATED',
      from_state: previousState,
      to_state: AgentState.TERMINATED,
      metadata: {
        triggered_by: admin.userId,
        admin_email: admin.email,
        reason: options?.reason || 'Admin initiated termination',
      },
    });

    // Send notification if requested
    if (options?.sendNotification) {
      try {
        await sendNotification({
          userId: agent.profile_uuid,
          title: `Agent Terminated: ${agent.name}`,
          message: options?.reason
            ? `Your agent "${agent.name}" has been terminated by an administrator. Reason: ${options.reason}`
            : `Your agent "${agent.name}" has been terminated by an administrator.`,
          type: 'error',
          sendEmail: true,
        });
      } catch (notifError) {
        console.error('Failed to send notification:', notifError);
        // Continue even if notification fails
      }
    }

    revalidatePath('/admin/clusters');
    return { success: true };
  } catch (error) {
    console.error('Failed to terminate agent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to terminate agent',
    };
  }
}

/**
 * Kill an agent (forcefully terminate and delete)
 * Optionally sends notification to agent owner
 */
export async function killAgent(
  agentId: string,
  options?: { sendNotification?: boolean; reason?: string }
): Promise<ActionResult> {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return { success: false, error: 'Unauthorized - Admin access required' };
    }

    // Find the agent
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.uuid, agentId),
    });

    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    const previousState = agent.state;

    // Forcefully delete from Kubernetes if deployed
    if (agent.kubernetes_deployment && agent.kubernetes_namespace) {
      try {
        await kubernetesService.deleteAgent(
          agent.kubernetes_deployment,
          agent.kubernetes_namespace
        );
      } catch (k8sError) {
        console.error('Failed to delete Kubernetes resources:', k8sError);
        // Continue with database update even if K8s deletion fails
      }
    }

    // Update agent state to KILLED
    await db
      .update(agentsTable)
      .set({
        state: AgentState.KILLED,
        terminated_at: new Date(),
        deployment_status: DeploymentStatus.UNDEPLOYED,
      })
      .where(eq(agentsTable.uuid, agentId));

    // Log lifecycle event
    await db.insert(agentLifecycleEventsTable).values({
      agent_uuid: agentId,
      event_type: 'KILLED',
      from_state: previousState,
      to_state: AgentState.KILLED,
      metadata: {
        triggered_by: admin.userId,
        admin_email: admin.email,
        reason: options?.reason || 'Admin initiated kill',
      },
    });

    // Send notification if requested
    if (options?.sendNotification) {
      try {
        await sendNotification({
          userId: agent.profile_uuid,
          title: `Agent Killed: ${agent.name}`,
          message: options?.reason
            ? `Your agent "${agent.name}" has been forcefully terminated by an administrator. Reason: ${options.reason}`
            : `Your agent "${agent.name}" has been forcefully terminated by an administrator.`,
          type: 'error',
          sendEmail: true,
        });
      } catch (notifError) {
        console.error('Failed to send notification:', notifError);
        // Continue even if notification fails
      }
    }

    revalidatePath('/admin/clusters');
    return { success: true };
  } catch (error) {
    console.error('Failed to kill agent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to kill agent',
    };
  }
}

/**
 * Permanently delete an agent from the database
 * Only allowed for TERMINATED or KILLED agents
 * Optionally sends notification to agent owner
 */
export async function deleteAgent(
  agentId: string,
  options?: { sendNotification?: boolean; reason?: string }
): Promise<ActionResult> {
  try {
    const admin = await checkAdminAuth();
    if (!admin) {
      return { success: false, error: 'Unauthorized - Admin access required' };
    }

    // Find the agent
    const agent = await db.query.agentsTable.findFirst({
      where: eq(agentsTable.uuid, agentId),
    });

    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    // Only allow deleting TERMINATED or KILLED agents
    if (agent.state !== AgentState.TERMINATED && agent.state !== AgentState.KILLED) {
      return {
        success: false,
        error: `Cannot delete agent in ${agent.state} state. Terminate or kill the agent first.`,
      };
    }

    // Send notification before deletion if requested
    if (options?.sendNotification) {
      try {
        await sendNotification({
          userId: agent.profile_uuid,
          title: `Agent Deleted: ${agent.name}`,
          message: options?.reason
            ? `Your agent "${agent.name}" has been permanently deleted by an administrator. Reason: ${options.reason}`
            : `Your agent "${agent.name}" has been permanently deleted by an administrator.`,
          type: 'error',
          sendEmail: true,
        });
      } catch (notifError) {
        console.error('Failed to send notification:', notifError);
        // Continue even if notification fails
      }
    }

    // Delete agent from database (cascade deletes lifecycle events via foreign key)
    await db.delete(agentsTable).where(eq(agentsTable.uuid, agentId));

    revalidatePath('/admin/clusters');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete agent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete agent',
    };
  }
}
