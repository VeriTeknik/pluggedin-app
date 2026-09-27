/**
 * Route side of the orphan takeover (see r2c-k8s-agent-ops-ownership.test.ts):
 *
 * - POST /api/agents wrote `kubernetes_deployment = <name>` at insert, before
 *   the deploy. A deploy refused because an orphan held the name left the row
 *   pointing at the orphan, and every name-addressed route then acted on it.
 *   The name is now recorded only once a deploy has succeeded (a failed
 *   deploy removes what it created, even after a timeout), which also means
 *   teardown's legacy pass only ever runs for names a deploy really took.
 *   The OpenCode password check runs before the row exists.
 * - Every name-addressed route passes the agent's uuid, so the service can
 *   refuse a Deployment that is not this agent's, and reports that as 409.
 */
import { getTableName } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const AGENT_UUID = '33333333-3333-4333-8333-333333333333';

const m = vi.hoisted(() => ({
  agent: null as Record<string, unknown> | null,
  template: null as Record<string, unknown> | null,
  inserts: [] as Array<{ table: string; values: unknown }>,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  k8s: {
    deployAgent: vi.fn(),
    deployOpenCodeAgent: vi.fn(),
    getAgentLogs: vi.fn(),
    getAgentEvents: vi.fn(),
    getAgentPodStatus: vi.fn(),
    getDeploymentStatus: vi.fn(),
    scaleAgent: vi.fn(),
    restartDeployment: vi.fn(),
    upgradeAgent: vi.fn(),
    deleteAgent: vi.fn(),
  },
}));

vi.mock('@/lib/services/kubernetes-service', () => ({ kubernetesService: m.k8s }));
vi.mock('@/app/api/auth', () => ({
  authenticate: vi.fn(async () => ({
    error: null,
    project: { user_id: 'user-1', uuid: 'project-1' },
    activeProfile: { uuid: 'profile-1' },
  })),
}));
vi.mock('@/lib/rate-limiter-redis', () => {
  const allow = async () => ({ allowed: true, limit: 100, remaining: 99, reset: Date.now() + 60000 });
  return { EnhancedRateLimiters: new Proxy({}, { get: () => allow }) };
});
vi.mock('@/lib/model-router/token', () => ({ generateModelRouterToken: vi.fn(async () => 'jwt') }));
vi.mock('@/db', () => {
  function thenable<T>(value: () => T) {
    return {
      then: (resolve: (v: T) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve().then(value).then(resolve, reject),
    };
  }
  function select() {
    let table = '';
    const rows = () => {
      if (table === 'agents') return m.agent ? [m.agent] : [{ count: 0 }];
      if (table === 'agent_templates') return m.template ? [m.template] : [];
      if (table === 'api_keys') return [{ api_key: 'pg_in_project_key' }];
      return [];
    };
    const c: Record<string, unknown> = {
      from(t: unknown) {
        table = getTableName(t as never);
        return c;
      },
      ...thenable(rows),
    };
    for (const k of ['where', 'limit', 'orderBy', 'innerJoin', 'leftJoin']) c[k] = () => c;
    return c;
  }
  return {
    db: {
      select,
      insert: (t: unknown) => ({
        values: (values: unknown) => {
          const table = getTableName(t as never);
          m.inserts.push({ table, values });
          const row = { uuid: AGENT_UUID, ...(Array.isArray(values) ? values[0] : (values as object)) };
          return { ...thenable(() => undefined), returning: async () => [row] };
        },
      }),
      update: (t: unknown) => ({
        set: (values: Record<string, unknown>) => {
          const table = getTableName(t as never);
          m.updates.push({ table, values });
          const result = { ...thenable(() => undefined), returning: async () => [{ ...(m.agent ?? {}), ...values }] };
          return { where: () => result };
        },
      }),
    },
  };
});

function req(url: string, method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
}
const params = { params: Promise.resolve({ id: AGENT_UUID }) };

const OWNED_ELSEWHERE = { success: false, message: 'Deployment victim has no ownership label', code: 'not_owned' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  m.inserts = [];
  m.updates = [];
  m.template = null;
  m.agent = {
    uuid: AGENT_UUID,
    name: 'victim',
    profile_uuid: 'profile-1',
    state: 'ACTIVE',
    kubernetes_deployment: 'victim',
    kubernetes_namespace: 'agents',
    template_uuid: null,
    provisioned_at: new Date('2026-01-01'),
    metadata: {},
  };
  m.k8s.getAgentLogs.mockResolvedValue('2026-01-01T00:00:00.000000000Z hi');
  m.k8s.getAgentEvents.mockResolvedValue([]);
  m.k8s.getAgentPodStatus.mockResolvedValue([]);
  m.k8s.getDeploymentStatus.mockResolvedValue(null);
  m.k8s.scaleAgent.mockResolvedValue({ success: true, message: 'ok' });
  m.k8s.restartDeployment.mockResolvedValue({ success: true, message: 'ok' });
  m.k8s.upgradeAgent.mockResolvedValue({ success: true, message: 'ok' });
  m.k8s.deleteAgent.mockResolvedValue({ success: true, message: 'ok' });
});

