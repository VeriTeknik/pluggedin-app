/**
 * deleteProject removed the projects row and let the FK cascade
 * (projects → profiles → agents) drop the agent rows — and with them the
 * globally unique agent names — without touching Kubernetes. The Deployment,
 * Secret (Hub API key, model-router token) and workspace PVC stayed in the
 * shared namespace under a name anyone could register next. Account deletion
 * already tears agents down first; project deletion is the same cascade.
 *
 * deleteProject now tears down the Hub's agents through
 * kubernetesService.deleteAgent (with each agent's uuid, so ownership labels
 * are checked) and keeps the Hub — and the names — when that fails.
 */
import { getTableName } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT = '33333333-3333-4333-8333-333333333333';

const m = vi.hoisted(() => ({
  events: [] as string[],
  projects: [] as Array<{ uuid: string; user_id: string }>,
  agents: [] as Array<{
    uuid: string;
    name: string;
    kubernetes_deployment: string | null;
    kubernetes_namespace: string | null;
  }>,
  agentWhere: [] as unknown[],
  deleteAgent: vi.fn(),
  projectDelete: vi.fn(),
}));

vi.mock('@/lib/auth-helpers', () => ({
  withAuth: async (fn: (s: unknown) => unknown) => fn({ user: { id: 'user-1' } }),
  withProjectAuth: async (uuid: string, fn: (s: unknown, p: unknown) => unknown) =>
    fn({ user: { id: 'user-1' } }, { uuid, user_id: 'user-1' }),
}));
vi.mock('@/lib/default-project-creation', () => ({ createDefaultProject: vi.fn() }));
vi.mock('@/lib/services/kubernetes-service', () => ({
  kubernetesService: { deleteAgent: m.deleteAgent },
}));
vi.mock('@/db', () => {
  function selectChain() {
    let table = '';
    const chain = {
      from: (t: Parameters<typeof getTableName>[0]) => {
        table = getTableName(t);
        return chain;
      },
      innerJoin: () => chain,
      where: async (clause: unknown) => {
        if (table === 'agents') {
          m.agentWhere.push(clause);
          return m.agents;
        }
        return m.projects;
      },
    };
    return chain;
  }
  return {
    db: {
      select: () => selectChain(),
      delete: () => ({
        where: async () => {
          m.events.push('delete-project');
          m.projectDelete();
        },
      }),
    },
  };
});

async function deleteProject() {
  const { deleteProject: action } = await import('@/app/actions/projects');
  return action(PROJECT);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('K8S_SERVICE_ACCOUNT_TOKEN', 'test-token');
  m.events = [];
  m.agentWhere = [];
  m.projects = [
    { uuid: PROJECT, user_id: 'user-1' },
    { uuid: 'other-hub', user_id: 'user-1' },
  ];
  m.agents = [
    { uuid: 'a1', name: 'alpha', kubernetes_deployment: 'alpha', kubernetes_namespace: 'agents' },
    { uuid: 'a2', name: 'beta', kubernetes_deployment: 'beta', kubernetes_namespace: 'agents-dev' },
    { uuid: 'a3', name: 'never-deployed', kubernetes_deployment: null, kubernetes_namespace: 'agents' },
  ];
  m.deleteAgent.mockImplementation(async (name: string) => {
    m.events.push(`k8s-delete:${name}`);
    return { success: true, message: 'ok' };
  });
});

describe('project deletion and agent infrastructure', () => {
  it('tears down every deployed agent of the Hub before the project row goes', async () => {
    await expect(deleteProject()).resolves.toEqual({ success: true });

    expect(m.deleteAgent).toHaveBeenCalledWith('alpha', 'agents', 'a1', { templateKind: 'standard' });
    expect(m.deleteAgent).toHaveBeenCalledWith('beta', 'agents-dev', 'a2', { templateKind: 'standard' });
    expect(m.deleteAgent).toHaveBeenCalledTimes(2);
    expect(m.events.indexOf('delete-project')).toBeGreaterThan(m.events.indexOf('k8s-delete:alpha'));
    expect(m.events.indexOf('delete-project')).toBeGreaterThan(m.events.indexOf('k8s-delete:beta'));
  });

  it('only looks up agents of this Hub', async () => {
    await deleteProject();

    expect(m.agentWhere).toHaveLength(1);
    const { sql, params } = new PgDialect().sqlToQuery(m.agentWhere[0] as never);
    expect(sql).toMatch(/"profiles"\."project_uuid" = \$1/);
    expect(params).toEqual([PROJECT]);
  });

  it('keeps the project (and its agent names) when a teardown fails', async () => {
    m.deleteAgent.mockImplementation(async (name: string) =>
      name === 'beta'
        ? { success: false, message: 'Agent beta partially deleted. Failed: deployment' }
        : { success: true, message: 'ok' }
    );

    await expect(deleteProject()).rejects.toThrow(/agent/i);
    expect(m.projectDelete).not.toHaveBeenCalled();
  });

  it('keeps the project when the Kubernetes call throws', async () => {
    m.deleteAgent.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(deleteProject()).rejects.toThrow();
    expect(m.projectDelete).not.toHaveBeenCalled();
  });

  it('does not block deletion on an instance with no Kubernetes configured', async () => {
    vi.stubEnv('K8S_SERVICE_ACCOUNT_TOKEN', '');

    await expect(deleteProject()).resolves.toEqual({ success: true });
    expect(m.deleteAgent).not.toHaveBeenCalled();
    expect(m.projectDelete).toHaveBeenCalled();
  });

  it('never deletes by a reserved infrastructure name', async () => {
    m.agents = [
      { uuid: 'x', name: 'pap-collector', kubernetes_deployment: 'pap-collector', kubernetes_namespace: 'agents' },
    ];

    await expect(deleteProject()).resolves.toEqual({ success: true });
    expect(m.deleteAgent).not.toHaveBeenCalled();
  });

  it('checks the last-Hub rule before tearing anything down', async () => {
    m.projects = [{ uuid: PROJECT, user_id: 'user-1' }];

    await expect(deleteProject()).rejects.toThrow(/last project/i);
    expect(m.deleteAgent).not.toHaveBeenCalled();
    expect(m.projectDelete).not.toHaveBeenCalled();
  });
});
