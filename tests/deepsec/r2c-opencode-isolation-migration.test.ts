/**
 * OpenCode (chamber) agents deployed before the isolation change still run
 * ttyd on 0.0.0.0:7681 with the Hub API key and model-router token in its
 * environment, opencode-serve on 0.0.0.0:4000, both published on the agent's
 * Service, and no NetworkPolicy — any pod in the shared `agents` namespace
 * can open a shell in them. Their resources also lack the owner label, so
 * every name-addressed operation now refuses them.
 *
 * lib/agents/isolation-migration.ts plans (dry run) and applies the one-off
 * migration for live agents, from the same manifest generators a new deploy
 * uses: owner-label backfill for every agent, and for OpenCode agents the
 * NetworkPolicy, the Service without the loopback-only ports, ttyd and
 * opencode-serve rebound to loopback (ttyd with the reduced environment),
 * the exec probes, OPENCODE_URL over loopback, and IngressRoute routes that
 * pointed at the removed ports. The Kubernetes client is an in-memory mock.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildOpenCodeManifests, type OpenCodeAgentConfig } from '@/lib/agents/opencode-manifests';

import { applyJsonPatch, type K8sObject, OWNER_LABEL, pathsFor } from './r2c-k8s-fake';

const { planAgentMigration, applyAgentMigration } = await import('@/lib/agents/isolation-migration');

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const P = pathsFor('victim');

type Container = {
  name: string;
  command?: string[];
  env?: Array<{ name: string; value?: string; valueFrom?: { secretKeyRef?: { key: string } } }>;
  ports?: unknown[];
  livenessProbe?: { httpGet?: unknown; exec?: unknown };
  readinessProbe?: { httpGet?: unknown; exec?: unknown };
};
type Deployment = K8sObject & {
  spec: { template: { metadata: { labels: Record<string, string> }; spec: { containers: Container[] } } };
};

const objects = new Map<string, K8sObject>();
const client = {
  get: vi.fn(async (path: string) => {
    const obj = objects.get(path);
    return obj ? (JSON.parse(JSON.stringify(obj)) as K8sObject) : null;
  }),
  create: vi.fn(async (collectionPath: string, body: object) => {
    const obj = body as K8sObject;
    const key = `${collectionPath}/${obj.metadata.name}`;
    if (objects.has(key)) throw new Error('Kubernetes API error: 409 Conflict');
    objects.set(key, { ...obj, metadata: { ...obj.metadata, uid: `uid-${obj.metadata.name}` } });
  }),
  jsonPatch: vi.fn(async (path: string, ops: Array<{ op: string; path: string; value?: unknown }>) => {
    const obj = objects.get(path);
    if (!obj) throw new Error('Kubernetes API error: 404 Not Found');
    objects.set(path, applyJsonPatch(obj, ops));
  }),
};

const target = {
  uuid: ME,
  name: 'victim',
  namespace: 'agents',
  dnsName: 'victim.is.plugged.in',
  templateType: 'opencode-chamber' as const,
};

function generatorConfig(): OpenCodeAgentConfig {
  return {
    name: 'victim',
    namespace: 'agents',
    dnsName: 'victim.is.plugged.in',
    templateType: 'opencode-chamber',
    secretName: 'victim-secrets',
    configMapName: 'victim-config',
    uiPassword: 'x',
    defaultModel: 'm',
    agentUuid: ME,
    modelRouterUrl: 'https://router.example.com',
    modelRouterToken: 't',
    papApiKey: 'p',
    pluggedinApiKey: 'k',
  };
}

function stripOwner<T extends { metadata: { labels?: Record<string, string> } }>(obj: T): T {
  const copy = JSON.parse(JSON.stringify(obj)) as T;
  delete copy.metadata.labels?.[OWNER_LABEL];
  return copy;
}

const COMMON_SECRET_ENV = [
  { name: 'AGENT_UUID', value: ME },
  { name: 'PAP_API_KEY', valueFrom: { secretKeyRef: { name: 'victim-secrets', key: 'pap-api-key' } } },
  { name: 'PLUGGEDIN_API_KEY', valueFrom: { secretKeyRef: { name: 'victim-secrets', key: 'pluggedin-api-key' } } },
  { name: 'MODEL_ROUTER_URL', value: 'https://router.example.com' },
  { name: 'MODEL_ROUTER_TOKEN', valueFrom: { secretKeyRef: { name: 'victim-secrets', key: 'model-router-token' } } },
];

/** The chamber agent as the pre-isolation code deployed it. */
function seedLegacyChamber(agentUuid = ME) {
  const current = buildOpenCodeManifests({ ...generatorConfig(), agentUuid });
  const deployment = stripOwner(current.deployment as Deployment);
  deployment.spec.template.metadata.labels = { app: 'victim', 'pap-agent': 'true', template: 'opencode-chamber' };
  for (const c of deployment.spec.template.spec.containers) {
    if (c.name === 'ttyd') {
      c.command = ['ttyd', '-W', '-p', '7681', 'sh'];
      c.env = COMMON_SECRET_ENV.map((e) => ({ ...e, value: e.name === 'AGENT_UUID' ? agentUuid : e.value }));
      c.ports = [{ containerPort: 7681, name: 'terminal' }];
    }
    if (c.name === 'opencode-serve') {
      c.env = c.env!.map((e) => (e.name === 'HOST' ? { name: 'HOST', value: '0.0.0.0' } : e));
      c.ports = [{ containerPort: 4000, name: 'opencode' }];
      c.livenessProbe = { httpGet: { path: '/global/health', port: 4000 } };
      c.readinessProbe = { httpGet: { path: '/global/health', port: 4000 } };
    }
    if (c.name === 'openchamber') {
      c.env = c.env!.map((e) =>
        e.name === 'OPENCODE_URL' ? { name: 'OPENCODE_URL', value: 'http://victim.agents.svc.cluster.local:4000' } : e
      );
    }
  }
  objects.set(P.deployment, { ...deployment, metadata: { ...deployment.metadata, uid: 'dep-uid' } } as K8sObject);

  const service = stripOwner(current.service as K8sObject & { spec: { ports: Array<{ name: string; port: number; targetPort: number; protocol: string }> } });
  service.spec.ports.splice(1, 0,
    { name: 'opencode', port: 4000, targetPort: 4000, protocol: 'TCP' },
    { name: 'terminal', port: 7681, targetPort: 7681, protocol: 'TCP' });
  objects.set(P.service, { ...service, metadata: { ...service.metadata, uid: 'svc-uid' } });

  const route = stripOwner(current.ingressRoute as K8sObject & { spec: { routes: unknown[] } });
  route.spec.routes.unshift({
    match: 'Host(`victim.is.plugged.in`) && PathPrefix(`/terminal`)',
    kind: 'Rule',
    services: [{ name: 'victim', port: 7681 }],
  });
  objects.set(P.ingressroute, { ...route, metadata: { ...route.metadata, uid: 'ir-uid' } });

  for (const [path, manifest] of [
    [P.secret, current.secret],
    [P.pvc, current.pvc],
    [P.configmap, current.configMap],
    [P.certificate, current.certificate],
  ] as const) {
    const obj = stripOwner(manifest as K8sObject);
    objects.set(path, { ...obj, metadata: { ...obj.metadata, uid: `${obj.metadata.name}-uid` } });
  }
}

