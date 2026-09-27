/**
 * Every agent pod lives in the shared `agents` namespace. The chamber template
 * ran `ttyd -W -p 7681 sh` — a writable, unauthenticated shell — on all
 * interfaces, and buildServiceManifest published every container port on the
 * agent's ClusterIP Service, including 7681 and opencode-serve's
 * unauthenticated API on 4000 (HOST=0.0.0.0). Removing the public ingress
 * routes did not help: any tenant with a shell in their own agent could reach
 * `<victim>.agents.svc.cluster.local:7681` (or the pod IP) and run code in the
 * victim's workspace, with the victim's Hub API key and model-router token in
 * the environment (ttyd inherited COMMON_ENV).
 *
 * Now both listeners are loopback-only and absent from the Service, ttyd gets
 * no credentials, and the manifests include a NetworkPolicy that limits
 * ingress to the ingress controller and the agent's own pods.
 */
import { describe, expect, it } from 'vitest';

import { buildOpenCodeManifests, type OpenCodeAgentConfig } from '@/lib/agents/opencode-manifests';

type Container = {
  name: string;
  command?: string[];
  args?: string[];
  env?: Array<{ name: string; value?: string; valueFrom?: { secretKeyRef?: unknown } }>;
  ports?: Array<{ containerPort: number }>;
  livenessProbe?: { httpGet?: unknown; exec?: { command: string[] } };
  readinessProbe?: { httpGet?: unknown; exec?: { command: string[] } };
};

const base = {
  name: 'victim',
  namespace: 'agents',
  dnsName: 'victim.is.plugged.in',
  secretName: 'victim-secrets',
  configMapName: 'victim-config',
  uiPassword: 'pw',
  defaultModel: 'claude-sonnet-4',
  agentUuid: '6f1c2b1e-5a4b-4c3d-9e8f-0123456789ab',
  modelRouterUrl: 'https://router.example.com',
  modelRouterToken: 'tok',
  papApiKey: 'pap',
  pluggedinApiKey: 'plug',
};

const chamber = { ...base, templateType: 'opencode-chamber' } as OpenCodeAgentConfig;
const ide = { ...base, templateType: 'opencode-ide' } as OpenCodeAgentConfig;

function containers(config: OpenCodeAgentConfig): Container[] {
  const d = buildOpenCodeManifests(config).deployment as {
    spec: { template: { spec: { containers: Container[] } } };
  };
  return d.spec.template.spec.containers;
}

function container(config: OpenCodeAgentConfig, name: string): Container {
  const c = containers(config).find((x) => x.name === name);
  if (!c) throw new Error(`no container ${name}`);
  return c;
}

function servicePorts(config: OpenCodeAgentConfig): number[] {
  const s = buildOpenCodeManifests(config).service as { spec: { ports: Array<{ port: number; targetPort: number }> } };
  return s.spec.ports.flatMap((p) => [p.port, p.targetPort]);
}

function envValue(c: Container, name: string): string | undefined {
  return c.env?.find((e) => e.name === name)?.value;
}

describe('ttyd (web terminal)', () => {
  it('listens on loopback only', () => {
    const argv = [...(container(chamber, 'ttyd').command ?? []), ...(container(chamber, 'ttyd').args ?? [])];
    const i = argv.indexOf('-i');
    expect(i).toBeGreaterThan(-1);
    expect(argv[i + 1]).toBe('lo');
  });

  it('is not published on the agent Service', () => {
    expect(servicePorts(chamber)).not.toContain(7681);
  });

  it('gets no Hub, PAP or model-router credentials', () => {
    const env = container(chamber, 'ttyd').env ?? [];
    expect(env.filter((e) => e.valueFrom)).toEqual([]);
    const names = env.map((e) => e.name);
    for (const secret of ['PLUGGEDIN_API_KEY', 'PAP_API_KEY', 'PAP_AGENT_KEY', 'MODEL_ROUTER_TOKEN']) {
      expect(names).not.toContain(secret);
    }
  });
});

