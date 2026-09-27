// @vitest-environment node
/**
 * Kubernetes resources for an agent are addressed by the agent's name, and the
 * name is only unique while the agent row exists. Three gaps followed from
 * trusting the name alone:
 *
 * - deployOpenCodeAgent treated HTTP 409 AlreadyExists as "fine, continue", so
 *   an agent registering a freed name adopted the previous owner's PVC
 *   (workspace), Secret (Hub API key, model-router token) and Deployment. The
 *   standard deploy's rollback went further and deleted, by name, whatever
 *   Service/Ingress/Secret it collided with.
 * - deleteAgent deleted every `<name>*` resource without asking whose it was,
 *   and would do so for a reserved infrastructure name too.
 * - The generated NetworkPolicy was never applied, and never deleted.
 *
 * Every resource now carries `pap.plugged.in/agent-uuid`; creation refuses to
 * reuse anything not labelled with this agent's uuid, rollback removes only
 * what this call created, and deletion only ever matches this agent's label
 * (or, for legacy agents, no label) — checked by the API server through
 * selector-scoped DELETE-collection calls, so nothing has to be read first.
 *
 * The Kubernetes API is an in-memory fake behind a mocked `https` module; no
 * cluster is contacted.
 */
import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const LABEL = 'pap.plugged.in/agent-uuid';
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

type K8sObject = { metadata: { name: string; uid?: string; labels?: Record<string, string> }; [k: string]: unknown };

const k8s = vi.hoisted(() => {
  process.env.K8S_SERVICE_ACCOUNT_TOKEN = 'test-token';
  return {
    objects: new Map<string, K8sObject>(),
    calls: [] as Array<{ method: string; path: string; body?: Record<string, unknown>; query: URLSearchParams }>,
    // path (exact) -> status to fail with, for any method
    failures: new Map<string, number>(),
    uid: 0,
  };
});

