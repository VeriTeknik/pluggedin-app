/**
 * The admin terminate/kill actions caught and ignored Kubernetes delete
 * failures (and never looked at `success: false`), marked the agent
 * TERMINATED/KILLED anyway, and the admin hard delete — allowed for exactly
 * those states — then removed the row and freed the globally unique name.
 * The Deployment, Secret and workspace PVC stayed behind for whoever
 * registered the name next.
 *
 * Terminate and kill now fail, leaving the state unchanged, when the
 * Kubernetes teardown fails; the hard delete re-runs the (idempotent)
 * teardown and refuses to free the name unless it succeeds. That also covers
 * agents terminated before this fix whose resources were never removed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const AGENT = {
  uuid: '44444444-4444-4444-8444-444444444444',
  name: 'victim',
  dns_name: 'victim',
  state: 'ACTIVE',
  kubernetes_deployment: 'victim',
  kubernetes_namespace: 'agents',
  profile_uuid: 'profile-1',
};

const m = vi.hoisted(() => ({
  agent: null as Record<string, unknown> | null,
  deleteAgent: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getAuthSession: async () => ({ user: { id: 'admin-1', email: 'admin@example.com' } }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-actions/notifications', () => ({ sendNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/services/kubernetes-service', () => ({
  kubernetesService: { deleteAgent: m.deleteAgent },
}));
vi.mock('@/db', () => ({
  db: {
    query: {
      users: { findFirst: async () => ({ id: 'admin-1', is_admin: true }) },
      agentsTable: { findFirst: async () => m.agent },
    },
    update: () => ({
      set: (values: unknown) => ({
        where: async () => {
          m.update(values);
        },
      }),
    }),
    insert: () => ({
      values: async (values: unknown) => {
        m.insert(values);
      },
    }),
    delete: () => ({
      where: async () => {
        m.del();
      },
    }),
  },
}));

const actions = () => import('@/app/admin/clusters/agent-actions');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('K8S_SERVICE_ACCOUNT_TOKEN', 'test-token');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  m.agent = { ...AGENT };
  m.deleteAgent.mockResolvedValue({ success: true, message: 'ok' });
});

describe.each(['terminateAgent', 'killAgent'] as const)('admin %s', (action) => {
  it('passes the agent uuid so ownership labels are checked', async () => {
    const result = await (await actions())[action](AGENT.uuid);

    expect(result.success).toBe(true);
    expect(m.deleteAgent).toHaveBeenCalledWith('victim', 'agents', AGENT.uuid, { templateKind: 'standard' });
    expect(m.update).toHaveBeenCalled();
  });

  it('fails, and leaves the state alone, when Kubernetes reports a failed delete', async () => {
    m.deleteAgent.mockResolvedValue({ success: false, message: 'Agent victim partially deleted. Failed: pvc' });

    const result = await (await actions())[action](AGENT.uuid);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/kubernetes/i);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });

  it('fails, and leaves the state alone, when the Kubernetes call throws', async () => {
    m.deleteAgent.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await (await actions())[action](AGENT.uuid);

    expect(result.success).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('still works on an instance with no Kubernetes configured', async () => {
    vi.stubEnv('K8S_SERVICE_ACCOUNT_TOKEN', '');

    const result = await (await actions())[action](AGENT.uuid);

    expect(result.success).toBe(true);
    expect(m.deleteAgent).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalled();
  });
});

describe('admin hard delete', () => {
  it('re-checks the Kubernetes teardown and keeps the row (and name) if it fails', async () => {
    m.agent = { ...AGENT, state: 'TERMINATED' };
    m.deleteAgent.mockResolvedValue({ success: false, message: 'Agent victim partially deleted. Failed: secret' });

    const result = await (await actions()).deleteAgent(AGENT.uuid);

    expect(result.success).toBe(false);
    expect(m.deleteAgent).toHaveBeenCalledWith('victim', 'agents', AGENT.uuid, { templateKind: 'standard' });
    expect(m.del).not.toHaveBeenCalled();
  });

  it('deletes the row once the teardown succeeds', async () => {
    m.agent = { ...AGENT, state: 'KILLED' };

    const result = await (await actions()).deleteAgent(AGENT.uuid);

    expect(result.success).toBe(true);
    expect(m.del).toHaveBeenCalled();
  });
});