describe('POST /api/agents records the deployment name only when it is this agent’s', () => {
  async function create(body: Record<string, unknown>) {
    m.agent = null;
    const { POST } = await import('@/app/api/agents/route');
    return POST(req('/api/agents', 'POST', body));
  }
  const agentInsert = () => m.inserts.find((i) => i.table === 'agents')?.values as Array<Record<string, unknown>>;
  const agentUpdates = () => m.updates.filter((u) => u.table === 'agents').map((u) => u.values);

  it('does not point the row at a leftover it was refused', async () => {
    m.k8s.deployAgent.mockResolvedValue({
      success: false,
      message: 'victim already exists and is not owned by this agent',
      deploymentName: 'victim',
      ownershipConflict: true,
    });

    const res = await create({ name: 'victim', image: 'ghcr.io/veriteknik/compass-agent:latest' });

    expect(res.status).toBe(200);
    expect(agentInsert()[0].kubernetes_deployment ?? null).toBeNull();
    expect(agentUpdates().some((u) => 'kubernetes_deployment' in u && u.kubernetes_deployment)).toBe(false);
  });

  it('records the name once the deploy succeeded', async () => {
    m.k8s.deployAgent.mockResolvedValue({ success: true, message: 'ok', deploymentName: 'victim' });

    await create({ name: 'victim', image: 'ghcr.io/veriteknik/compass-agent:latest' });

    expect(agentInsert()[0].kubernetes_deployment ?? null).toBeNull();
    expect(agentUpdates()).toContainEqual(
      expect.objectContaining({ kubernetes_deployment: 'victim', state: 'PROVISIONED' })
    );
  });

  it('does not record it after a deploy that failed for another reason either (the deploy removed what it created)', async () => {
    m.k8s.deployAgent.mockResolvedValue({ success: false, message: 'timeout', deploymentName: 'victim' });

    await create({ name: 'victim', image: 'ghcr.io/veriteknik/compass-agent:latest' });

    expect(agentUpdates().some((u) => 'kubernetes_deployment' in u && u.kubernetes_deployment)).toBe(false);
    expect(agentUpdates().some((u) => u.state === 'PROVISIONED')).toBe(false);
  });

  it('rejects a short OpenCode UI password before the agent row exists', async () => {
    m.template = { uuid: 't1', namespace: 'veriteknik', name: 'opencode-chamber', configurable: null };

    const res = await create({ name: 'victim', template_uuid: 't1', config_values: {} });

    expect(res.status).toBe(400);
    expect(m.inserts.filter((i) => i.table === 'agents')).toHaveLength(0);
    expect(m.k8s.deployOpenCodeAgent).not.toHaveBeenCalled();
  });
});

