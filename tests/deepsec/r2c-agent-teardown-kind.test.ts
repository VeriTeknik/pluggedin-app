/**
 * deleteAgent needs to know which resource types an agent's template creates:
 * its legacy (unlabelled) pass is limited to them, and a permission error on a
 * type the template never creates must not block account or Hub deletion.
 * Teardown resolves that from the agent's template row (agents.template_uuid,
 * written only by the app), falling back to metadata.template_name for agents
 * whose template row was deleted — a fallback that can only make the result
 * stricter ('opencode'), never looser, since metadata is user-editable.
 */
import { getTableName } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentTemplateKind, openCodeTemplateType } from '@/lib/agents/template-kind';

const m = vi.hoisted(() => ({
  agents: [] as Array<Record<string, unknown>>,
  templates: [] as Array<Record<string, unknown>>,
  templateQueries: 0,
  deleteAgent: vi.fn(),
}));

vi.mock('@/lib/services/kubernetes-service', () => ({
  kubernetesService: { deleteAgent: m.deleteAgent },
}));
vi.mock('@/db', () => {
  function chain() {
    let table = '';
    const c = {
      from(t: unknown) {
        table = getTableName(t as never);
        return c;
      },
      innerJoin: () => c,
      leftJoin: () => c,
      where: async () => {
        if (table === 'agent_templates') {
          m.templateQueries++;
          return m.templates;
        }
        return m.agents;
      },
    };
    return c;
  }
  return { db: { select: () => chain() } };
});

const T_CHAMBER = { uuid: 't-chamber', namespace: 'veriteknik', name: 'opencode-chamber' };
const T_IDE = { uuid: 't-ide', namespace: 'veriteknik', name: 'opencode-ide' };
const T_OTHER = { uuid: 't-other', namespace: 'veriteknik', name: 'compass' };
const T_SPOOF = { uuid: 't-spoof', namespace: 'someone', name: 'opencode-chamber' };

function agent(uuid: string, template_uuid: string | null, metadata: unknown = {}) {
  return { uuid, name: uuid, kubernetes_deployment: uuid, kubernetes_namespace: 'agents', template_uuid, metadata };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('K8S_SERVICE_ACCOUNT_TOKEN', 'test-token');
  m.templateQueries = 0;
  m.templates = [T_CHAMBER, T_IDE, T_OTHER, T_SPOOF];
  m.deleteAgent.mockResolvedValue({ success: true, message: 'ok' });
});

describe('agentTemplateKind', () => {
  it.each([
    [T_CHAMBER, {}, 'opencode'],
    [T_IDE, {}, 'opencode'],
    [T_OTHER, {}, 'standard'],
    [T_SPOOF, {}, 'standard'],
    [null, {}, 'standard'],
    [null, { template_name: 'veriteknik/opencode-ide' }, 'opencode'],
    [null, { template_name: 'someone/opencode-ide' }, 'standard'],
    // metadata can widen, never narrow
    [T_CHAMBER, { template_name: 'veriteknik/compass' }, 'opencode'],
  ] as const)('%o with metadata %o is %s', (template, metadata, expected) => {
    expect(agentTemplateKind(template, metadata)).toBe(expected);
  });

  it('openCodeTemplateType mirrors the deploy decision', () => {
    expect(openCodeTemplateType(T_CHAMBER)).toBe('opencode-chamber');
    expect(openCodeTemplateType(T_IDE)).toBe('opencode-ide');
    expect(openCodeTemplateType(T_SPOOF)).toBeNull();
    expect(openCodeTemplateType(undefined)).toBeNull();
  });
});

describe('teardown passes each agent’s template kind to deleteAgent', () => {
  it('resolves kinds from the template rows (and the metadata fallback)', async () => {
    m.agents = [
      agent('a-chamber', 't-chamber'),
      agent('a-plain', null),
      agent('a-compass', 't-other'),
      agent('a-orphaned-template', null, { template_name: 'veriteknik/opencode-chamber' }),
    ];
    const { teardownAgentsOwnedByUser } = await import('@/lib/agents/teardown');

    const result = await teardownAgentsOwnedByUser('user-1');

    expect(result.ok).toBe(true);
    const kinds = Object.fromEntries(m.deleteAgent.mock.calls.map((c) => [c[0], c[3]?.templateKind]));
    expect(kinds).toEqual({
      'a-chamber': 'opencode',
      'a-plain': 'standard',
      'a-compass': 'standard',
      'a-orphaned-template': 'opencode',
    });
    expect(m.templateQueries).toBe(1);
  });

  it('does not query templates when no agent has one', async () => {
    m.agents = [agent('a-plain', null)];
    const { teardownAgentsInProject } = await import('@/lib/agents/teardown');

    await teardownAgentsInProject('project-1');

    expect(m.templateQueries).toBe(0);
    expect(m.deleteAgent).toHaveBeenCalledWith('a-plain', 'agents', 'a-plain', { templateKind: 'standard' });
  });

  it('single-agent teardown (admin) resolves the kind the same way', async () => {
    const { teardownAgent } = await import('@/lib/agents/teardown');

    await teardownAgent(agent('a-ide', 't-ide'));

    expect(m.deleteAgent).toHaveBeenCalledWith('a-ide', 'agents', 'a-ide', { templateKind: 'opencode' });
  });
});