function container(name: string): Container {
  return (objects.get(P.deployment) as Deployment).spec.template.spec.containers.find((c) => c.name === name)!;
}

beforeEach(() => {
  objects.clear();
  vi.clearAllMocks();
});

describe('legacy chamber agent', () => {
  it('dry run: plans without changing anything', async () => {
    seedLegacyChamber();

    const plan = await planAgentMigration(client, target);

    expect(plan.status).toBe('planned');
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(client.create).not.toHaveBeenCalled();
    expect(client.jsonPatch).not.toHaveBeenCalled();
  });

  it('applies the NetworkPolicy from the generator, labelled with the owner', async () => {
    seedLegacyChamber();

    await applyAgentMigration(client, await planAgentMigration(client, target));

    const expected = buildOpenCodeManifests(generatorConfig()).networkPolicy as K8sObject;
    const netpol = objects.get(P.netpol)!;
    expect(netpol).toBeDefined();
    expect(netpol.metadata.labels?.[OWNER_LABEL]).toBe(ME);
    expect((netpol as unknown as { spec: unknown }).spec).toEqual((expected as unknown as { spec: unknown }).spec);
  });

  it('removes 7681 and 4000 from the Service, keeping the rest', async () => {
    seedLegacyChamber();

    await applyAgentMigration(client, await planAgentMigration(client, target));

    const ports = (objects.get(P.service) as unknown as { spec: { ports: Array<{ port: number }> } }).spec.ports.map((p) => p.port);
    expect(ports).not.toContain(7681);
    expect(ports).not.toContain(4000);
    const expected = (buildOpenCodeManifests(generatorConfig()).service as { spec: { ports: Array<{ port: number }> } }).spec.ports.map((p) => p.port);
    expect(ports.sort()).toEqual(expected.sort());
  });

  it('binds ttyd to loopback with the reduced environment and no port', async () => {
    seedLegacyChamber();

    await applyAgentMigration(client, await planAgentMigration(client, target));

    const desired = (buildOpenCodeManifests(generatorConfig()).deployment as Deployment).spec.template.spec.containers.find(
      (c) => c.name === 'ttyd'
    )!;
    const ttyd = container('ttyd');
    expect(ttyd.command).toEqual(desired.command);
    expect(ttyd.command).toEqual(expect.arrayContaining(['-i', 'lo']));
    expect(ttyd.env).toEqual(desired.env);
    expect(JSON.stringify(ttyd.env)).not.toMatch(/secretKeyRef|PAP_|PLUGGEDIN_|MODEL_ROUTER_/);
    expect(ttyd.ports).toBeUndefined();
  });

  it('binds opencode-serve to 127.0.0.1 with exec probes and no port, and points openchamber at loopback', async () => {
    seedLegacyChamber();

    await applyAgentMigration(client, await planAgentMigration(client, target));

    const desired = (buildOpenCodeManifests(generatorConfig()).deployment as Deployment).spec.template.spec.containers;
    const serve = container('opencode-serve');
    expect(serve.env?.find((e) => e.name === 'HOST')?.value).toBe('127.0.0.1');
    expect(serve.ports).toBeUndefined();
    expect(serve.livenessProbe).toEqual(desired.find((c) => c.name === 'opencode-serve')!.livenessProbe);
    expect(serve.readinessProbe).toEqual(desired.find((c) => c.name === 'opencode-serve')!.readinessProbe);
    expect(container('openchamber').env?.find((e) => e.name === 'OPENCODE_URL')?.value).toBe('http://127.0.0.1:4000');
  });

  it('drops IngressRoute routes to the removed ports and keeps every other route as it is', async () => {
    seedLegacyChamber();
    type Routes = { spec: { routes: Array<{ match: string; services: Array<{ port: number }> }> } };
    const before = (objects.get(P.ingressroute) as unknown as Routes).spec.routes;

    await applyAgentMigration(client, await planAgentMigration(client, target));

    const routes = (objects.get(P.ingressroute) as unknown as Routes).spec.routes;
    expect(routes.flatMap((r) => r.services.map((s) => s.port))).not.toContain(7681);
    expect(routes).toEqual(before.filter((r) => !r.match.includes('/terminal')));
  });

  it('backfills the owner label on the Deployment, its pods and every sibling resource', async () => {
    seedLegacyChamber();

    await applyAgentMigration(client, await planAgentMigration(client, target));

    const dep = objects.get(P.deployment) as Deployment;
    expect(dep.metadata.labels?.[OWNER_LABEL]).toBe(ME);
    expect(dep.spec.template.metadata.labels[OWNER_LABEL]).toBe(ME);
    for (const path of [P.service, P.secret, P.pvc, P.configmap, P.certificate, P.ingressroute]) {
      expect(objects.get(path)?.metadata.labels?.[OWNER_LABEL]).toBe(ME);
    }
  });

  it('patches the Deployment last, pinned to the uid it planned against', async () => {
    seedLegacyChamber();

    const plan = await planAgentMigration(client, target);

    const last = plan.steps[plan.steps.length - 1];
    expect(last.path).toBe(P.deployment);
    expect(last.action).toBe('patch');
    if (last.action === 'patch') {
      expect(last.ops[0]).toEqual({ op: 'test', path: '/metadata/uid', value: 'dep-uid' });
      expect(last.ops).toContainEqual({ op: 'test', path: '/spec/template/spec/containers/2/name', value: 'ttyd' });
    }
  });

  it('is idempotent: a second run finds nothing to do', async () => {
    seedLegacyChamber();
    await applyAgentMigration(client, await planAgentMigration(client, target));
    client.create.mockClear();
    client.jsonPatch.mockClear();

    const again = await planAgentMigration(client, target);

    expect(again.status).toBe('up-to-date');
    expect(again.steps).toEqual([]);
  });

  it('an agent deployed by the current code is already up to date', async () => {
    const current = buildOpenCodeManifests(generatorConfig());
    for (const [path, manifest] of [
      [P.deployment, current.deployment],
      [P.service, current.service],
      [P.netpol, current.networkPolicy],
      [P.ingressroute, current.ingressRoute],
      [P.secret, current.secret],
      [P.pvc, current.pvc],
    ] as const) {
      const obj = manifest as K8sObject;
      objects.set(path, { ...obj, metadata: { ...obj.metadata, uid: `${obj.metadata.name}-uid` } });
    }

    const plan = await planAgentMigration(client, target);

    expect(plan.steps).toEqual([]);
    expect(plan.status).toBe('up-to-date');
  });
});