describe('name-addressed routes pass the agent uuid for the ownership check', () => {
  it('GET /logs', async () => {
    const { GET } = await import('@/app/api/agents/[id]/logs/route');
    await GET(req(`/api/agents/${AGENT_UUID}/logs?tail=50`), params);
    expect(m.k8s.getAgentLogs).toHaveBeenCalledWith('victim', 'agents', AGENT_UUID, 50);
  });

  it('GET /events', async () => {
    const { GET } = await import('@/app/api/agents/[id]/events/route');
    await GET(req(`/api/agents/${AGENT_UUID}/events`), params);
    expect(m.k8s.getAgentEvents).toHaveBeenCalledWith('victim', 'agents', AGENT_UUID);
    expect(m.k8s.getAgentPodStatus).toHaveBeenCalledWith('victim', 'agents', AGENT_UUID);
    expect(m.k8s.getDeploymentStatus).toHaveBeenCalledWith('victim', 'agents', AGENT_UUID);
  });

  it('GET /api/agents/[id]', async () => {
    const { GET } = await import('@/app/api/agents/[id]/route');
    await GET(req(`/api/agents/${AGENT_UUID}`), params);
    expect(m.k8s.getDeploymentStatus).toHaveBeenCalledWith('victim', 'agents', AGENT_UUID);
  });

  it('DELETE /api/agents/[id] passes the uuid and the template kind', async () => {
    const { DELETE } = await import('@/app/api/agents/[id]/route');
    await DELETE(req(`/api/agents/${AGENT_UUID}`, 'DELETE'), params);
    expect(m.k8s.deleteAgent).toHaveBeenCalledWith('victim', 'agents', AGENT_UUID, { templateKind: 'standard' });
  });

  it('POST /shutdown', async () => {
    const { POST } = await import('@/app/api/agents/[id]/shutdown/route');
    await POST(req(`/api/agents/${AGENT_UUID}/shutdown`, 'POST', {}), params);
    expect(m.k8s.scaleAgent).toHaveBeenCalledWith('victim', 0, 'agents', AGENT_UUID);
  });
});

describe('a Deployment that is not this agent’s is refused with 409 and changes nothing', () => {
  it('POST /suspend', async () => {
    m.k8s.scaleAgent.mockResolvedValue(OWNED_ELSEWHERE);
    const { POST } = await import('@/app/api/agents/[id]/suspend/route');

    const res = await POST(req(`/api/agents/${AGENT_UUID}/suspend`, 'POST', {}), params);

    expect(m.k8s.scaleAgent).toHaveBeenCalledWith('victim', 0, 'agents', AGENT_UUID);
    expect(res.status).toBe(409);
    expect(m.updates).toHaveLength(0);
  });

  it('POST /resume', async () => {
    m.agent!.metadata = { intentionally_suspended: true };
    m.k8s.scaleAgent.mockResolvedValue(OWNED_ELSEWHERE);
    const { POST } = await import('@/app/api/agents/[id]/resume/route');

    const res = await POST(req(`/api/agents/${AGENT_UUID}/resume`, 'POST', {}), params);

    expect(m.k8s.scaleAgent).toHaveBeenCalledWith('victim', 1, 'agents', AGENT_UUID);
    expect(res.status).toBe(409);
    expect(m.updates).toHaveLength(0);
  });

  it('POST /restart', async () => {
    m.k8s.restartDeployment.mockResolvedValue(OWNED_ELSEWHERE);
    const { POST } = await import('@/app/api/agents/[id]/restart/route');

    const res = await POST(req(`/api/agents/${AGENT_UUID}/restart`, 'POST', {}), params);

    expect(m.k8s.restartDeployment).toHaveBeenCalledWith('victim', 'agents', AGENT_UUID);
    expect(res.status).toBe(409);
    expect(m.updates).toHaveLength(0);
  });

  it('POST /shutdown', async () => {
    m.k8s.scaleAgent.mockResolvedValue(OWNED_ELSEWHERE);
    const { POST } = await import('@/app/api/agents/[id]/shutdown/route');

    const res = await POST(req(`/api/agents/${AGENT_UUID}/shutdown`, 'POST', {}), params);

    expect(res.status).toBe(409);
    expect(m.updates).toHaveLength(0);
  });

  it('POST /upgrade: no PATCH of someone else’s image, and no upgrade recorded', async () => {
    m.k8s.upgradeAgent.mockResolvedValue(OWNED_ELSEWHERE);
    const { POST } = await import('@/app/api/agents/[id]/upgrade/route');

    const res = await POST(
      req(`/api/agents/${AGENT_UUID}/upgrade`, 'POST', { image: 'ghcr.io/veriteknik/compass-agent:2' }),
      params
    );

    expect(m.k8s.upgradeAgent).toHaveBeenCalledWith(expect.objectContaining({ name: 'victim', agentUuid: AGENT_UUID }));
    expect(res.status).toBe(409);
    expect(m.updates).toHaveLength(0);
    expect(m.inserts).toHaveLength(0);
  });
});
