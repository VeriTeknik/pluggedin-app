// @vitest-environment node
/**
 * Teardown read the owner label of every one of the agent's 13 resource types
 * before deleting anything. That needed RBAC `get` on all of them, Secrets
 * and the new NetworkPolicies included, and a single 403 on a read blocked
 * account deletion, Hub deletion and admin terminate. Granting `get secrets`
 * would also let the app's token read every tenant's credentials.
 *
 * Teardown now deletes with DELETE-collection calls whose selectors do the
 * ownership check server-side: `pap.plugged.in/agent-uuid=<uuid>` plus
 * `metadata.name=<name>` for the agent's own resources, and the legacy
 * (unlabelled) pass `!pap.plugged.in/agent-uuid` limited to the resource
 * types the agent's template actually creates. It needs `deletecollection`,
 * never `get` on a Secret. A 403 on a type the agent's template never creates
 * does not block; on a type it does create, it does, because the resource
 * cannot be proven absent.
 *
 * The shipped least-privilege Role (docs/ops/pap-agent-manager-rbac.yaml) is
 * checked against every request the code makes.
 */
import fs from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.K8S_SERVICE_ACCOUNT_TOKEN = 'test-token';
});
vi.mock('https', async () => (await import('./r2c-k8s-fake')).httpsModule());

import { fake, OWNER_LABEL, pathsFor, type RecordedCall } from './r2c-k8s-fake';

const k8sModule = await import('@/lib/services/kubernetes-service');
const { kubernetesService } = k8sModule;

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const P = pathsFor('victim');

function seed(path: string, owner?: string, extra: Record<string, unknown> = {}) {
  const name = decodeURIComponent(path.split('/').pop()!);
  return fake.seed(path, {
    metadata: { name, labels: owner ? { app: 'victim', [OWNER_LABEL]: owner } : { app: 'victim' } },
    ...extra,
  });
}

function deployOpenCode(name = 'victim', agentUuid = ME) {
  return kubernetesService.deployOpenCodeAgent({
    name,
    namespace: 'agents',
    dnsName: `${name}.is.plugged.in`,
    templateType: 'opencode-chamber',
    agentUuid,
    uiPassword: 'password123',
    defaultModel: 'claude-sonnet-4',
    modelRouterUrl: 'https://router.example.com',
    modelRouterToken: 'tok',
    papApiKey: 'pap',
    pluggedinApiKey: 'plug',
  });
}

function deployStandard(name = 'victim', agentUuid = ME) {
  return kubernetesService.deployAgent({
    name,
    namespace: 'agents',
    dnsName: `${name}.is.plugged.in`,
    agentUuid,
    image: 'ghcr.io/veriteknik/compass-agent:latest',
  });
}

beforeEach(() => {
  fake.reset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('deleteAgent: ownership is checked by the API, nothing is read first', () => {
  it('removes a deployed OpenCode agent with DELETE-collection calls only (no GET at all)', async () => {
    expect((await deployOpenCode()).success).toBe(true);
    fake.calls.length = 0;

    const result = await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'opencode' });

    expect(result.success).toBe(true);
    expect([...fake.objects.keys()].filter((p) => p.includes('victim'))).toEqual([]);
    expect(fake.calls.filter((c) => c.method !== 'DELETE')).toEqual([]);
    for (const call of fake.calls) {
      // Always a collection, always scoped by name, always scoped by owner
      // label (this agent's, or "no owner label" for the legacy pass).
      expect(call.query.get('fieldSelector')).toMatch(/^metadata\.name=victim(-[a-z-]+)?(,type=kubernetes\.io\/tls)?$/);
      expect([`${OWNER_LABEL}=${ME}`, `!${OWNER_LABEL}`]).toContain(call.query.get('labelSelector'));
    }
  });

  it('never reads a Secret', async () => {
    await deployOpenCode();
    await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'opencode' });

    const secretReads = fake.calls.filter((c) => c.path.includes('/secrets') && c.method === 'GET');
    expect(secretReads).toEqual([]);
  });

  it('never deletes a resource labelled for another agent', async () => {
    seed(P.deployment, OTHER);
    seed(P.pvc, OTHER);
    seed(P.secret, ME);

    const result = await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'opencode' });

    expect(result.success).toBe(true);
    expect(fake.get(P.deployment)).toBeDefined();
    expect(fake.get(P.pvc)).toBeDefined();
    expect(fake.get(P.secret)).toBeUndefined();
  });

  it('removes the unlabelled resources of a legacy OpenCode agent', async () => {
    for (const path of [P.deployment, P.service, P.secret, P.configmap, P.pvc, P.ingressroute, P.certificate]) seed(path);

    const result = await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'opencode' });

    expect(result.success).toBe(true);
    for (const path of [P.deployment, P.service, P.secret, P.configmap, P.pvc, P.ingressroute, P.certificate]) {
      expect(fake.get(path)).toBeUndefined();
    }
  });

  it('a standard agent removes its legacy Deployment/Service/Ingress but never unlabelled types its template does not create', async () => {
    // e.g. the workspace and credentials of some deleted OpenCode agent that
    // once had this name — not this agent's to delete.
    for (const path of [P.deployment, P.service, P.ingress, P.secret, P.pvc, P.configmap]) seed(path);

    const result = await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'standard' });

    expect(result.success).toBe(true);
    expect(fake.get(P.deployment)).toBeUndefined();
    expect(fake.get(P.service)).toBeUndefined();
    expect(fake.get(P.ingress)).toBeUndefined();
    expect(fake.get(P.secret)).toBeDefined();
    expect(fake.get(P.pvc)).toBeDefined();
    expect(fake.get(P.configmap)).toBeDefined();
  });

  it('removes the cert-manager TLS Secret (unlabelled, type kubernetes.io/tls) but no other Secret by that name', async () => {
    seed(P.tlsSecret, undefined, { type: 'kubernetes.io/tls' });

    await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'standard' });
    expect(fake.get(P.tlsSecret)).toBeUndefined();

    fake.reset();
    seed(P.tlsSecret, undefined, { type: 'Opaque' });
    await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'standard' });
    expect(fake.get(P.tlsSecret)).toBeDefined();
  });
});