vi.mock('https', async () => {
  const { EventEmitter: Emitter } = await import('node:events');

  // DELETE on a collection with label/field selectors (deletecollection).
  function deleteCollection(path: string, query: URLSearchParams) {
    const labelTerms = (query.get('labelSelector') ?? '').split(',').filter(Boolean);
    const fieldTerms = (query.get('fieldSelector') ?? '').split(',').filter(Boolean);
    const matched = [...k8s.objects.entries()].filter(([key, obj]) => {
      if (!key.startsWith(`${path}/`) || key.slice(path.length + 1).includes('/')) return false;
      const labels = obj.metadata.labels ?? {};
      const labelsOk = labelTerms.every((t) =>
        t.startsWith('!') ? !(t.slice(1) in labels) : labels[t.slice(0, t.indexOf('='))] === t.slice(t.indexOf('=') + 1)
      );
      const fieldsOk = fieldTerms.every((t) => {
        const [field, value] = [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)];
        if (field === 'metadata.name') return obj.metadata.name === value;
        return String((obj as Record<string, unknown>)[field] ?? '') === value;
      });
      return labelsOk && fieldsOk;
    });
    for (const [key] of matched) k8s.objects.delete(key);
    return { status: 200, body: { kind: 'List', items: matched.map(([, obj]) => obj) } };
  }

  function respond(method: string, path: string, body: Record<string, unknown> | undefined, query: URLSearchParams) {
    const forced = k8s.failures.get(`${method} ${path}`) ?? k8s.failures.get(path);
    if (forced) return { status: forced, body: { kind: 'Status', code: forced, reason: 'Forced' } };
    if (method === 'DELETE' && (query.has('labelSelector') || query.has('fieldSelector'))) {
      return deleteCollection(path, query);
    }

    if (method === 'POST') {
      const obj = body as unknown as K8sObject;
      const key = `${path}/${encodeURIComponent(obj.metadata.name)}`;
      if (k8s.objects.has(key)) return { status: 409, body: { kind: 'Status', code: 409, reason: 'AlreadyExists' } };
      const stored = { ...obj, metadata: { ...obj.metadata, uid: `uid-${++k8s.uid}` } };
      k8s.objects.set(key, stored);
      return { status: 201, body: stored };
    }
    const existing = k8s.objects.get(path);
    if (method === 'GET') {
      return existing ? { status: 200, body: existing } : { status: 404, body: { kind: 'Status', code: 404, reason: 'NotFound' } };
    }
    if (method === 'DELETE') {
      if (!existing) return { status: 404, body: { kind: 'Status', code: 404, reason: 'NotFound' } };
      const preconditions = (body?.preconditions ?? {}) as { uid?: string };
      if (preconditions.uid && preconditions.uid !== existing.metadata.uid) {
        return { status: 409, body: { kind: 'Status', code: 409, reason: 'Conflict' } };
      }
      k8s.objects.delete(path);
      return { status: 200, body: { kind: 'Status', status: 'Success' } };
    }
    if (method === 'PATCH') {
      return existing ? { status: 200, body: existing } : { status: 404, body: { kind: 'Status', code: 404 } };
    }
    return { status: 405, body: {} };
  }

  const statusText: Record<number, string> = {
    200: 'OK', 201: 'Created', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
    409: 'Conflict', 500: 'Internal Server Error',
  };

  function request(options: { method?: string; path: string }, cb: (res: EventEmitter & { statusCode: number; statusMessage: string }) => void) {
    const req = new Emitter() as EventEmitter & {
      write: (chunk: string) => void;
      end: () => void;
      setTimeout: () => void;
      destroy: () => void;
    };
    let payload = '';
    req.write = (chunk: string) => {
      payload += chunk;
    };
    req.setTimeout = () => undefined;
    req.destroy = () => undefined;
    req.end = () => {
      const method = options.method || 'GET';
      const [path, search = ''] = options.path.split('?');
      const query = new URLSearchParams(search);
      const body = payload ? JSON.parse(payload) : undefined;
      k8s.calls.push({ method, path, body, query });
      const result = respond(method, path, body, query);
      const res = new Emitter() as EventEmitter & { statusCode: number; statusMessage: string };
      res.statusCode = result.status;
      res.statusMessage = statusText[result.status] ?? '';
      queueMicrotask(() => {
        cb(res);
        res.emit('data', JSON.stringify(result.body));
        res.emit('end');
      });
    };
    return req;
  }

  return { request, default: { request } };
});

const { kubernetesService } = await import('@/lib/services/kubernetes-service');

const NS = '/namespaces/agents';
const P = {
  pvc: `/api/v1${NS}/persistentvolumeclaims/victim-workspace`,
  secret: `/api/v1${NS}/secrets/victim-secrets`,
  configmap: `/api/v1${NS}/configmaps/victim-config`,
  deployment: `/apis/apps/v1${NS}/deployments/victim`,
  service: `/api/v1${NS}/services/victim`,
  ingress: `/apis/networking.k8s.io/v1${NS}/ingresses/victim`,
  netpol: `/apis/networking.k8s.io/v1${NS}/networkpolicies/victim-netpol`,
  netpols: `/apis/networking.k8s.io/v1${NS}/networkpolicies`,
  ingressroute: `/apis/traefik.io/v1alpha1${NS}/ingressroutes/victim`,
  certificate: `/apis/cert-manager.io/v1${NS}/certificates/victim-tls`,
};

function seed(path: string, owner?: string) {
  const name = decodeURIComponent(path.split('/').pop()!);
  k8s.objects.set(path, {
    metadata: { name, uid: `seed-${name}`, labels: owner ? { app: 'victim', [LABEL]: owner } : { app: 'victim' } },
  });
}

function calls(method: string, path?: string) {
  return k8s.calls.filter((c) => c.method === method && (path === undefined || c.path === path));
}