describe('opencode-serve (unauthenticated OpenCode API)', () => {
  it('binds to loopback', () => {
    expect(envValue(container(chamber, 'opencode-serve'), 'HOST')).toBe('127.0.0.1');
  });

  it('is reached by openchamber over loopback, not the cluster Service', () => {
    const url = envValue(container(chamber, 'openchamber'), 'OPENCODE_URL');
    expect(url).toBe('http://127.0.0.1:4000');
  });

  it('is not published on the agent Service', () => {
    expect(servicePorts(chamber)).not.toContain(4000);
  });

  it('is health-checked from inside the pod, since the kubelet cannot reach loopback', () => {
    const c = container(chamber, 'opencode-serve');
    for (const probe of [c.livenessProbe, c.readinessProbe]) {
      expect(probe?.httpGet).toBeUndefined();
      expect(probe?.exec?.command.join(' ')).toContain('http://127.0.0.1:4000/global/health');
    }
  });
});

describe('what the Service still publishes', () => {
  it('keeps the authenticated UIs and the agent API reachable for the ingress', () => {
    expect(servicePorts(chamber)).toEqual(expect.arrayContaining([3000, 8080]));
    expect(servicePorts(ide)).toEqual(expect.arrayContaining([8443, 8080]));
  });

  it('routes every ingress path to a port the Service still has', () => {
    for (const config of [chamber, ide]) {
      const ports = servicePorts(config);
      const routes = (buildOpenCodeManifests(config).ingressRoute as {
        spec: { routes: Array<{ services: Array<{ port: number }> }> };
      }).spec.routes;
      for (const r of routes) for (const s of r.services) expect(ports).toContain(s.port);
    }
  });
});

describe('network policy', () => {
  type Policy = {
    kind: string;
    metadata: { name: string; namespace: string; labels: Record<string, string> };
    spec: {
      podSelector: { matchLabels: Record<string, string> };
      policyTypes: string[];
      ingress: Array<{ from: Array<Record<string, { matchLabels: Record<string, string> }>> }>;
    };
  };

  function policy(config: OpenCodeAgentConfig): Policy {
    return (buildOpenCodeManifests(config) as unknown as { networkPolicy: Policy }).networkPolicy;
  }

  it('selects only this agent and restricts ingress', () => {
    const p = policy(chamber);
    expect(p.kind).toBe('NetworkPolicy');
    expect(p.metadata.namespace).toBe('agents');
    expect(p.spec.podSelector.matchLabels).toEqual({ app: 'victim' });
    expect(p.spec.policyTypes).toEqual(['Ingress']);
  });

  it('admits only the ingress controller namespace and the agent itself — never other agents', () => {
    const peers = policy(chamber).spec.ingress.flatMap((rule) => rule.from);
    expect(peers).toEqual(
      expect.arrayContaining([
        { namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'kube-system' } } },
        { podSelector: { matchLabels: { app: 'victim' } } },
      ])
    );
    // No peer may match every pod (an empty selector) or the shared agent label.
    for (const peer of peers) {
      for (const selector of Object.values(peer)) {
        expect(Object.keys(selector.matchLabels ?? {})).not.toHaveLength(0);
        expect(selector.matchLabels).not.toHaveProperty('pap-agent');
      }
    }
  });

  it('lets an operator name a different ingress controller namespace', () => {
    const p = policy({ ...chamber, ingressControllerNamespace: 'traefik' } as OpenCodeAgentConfig);
    expect(p.spec.ingress.flatMap((r) => r.from)).toContainEqual({
      namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'traefik' } },
    });
  });
});

describe('ownership labels', () => {
  it('stamps every resource with the immutable agent UUID', () => {
    const manifests = buildOpenCodeManifests(chamber) as unknown as Record<string, unknown>;
    const all = Object.values(manifests).flatMap((v) => (Array.isArray(v) ? v : [v])) as Array<{
      metadata: { labels: Record<string, string> };
    }>;
    for (const resource of all) {
      expect(resource.metadata.labels['pap.plugged.in/agent-uuid']).toBe(base.agentUuid);
    }
  });
});