describe('never touches what cannot be proven to be this agent’s', () => {
  it('skips a Deployment whose pod spec names another agent', async () => {
    seedLegacyChamber(OTHER);

    const plan = await planAgentMigration(client, target);

    expect(plan.status).toBe('skipped');
    expect(plan.steps).toEqual([]);
  });

  it('skips a Deployment labelled for another agent', async () => {
    seedLegacyChamber();
    const dep = objects.get(P.deployment)!;
    dep.metadata.labels = { ...dep.metadata.labels, [OWNER_LABEL]: OTHER };

    const plan = await planAgentMigration(client, target);

    expect(plan.status).toBe('skipped');
  });

  it('skips when the pod spec carries no agent identity at all', async () => {
    seedLegacyChamber();
    const podSpec = (objects.get(P.deployment) as Deployment).spec.template.spec as {
      containers: Container[];
      initContainers?: Container[];
    };
    for (const c of [...podSpec.containers, ...(podSpec.initContainers ?? [])]) {
      c.env = (c.env ?? []).filter((e) => e.name !== 'AGENT_UUID' && e.name !== 'PAP_AGENT_ID');
    }

    const plan = await planAgentMigration(client, target);

    expect(plan.status).toBe('skipped');
  });

  it('skips when the Deployment is of a different template than the agent row says', async () => {
    seedLegacyChamber();

    const plan = await planAgentMigration(client, { ...target, templateType: 'opencode-ide' });

    expect(plan.status).toBe('skipped');
  });

  it('leaves a sibling labelled for another agent alone (and says so)', async () => {
    seedLegacyChamber();
    const pvc = objects.get(P.pvc)!;
    pvc.metadata.labels = { ...pvc.metadata.labels, [OWNER_LABEL]: OTHER };

    const plan = await planAgentMigration(client, target);

    expect(plan.steps.some((s) => s.path === P.pvc)).toBe(false);
    expect(plan.warnings.join('\n')).toMatch(/victim-workspace/);
  });

  it('skips a reserved name', async () => {
    const plan = await planAgentMigration(client, { ...target, name: 'pap-collector' });

    expect(plan.status).toBe('skipped');
    expect(client.get).not.toHaveBeenCalled();
  });
});