describe('deleteAgent: what a permission error means', () => {
  it('a 403 on a type the agent’s template never creates does not block (NetworkPolicy, standard agent)', async () => {
    await deployStandard();
    fake.failures.set(`DELETE ${P.netpols}`, 403);

    const result = await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'standard' });

    expect(result.success).toBe(true);
    expect(result.ignoredResources).toContain('networkpolicy');
    expect(fake.get(P.deployment)).toBeUndefined();
  });

  it.each([
    ['networkpolicy', () => P.netpols],
    ['secret', () => P.secrets],
    ['pvc', () => P.pvcs],
  ])('a 403 on %s blocks an OpenCode agent’s teardown: the resource cannot be proven absent', async (type, collection) => {
    await deployOpenCode();
    fake.failures.set(`DELETE ${collection()}`, 403);

    const result = await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'opencode' });

    expect(result.success).toBe(false);
    expect(result.failedResources).toContain(type);
  });

  it('a 403 on Deployments blocks any agent’s teardown', async () => {
    await deployStandard();
    fake.failures.set(`DELETE ${P.deployments}`, 403);

    const result = await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'standard' });

    expect(result.success).toBe(false);
    expect(result.failedResources).toContain('deployment');
  });

  it('a 403 on the cert-manager TLS Secret alone does not block (it only holds a certificate for the agent’s own hostname)', async () => {
    await deployStandard();
    fake.failures.set(`DELETE ${P.secrets}`, 403);

    const result = await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'standard' });

    expect(result.success).toBe(true);
    expect(result.ignoredResources).toContain('tls-secret');
  });

  it('a 404 on a collection (e.g. Traefik CRDs not installed) means nothing of that type exists', async () => {
    await deployStandard();
    fake.failures.set(`DELETE ${P.middlewares}`, 404);
    fake.failures.set(`DELETE ${P.ingressroutes}`, 404);

    const result = await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'opencode' });

    expect(result.success).toBe(true);
  });
});

