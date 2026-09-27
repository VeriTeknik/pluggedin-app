import { eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { agentsTable, agentTemplatesTable, profilesTable, projectsTable } from '@/db/schema';
import { isReservedName } from '@/lib/agent-name-policy';
import { type AgentTemplateKind, agentTemplateKind } from '@/lib/agents/template-kind';
import log from '@/lib/logger';
import { kubernetesService } from '@/lib/services/kubernetes-service';

export interface AgentTeardownResult {
  ok: boolean;
  failed: Array<{ uuid: string; name: string; message: string }>;
}

export interface AgentTeardownTarget {
  uuid: string;
  name: string;
  kubernetes_deployment: string | null;
  kubernetes_namespace: string | null;
  // Decide which resource types the agent can own (see resolveTemplateKinds).
  template_uuid?: string | null;
  metadata?: unknown;
}

const TEARDOWN_COLUMNS = {
  uuid: agentsTable.uuid,
  name: agentsTable.name,
  kubernetes_deployment: agentsTable.kubernetes_deployment,
  kubernetes_namespace: agentsTable.kubernetes_namespace,
  template_uuid: agentsTable.template_uuid,
  metadata: agentsTable.metadata,
};

/**
 * The template kind of each agent, keyed by agent uuid, from its template row
 * (one query for all of them; none when no agent has a template). deleteAgent
 * limits its legacy (unlabelled) pass to the resource types the template
 * creates, and does not let a permission error on any other type block the
 * teardown.
 */
async function resolveTemplateKinds(agents: AgentTeardownTarget[]): Promise<Map<string, AgentTemplateKind>> {
  const templateUuids = [...new Set(agents.map((a) => a.template_uuid).filter((u): u is string => !!u))];
  const templates = new Map<string, { namespace: string; name: string }>();
  if (templateUuids.length > 0) {
    const rows = await db
      .select({ uuid: agentTemplatesTable.uuid, namespace: agentTemplatesTable.namespace, name: agentTemplatesTable.name })
      .from(agentTemplatesTable)
      .where(inArray(agentTemplatesTable.uuid, templateUuids));
    for (const row of rows) templates.set(row.uuid, row);
  }
  return new Map(
    agents.map((a) => [a.uuid, agentTemplateKind(a.template_uuid ? templates.get(a.template_uuid) : null, a.metadata)])
  );
}

/** Template kind of one agent (used by DELETE /api/agents/[id]). */
export async function templateKindOfAgent(agent: {
  uuid: string;
  template_uuid?: string | null;
  metadata?: unknown;
}): Promise<AgentTemplateKind> {
  const kinds = await resolveTemplateKinds([
    { ...agent, name: '', kubernetes_deployment: null, kubernetes_namespace: null },
  ]);
  return kinds.get(agent.uuid) ?? 'standard';
}

/**
 * Remove the Kubernetes resources of the given agents.
 *
 * Kubernetes resources are addressed by the agent's name, and agent names are
 * globally unique only while the agent row exists. Anything that deletes agent
 * rows (account deletion, project deletion, an admin hard delete) must run
 * this first and stop if it fails; otherwise the name is freed while the
 * Deployment, Secret and PVC stay behind for whoever registers the name next.
 *
 * Uses the same kubernetesService.deleteAgent path as DELETE /api/agents/[id],
 * passing the agent's uuid so only resources labelled for this agent (or
 * unlabelled, pre-label ones of the types its template creates) are deleted,
 * and its template kind (see resolveTemplateKinds). It is idempotent:
 * resources that are already gone count as deleted, so already-terminated
 * agents are simply re-checked.
 */
async function teardownAgents(
  agents: AgentTeardownTarget[],
  context: Record<string, unknown>
): Promise<AgentTeardownResult> {
  const failed: AgentTeardownResult['failed'] = [];

  // Without cluster credentials (the same check kubernetes-service makes) the
  // app cannot have created any resources, and every call would fail. Do not
  // turn that into a permanent refusal to erase the account or Hub.
  if (!process.env.K8S_SERVICE_ACCOUNT_TOKEN) {
    if (agents.some((agent) => agent.kubernetes_deployment)) {
      log.warn('Kubernetes is not configured; skipping agent teardown', { ...context, agents: agents.length });
    }
    return { ok: true, failed };
  }

  // Agents that were never deployed have nothing in the cluster: only a
  // successful deploy records kubernetes_deployment (app/api/agents/route.ts).
  const deployed = agents.filter((agent) => agent.kubernetes_deployment);
  const kinds = deployed.length > 0 ? await resolveTemplateKinds(deployed) : new Map<string, AgentTemplateKind>();

  for (const agent of deployed) {
    const deployment = agent.kubernetes_deployment as string;

    // A name registered before it was reserved may belong to shared
    // infrastructure (e.g. pap-collector). Never delete by such a name; the
    // policy keeps it unclaimable, so leaving it for an operator is safe.
    if (isReservedName(deployment)) {
      log.warn('Skipping Kubernetes teardown for agent with a reserved name', {
        agentUuid: agent.uuid,
        deployment,
        ...context,
      });
      continue;
    }

    try {
      const result = await kubernetesService.deleteAgent(
        deployment,
        agent.kubernetes_namespace || 'agents',
        agent.uuid,
        { templateKind: kinds.get(agent.uuid) ?? 'opencode' }
      );
      if (!result.success) {
        failed.push({ uuid: agent.uuid, name: agent.name, message: result.message });
      }
    } catch (error) {
      failed.push({
        uuid: agent.uuid,
        name: agent.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { ok: failed.length === 0, failed };
}

/** Remove the Kubernetes resources of every agent a user owns. */
export async function teardownAgentsOwnedByUser(userId: string): Promise<AgentTeardownResult> {
  const owned = await db
    .select(TEARDOWN_COLUMNS)
    .from(agentsTable)
    .innerJoin(profilesTable, eq(agentsTable.profile_uuid, profilesTable.uuid))
    .innerJoin(projectsTable, eq(profilesTable.project_uuid, projectsTable.uuid))
    .where(eq(projectsTable.user_id, userId));

  return teardownAgents(owned, { userId });
}

/**
 * Remove the Kubernetes resources of every agent in a Hub (project). The
 * caller must have verified that the Hub belongs to the acting user.
 */
export async function teardownAgentsInProject(projectUuid: string): Promise<AgentTeardownResult> {
  const agents = await db
    .select(TEARDOWN_COLUMNS)
    .from(agentsTable)
    .innerJoin(profilesTable, eq(agentsTable.profile_uuid, profilesTable.uuid))
    .where(eq(profilesTable.project_uuid, projectUuid));

  return teardownAgents(agents, { projectUuid });
}

/** Remove the Kubernetes resources of a single agent. */
export async function teardownAgent(agent: AgentTeardownTarget): Promise<AgentTeardownResult> {
  return teardownAgents([agent], { agentUuid: agent.uuid });
}
