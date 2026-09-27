/**
 * DELETE /api/settings/account removed the users row and let the FK cascade
 * (users → projects → profiles → agents) drop the agent rows — and with them
 * the globally unique agent names — without touching Kubernetes. The
 * Deployment, Service, Secret (holding the tenant's API key) and workspace PVC
 * stayed in the shared `agents` namespace, addressable by a name anyone could
 * now register. A new agent with that name adopted them (deployOpenCodeAgent
 * accepts HTTP 409 "already exists") and could restart or delete them.
 *
 * Account deletion now tears down every owned agent's Kubernetes resources
 * through the same kubernetesService.deleteAgent path the agent DELETE route
 * uses, and refuses to delete the account (keeping the names reserved) until
 * that succeeds.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  events: [] as string[],
  agents: [] as Array<{
    uuid: string;
    name: string;
    kubernetes_deployment: string | null;
    kubernetes_namespace: string | null;
  }>,
  agentWhere: [] as unknown[],
  deleteAgent: vi.fn(),
  userDelete: vi.fn(),
}));

vi.mock('@/lib/csrf-protection', () => ({ validateCSRF: async () => null }));
vi.mock('@/lib/auth', () => ({
  getAuthSession: async () => ({ user: { id: 'user-1', email: 'u@example.com', name: 'U', image: null } }),
}));
vi.mock('@/lib/admin-notifications', () => ({ notifyAdmins: vi.fn(async () => undefined) }));
vi.mock('@/lib/services/kubernetes-service', () => ({
  kubernetesService: { deleteAgent: m.deleteAgent },
}));
vi.mock('@/db', () => {
  const selectChain = {
    from: () => selectChain,
    innerJoin: () => selectChain,
    where: async (clause: unknown) => {
      m.agentWhere.push(clause);
      return m.agents;
    },
  };
  const tx = {
    delete: () => ({
      where: async () => {
        m.events.push('delete-user');
        m.userDelete();
      },
    }),
  };
  return {
    db: {
      query: { users: { findFirst: async () => ({ id: 'user-1' }) } },
      select: () => selectChain,
      delete: () => ({ where: async () => undefined }),
      transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

async function deleteAccount() {
  const { DELETE } = await import('@/app/api/settings/account/route');
  return DELETE(new NextRequest('http://localhost/api/settings/account', { method: 'DELETE' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('K8S_SERVICE_ACCOUNT_TOKEN', 'test-token');
  m.events = [];
  m.agentWhere = [];
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

describe('account deletion and agent infrastructure', () => {
  it('tears down every deployed agent before the user row (and the name reservations) go', async () => {
    const res = await deleteAccount();

    expect(res.status).toBe(200);
    // The agent uuid lets deleteAgent verify each resource's owner label; the
    // template kind (r2c) limits which resource types it may treat as legacy.
    expect(m.deleteAgent).toHaveBeenCalledWith('alpha', 'agents', 'a1', { templateKind: 'standard' });
    expect(m.deleteAgent).toHaveBeenCalledWith('beta', 'agents-dev', 'a2', { templateKind: 'standard' });
    expect(m.deleteAgent).toHaveBeenCalledTimes(2);
    expect(m.events.indexOf('delete-user')).toBeGreaterThan(m.events.indexOf('k8s-delete:alpha'));
    expect(m.events.indexOf('delete-user')).toBeGreaterThan(m.events.indexOf('k8s-delete:beta'));
  });

  it('only looks up agents belonging to the session user', async () => {
    await deleteAccount();

    expect(m.agentWhere).toHaveLength(1);
    const { sql, params } = new PgDialect().sqlToQuery(m.agentWhere[0] as never);
    expect(sql).toMatch(/"projects"\."user_id" = \$1/);
    expect(params).toEqual(['user-1']);
  });

  it('keeps the account (and its agent names) when a teardown fails', async () => {
    m.deleteAgent.mockImplementation(async (name: string) =>
      name === 'beta'
        ? { success: false, message: 'Agent beta partially deleted. Failed: deployment' }
        : { success: true, message: 'ok' }
    );

    const res = await deleteAccount();
    const body = await res.json();

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(body.error).toMatch(/agent/i);
    expect(m.userDelete).not.toHaveBeenCalled();
  });

  it('keeps the account when the Kubernetes call throws', async () => {
    m.deleteAgent.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await deleteAccount();

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(m.userDelete).not.toHaveBeenCalled();
  });

  it('does not block deletion forever on an instance with no Kubernetes configured', async () => {
    // Without credentials the app can never have created cluster resources,
    // and every teardown call would fail — erasure must still be possible.
    vi.stubEnv('K8S_SERVICE_ACCOUNT_TOKEN', '');
    m.deleteAgent.mockResolvedValue({ success: false, message: 'No Kubernetes authentication configured' });

    const res = await deleteAccount();

    expect(res.status).toBe(200);
    expect(m.deleteAgent).not.toHaveBeenCalled();
    expect(m.userDelete).toHaveBeenCalled();
  });

  it('never deletes by a reserved infrastructure name', async () => {
    // A name claimed before pap-collector was reserved must not become a way
    // to delete the shared collector during account deletion.
    m.agents = [
      { uuid: 'x', name: 'pap-collector', kubernetes_deployment: 'pap-collector', kubernetes_namespace: 'agents' },
    ];

    const res = await deleteAccount();

    expect(m.deleteAgent).not.toHaveBeenCalled();
    // The name stays reserved by policy, so nobody can re-register it.
    expect(res.status).toBe(200);
    expect(m.userDelete).toHaveBeenCalled();
  });
});