describe('a failed deploy rolls back by owner label, never by bare name', () => {
  it('uses only owner-scoped DELETE-collection calls', async () => {
    fake.failures.set(`POST ${P.ingressroutes}`, 500);

    const result = await deployOpenCode();

    expect(result.success).toBe(false);
    const deletes = fake.callsOf('DELETE');
    expect(deletes.length).toBeGreaterThan(0);
    for (const call of deletes) {
      expect(call.query.get('labelSelector')).toBe(`${OWNER_LABEL}=${ME}`);
      expect(call.query.get('fieldSelector')).toMatch(/^metadata\.name=/);
    }
    expect(fake.get(P.deployment)).toBeUndefined();
    expect(fake.get(P.pvc)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The least-privilege Role
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_PATH = 'docs/ops/pap-agent-manager-rbac.yaml';

type Rule = { apiGroups: string[]; resources: string[]; verbs: string[] };

function roleRules(): Rule[] {
  const text = fs.readFileSync(ROLE_PATH, 'utf8');
  const roleDoc = text.split(/^---$/m).find((doc) => /^kind:\s*Role\s*$/m.test(doc));
  expect(roleDoc, 'a kind: Role document').toBeDefined();
  const rules: Rule[] = [];
  const re = /-\s*apiGroups:\s*(\[[^\]]*\])\s*\n\s*resources:\s*(\[[^\]]*\])\s*\n\s*verbs:\s*(\[[^\]]*\])/g;
  for (const m of roleDoc!.matchAll(re)) {
    rules.push({ apiGroups: JSON.parse(m[1]), resources: JSON.parse(m[2]), verbs: JSON.parse(m[3]) });
  }
  return rules;
}

function grants(rules: Rule[], verb: string, group: string, resource: string) {
  return rules.some((r) => r.apiGroups.includes(group) && r.resources.includes(resource) && r.verbs.includes(verb));
}

/** RBAC attributes of an API request. */
function rbac(call: RecordedCall): { verb: string; group: string; resource: string } | null {
  const seg = call.path.split('/').filter(Boolean);
  let group: string;
  let rest: string[];
  if (seg[0] === 'api') {
    group = '';
    rest = seg.slice(2);
  } else {
    group = seg[1];
    rest = seg.slice(3);
  }
  if (rest[0] !== 'namespaces') return null; // cluster-scoped (SelfSubjectAccessReview)
  const [, , resource, name, sub] = rest;
  const isCollection = name === undefined;
  const verb =
    call.method === 'GET' ? (isCollection ? 'list' : 'get')
      : call.method === 'POST' ? 'create'
        : call.method === 'PATCH' ? 'patch'
          : call.method === 'DELETE' ? (isCollection ? 'deletecollection' : 'delete')
            : call.method.toLowerCase();
  return { verb, group, resource: sub ? `${resource}/${sub}` : resource };
}

describe('the shipped Role grants exactly what the code uses', () => {
  it('is namespaced, has no wildcards, and never grants reading Secrets', () => {
    const text = fs.readFileSync(ROLE_PATH, 'utf8');
    expect(text).not.toMatch(/^kind:\s*ClusterRole\s*$/m);
    const rules = roleRules();
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.verbs).not.toContain('*');
      expect(rule.resources).not.toContain('*');
      expect(rule.apiGroups).not.toContain('*');
    }
    for (const verb of ['get', 'list', 'watch']) {
      expect(grants(rules, verb, '', 'secrets')).toBe(false);
    }
  });

  it('matches the permission list the preflight check uses', () => {
    const fromYaml = roleRules()
      .flatMap((r) => r.apiGroups.flatMap((g) => r.resources.flatMap((res) => r.verbs.map((v) => `${v} ${g}/${res}`))))
      .sort();
    const fromCode = k8sModule.AGENT_MANAGER_PERMISSIONS
      .flatMap((p) => p.verbs.map((v) => `${v} ${p.group}/${p.resource}`))
      .sort();
    expect(fromYaml).toEqual(fromCode);
  });

  it('covers every request of a full agent lifecycle', async () => {
    // Standard agent, OpenCode agent, a 409 on a readable resource, and every
    // operation the routes call.
    seed(pathsFor('ide').pvc, ME);
    expect((await deployStandard('std')).success).toBe(true);
    expect((await deployOpenCode('ide')).success).toBe(true);
    fake.seed(pathsFor('std').pod('std-1'), { metadata: { name: 'std-1', labels: { app: 'std', [OWNER_LABEL]: ME } }, status: { phase: 'Running' } });
    fake.logs.set('std-1', 'hello');

    await kubernetesService.getDeploymentStatus('std', 'agents', ME);
    await kubernetesService.getAgentLogs('std', 'agents', ME, 50);
    await kubernetesService.getAgentEvents('std', 'agents', ME);
    await kubernetesService.getAgentPodStatus('std', 'agents', ME);
    expect((await kubernetesService.scaleAgent('std', 0, 'agents', ME)).success).toBe(true);
    expect((await kubernetesService.restartDeployment('std', 'agents', ME)).success).toBe(true);
    expect(
      (await kubernetesService.upgradeAgent({ name: 'std', namespace: 'agents', agentUuid: ME, image: 'ghcr.io/veriteknik/x:2' })).success
    ).toBe(true);
    await kubernetesService.listAgents('agents');
    expect((await kubernetesService.deleteAgent('std', 'agents', ME, { templateKind: 'standard' })).success).toBe(true);
    expect((await kubernetesService.deleteAgent('ide', 'agents', ME, { templateKind: 'opencode' })).success).toBe(true);

    const rules = roleRules();
    const missing = fake.calls
      .map(rbac)
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .filter((a) => !grants(rules, a.verb, a.group, a.resource))
      .map((a) => `${a.verb} ${a.group}/${a.resource}`);
    expect([...new Set(missing)]).toEqual([]);
  });
});

describe('RBAC preflight', () => {
  it('reports the permissions the token lacks, via SelfSubjectAccessReview', async () => {
    fake.denied.add('deletecollection /secrets');
    fake.denied.add('create networking.k8s.io/networkpolicies');

    const report = await kubernetesService.checkAgentManagerAccess('agents');

    expect(report.ok).toBe(false);
    expect(report.missing.sort()).toEqual(['create networking.k8s.io/networkpolicies', 'deletecollection /secrets']);
    expect(fake.calls.every((c) => c.path === '/apis/authorization.k8s.io/v1/selfsubjectaccessreviews')).toBe(true);
  });

  it('is ok when everything is granted', async () => {
    const report = await kubernetesService.checkAgentManagerAccess('agents');
    expect(report).toEqual({ ok: true, missing: [] });
  });
});