describe('standard (non-OpenCode) legacy agent', () => {
  it('only backfills owner labels: Deployment (and its pods), Service, Ingress', async () => {
    objects.set(P.deployment, {
      metadata: { name: 'victim', uid: 'dep-uid', labels: { app: 'victim', 'pap-agent': 'true' } },
      spec: {
        selector: { matchLabels: { app: 'victim' } },
        template: {
          metadata: { labels: { app: 'victim', 'pap-agent': 'true' } },
          spec: { containers: [{ name: 'agent', image: 'x', env: [{ name: 'PAP_AGENT_ID', value: ME }] }] },
        },
      },
    });
    objects.set(P.service, { metadata: { name: 'victim', uid: 'svc-uid', labels: { app: 'victim' } } });
    objects.set(P.ingress, { metadata: { name: 'victim', uid: 'ing-uid' } });

    const plan = await planAgentMigration(client, { ...target, templateType: null });
    await applyAgentMigration(client, plan);

    expect(client.create).not.toHaveBeenCalled();
    const dep = objects.get(P.deployment) as Deployment;
    expect(dep.metadata.labels?.[OWNER_LABEL]).toBe(ME);
    expect(dep.spec.template.metadata.labels[OWNER_LABEL]).toBe(ME);
    expect(objects.get(P.service)?.metadata.labels?.[OWNER_LABEL]).toBe(ME);
    expect(objects.get(P.ingress)?.metadata.labels?.[OWNER_LABEL]).toBe(ME);
    expect((await planAgentMigration(client, { ...target, templateType: null })).status).toBe('up-to-date');
  });
});