function openCode(agentUuid = ME) {
  return kubernetesService.deployOpenCodeAgent({
    name: 'victim',
    namespace: 'agents',
    dnsName: 'victim.is.plugged.in',
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

function standard(agentUuid = ME) {
  return kubernetesService.deployAgent({
    name: 'victim',
    namespace: 'agents',
    dnsName: 'victim.is.plugged.in',
    agentUuid,
    image: 'ghcr.io/veriteknik/compass-agent:latest',
  });
}

beforeEach(() => {
  k8s.objects.clear();
  k8s.calls.length = 0;
  k8s.failures.clear();
  k8s.uid = 0;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('OpenCode deploy applies the NetworkPolicy', () => {
  it('creates `${name}-netpol` before the Deployment starts any pod', async () => {
    const result = await openCode();

    expect(result.success).toBe(true);
    const post = calls('POST', P.netpols);
    expect(post).toHaveLength(1);
    expect((post[0].body as K8sObject).metadata.name).toBe('victim-netpol');
    expect(k8s.objects.get(P.netpol)?.metadata.labels?.[LABEL]).toBe(ME);

    const order = k8s.calls.filter((c) => c.method === 'POST').map((c) => c.path);
    expect(order.indexOf(P.netpols)).toBeLessThan(order.indexOf(`/apis/apps/v1${NS}/deployments`));
  });

  it('fails the deploy (and rolls back) when the NetworkPolicy cannot be created', async () => {
    k8s.failures.set(`POST ${P.netpols}`, 403);

    const result = await openCode();

    expect(result.success).toBe(false);
    expect(k8s.objects.has(P.deployment)).toBe(false);
    // What this call created before the failure is removed again.
    expect(k8s.objects.has(P.pvc)).toBe(false);
    expect(k8s.objects.has(P.secret)).toBe(false);
    expect(k8s.objects.has(P.configmap)).toBe(false);
  });

  it('deleteAgent removes the NetworkPolicy with the agent', async () => {
    await openCode();

    const result = await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'opencode' });

    expect(result.success).toBe(true);
    // Deleted through its collection, selected by name and owner label.
    expect(calls('DELETE', P.netpols).length).toBeGreaterThan(0);
    expect(k8s.objects.has(P.netpol)).toBe(false);
  });
});

describe('creation never adopts another agent’s resources', () => {
  it.each([
    ['PVC (workspace)', P.pvc],
    ['Secret (credentials)', P.secret],
    ['ConfigMap', P.configmap],
    ['Deployment', P.deployment],
    ['Service', P.service],
    ['IngressRoute', P.ingressroute],
  ])('OpenCode: refuses a leftover %s labelled for another agent', async (_kind, path) => {
    seed(path, OTHER);

    const result = await openCode();

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/another agent|not owned/i);
    // Not patched, not deleted, not relabelled.
    expect(calls('PATCH')).toHaveLength(0);
    expect(calls('DELETE', path)).toHaveLength(0);
    expect(k8s.objects.get(path)?.metadata.labels?.[LABEL]).toBe(OTHER);
    // Nothing of ours is left behind either.
    expect(k8s.objects.has(P.deployment) && path !== P.deployment).toBe(false);
  });

  it('OpenCode: refuses a leftover resource with no owner label (cannot be proven ours)', async () => {
    seed(P.secret);

    const result = await openCode();

    expect(result.success).toBe(false);
    expect(k8s.objects.get(P.secret)?.metadata.uid).toBe('seed-victim-secrets');
    expect(k8s.objects.has(P.deployment)).toBe(false);
  });

  it('OpenCode: refuses when the owner of a conflicting resource cannot be read', async () => {
    seed(P.pvc, ME);
    k8s.failures.set(P.pvc, 403); // GET of the existing PVC fails

    const result = await openCode();

    expect(result.success).toBe(false);
    expect(k8s.objects.has(P.deployment)).toBe(false);
  });

  it('OpenCode: reuses a resource already labelled for this same agent', async () => {
    seed(P.pvc, ME);

    const result = await openCode();

    expect(result.success).toBe(true);
    expect(k8s.objects.get(P.pvc)?.metadata.uid).toBe('seed-victim-workspace');
  });

  it('standard deploy: a colliding Service is refused and NOT deleted by the rollback', async () => {
    seed(P.service, OTHER);
    seed(P.secret, OTHER);

    const result = await standard();

    expect(result.success).toBe(false);
    expect(k8s.objects.get(P.service)?.metadata.labels?.[LABEL]).toBe(OTHER);
    expect(k8s.objects.get(P.secret)?.metadata.labels?.[LABEL]).toBe(OTHER);
    expect(calls('DELETE', P.service)).toHaveLength(0);
    expect(calls('DELETE', P.secret)).toHaveLength(0);
    // Our own Deployment, created before the conflict, is rolled back.
    expect(k8s.objects.has(P.deployment)).toBe(false);
  });

  it('standard deploy: a leftover Deployment of another agent is refused', async () => {
    seed(P.deployment, OTHER);

    const result = await standard();

    expect(result.success).toBe(false);
    expect(k8s.objects.get(P.deployment)?.metadata.labels?.[LABEL]).toBe(OTHER);
    expect(k8s.objects.has(P.service)).toBe(false);
  });
});

describe('standard (non-OpenCode) manifests carry the owner label', () => {
  it('labels the Deployment, Service and Ingress with the agent uuid', async () => {
    const result = await standard();

    expect(result.success).toBe(true);
    for (const path of [P.deployment, P.service, P.ingress]) {
      expect(k8s.objects.get(path)?.metadata.labels?.[LABEL]).toBe(ME);
    }
  });
});

describe('deleteAgent deletes only what is provably this agent’s', () => {
  it.each(['pap-collector', 'kube-dns', 'wildcard-tls', 'model-router', 'Traefik'])(
    'refuses the reserved name %s without touching the API',
    async (name) => {
      const result = await kubernetesService.deleteAgent(name, 'agents', ME, { templateKind: 'opencode' });

      expect(result.success).toBe(false);
      expect(k8s.calls).toHaveLength(0);
    }
  );

  it('never deletes a resource labelled for a different agent', async () => {
    seed(P.deployment, OTHER);
    seed(P.pvc, OTHER);
    seed(P.secret, ME);

    const result = await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'opencode' });

    expect(result.success).toBe(true);
    expect(k8s.objects.has(P.deployment)).toBe(true);
    expect(k8s.objects.has(P.pvc)).toBe(true);
    expect(k8s.objects.get(P.deployment)?.metadata.labels?.[LABEL]).toBe(OTHER);
    // Its own resources still go.
    expect(k8s.objects.has(P.secret)).toBe(false);
  });

  // r2c: ownership is now checked by the API server (label selectors on a
  // DELETE-collection), so teardown reads nothing — no RBAC `get`, least of
  // all on Secrets. The read-then-delete checks below were replaced.
  it('reads nothing: every request is a selector-scoped DELETE on a collection', async () => {
    seed(P.deployment, ME);
    seed(P.pvc, ME);

    await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'opencode' });

    expect(k8s.calls.filter((c) => c.method !== 'DELETE')).toHaveLength(0);
    for (const call of k8s.calls) {
      expect(call.query.get('fieldSelector')).toMatch(/^metadata\.name=/);
      expect([`${LABEL}=${ME}`, `!${LABEL}`]).toContain(call.query.get('labelSelector'));
    }
  });

  it('fails when a resource type the agent has cannot be deleted', async () => {
    seed(P.deployment, ME);
    seed(P.secret, ME);
    k8s.failures.set(`DELETE /api/v1${NS}/secrets`, 500);

    const result = await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'opencode' });

    expect(result.success).toBe(false);
    expect(result.failedResources).toContain('secret');
    expect(k8s.objects.has(P.secret)).toBe(true);
  });

  it('still removes unlabelled resources of agents deployed before labels existed', async () => {
    seed(P.deployment);
    seed(P.service);

    const result = await kubernetesService.deleteAgent('victim', 'agents', ME, { templateKind: 'standard' });

    expect(result.success).toBe(true);
    expect(k8s.objects.has(P.deployment)).toBe(false);
    expect(k8s.objects.has(P.service)).toBe(false);
  });
});
