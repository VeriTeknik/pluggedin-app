/**
 * One-off migration of agents deployed before ownership labels and OpenCode
 * isolation existed. Used by scripts/migrate-opencode-agent-isolation.ts
 * (operator-run, dry run by default); runbook:
 * docs/ops/agent-ownership-and-isolation-migration.md.
 *
 * For every agent row with a Deployment:
 * - Backfill the owner label (`pap.plugged.in/agent-uuid`) on the Deployment,
 *   its pod template and its sibling resources. Without it every
 *   name-addressed operation (logs, events, status, scale, restart, upgrade)
 *   refuses the agent. The Deployment is claimed only if it is provably this
 *   agent's: already labelled with its uuid, or unlabelled with a pod spec
 *   whose AGENT_UUID / PAP_AGENT_ID (protected env keys the app sets) all
 *   equal the agent's uuid. A leftover of a deleted agent that a later agent
 *   of the same name was pointed at fails that check and is skipped.
 * For OpenCode agents, additionally, from the same manifest generator a new
 * deploy uses (lib/agents/opencode-manifests.ts):
 * - Create the `<name>-netpol` NetworkPolicy (first, for immediate effect).
 * - Remove the loopback-only listeners' ports (ttyd 7681, opencode-serve
 *   4000) from the Service, and the IngressRoute routes that point at them.
 * - Bring the loopback-only containers to exactly what a new deploy runs:
 *   command, env (ttyd: no credentials), probes (exec, since the kubelet
 *   cannot reach loopback), no container ports; and wire OPENCODE_URL over
 *   loopback. Done last, in one patch, so the pod rolls once.
 *
 * Every patch is a JSON Patch starting with a `test` of the uid it was planned
 * against (and of each container's name at its index), so a resource replaced
 * or reordered in between is not modified. Planning is read-only; applying the
 * plan and then planning again yields nothing to do.
 */
import { isReservedName } from '@/lib/agent-name-policy';
import {
  AGENT_OWNER_LABEL,
  buildOpenCodeManifests,
  getLoopbackOnlyContainers,
  type OpenCodeAgentConfig,
} from '@/lib/agents/opencode-manifests';
import type { OpenCodeTemplateType } from '@/lib/agents/template-kind';

export type K8sObject = {
  metadata?: { name?: string; uid?: string; labels?: Record<string, string> };
  spec?: Record<string, unknown>;
  [key: string]: unknown;
};

export type JsonPatchOp = { op: 'add' | 'remove' | 'replace' | 'test'; path: string; value?: unknown };

export interface MigrationClient {
  /** GET an object; null if it does not exist. */
  get(path: string): Promise<K8sObject | null>;
  /** POST `body` to a collection. */
  create(collectionPath: string, body: object): Promise<void>;
  /** Apply an RFC 6902 JSON Patch (application/json-patch+json). */
  jsonPatch(path: string, ops: JsonPatchOp[]): Promise<void>;
}

export interface MigrationTarget {
  uuid: string;
  /** agents.kubernetes_deployment */
  name: string;
  namespace: string;
  /** Full DNS name, `${agents.dns_name}.is.plugged.in` */
  dnsName: string;
  /** null for standard (non-OpenCode) agents */
  templateType: OpenCodeTemplateType | null;
}

export type MigrationStep =
  | { action: 'create'; path: string; body: object; description: string }
  | { action: 'patch'; path: string; ops: JsonPatchOp[]; description: string };

export interface AgentMigrationPlan {
  target: MigrationTarget;
  status: 'up-to-date' | 'planned' | 'skipped';
  reason?: string;
  steps: MigrationStep[];
  warnings: string[];
}

type Container = {
  name: string;
  env?: Array<{ name: string; value?: string; valueFrom?: unknown }>;
  [field: string]: unknown;
};

type DeploymentShape = K8sObject & {
  spec?: {
    template?: {
      metadata?: { labels?: Record<string, string> };
      spec?: { containers?: Container[]; initContainers?: Container[] };
    };
  };
};

/** Fields of a loopback-only container a new deploy defines exactly. */
const LOOPBACK_CONTAINER_FIELDS = ['command', 'args', 'env', 'livenessProbe', 'readinessProbe'] as const;

/** Env vars that wire other containers to the loopback-only listeners. */
const LOOPBACK_WIRING_ENV = ['OPENCODE_URL'];

const IDENTITY_ENV = ['AGENT_UUID', 'PAP_AGENT_ID'];

function pointerEscape(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Ops that set the owner label at `labelsPath` (an object, possibly missing). */
function ownerLabelOps(labels: Record<string, string> | undefined, labelsPath: string, uuid: string): JsonPatchOp[] {
  if (labels?.[AGENT_OWNER_LABEL] === uuid) return [];
  if (!labels) return [{ op: 'add', path: labelsPath, value: { [AGENT_OWNER_LABEL]: uuid } }];
  return [{ op: 'add', path: `${labelsPath}/${pointerEscape(AGENT_OWNER_LABEL)}`, value: uuid }];
}

function resourcePaths(namespace: string, name: string) {
  const ns = encodeURIComponent(namespace);
  const n = (suffix = '') => encodeURIComponent(`${name}${suffix}`);
  const core = `/api/v1/namespaces/${ns}`;
  const traefik = `/apis/traefik.io/v1alpha1/namespaces/${ns}`;
  const networking = `/apis/networking.k8s.io/v1/namespaces/${ns}`;
  return {
    deployment: `/apis/apps/v1/namespaces/${ns}/deployments/${n()}`,
    service: `${core}/services/${n()}`,
    ingress: `${networking}/ingresses/${n()}`,
    networkPolicies: `${networking}/networkpolicies`,
    networkPolicy: `${networking}/networkpolicies/${n('-netpol')}`,
    ingressRoute: `${traefik}/ingressroutes/${n()}`,
    pvc: `${core}/persistentvolumeclaims/${n('-workspace')}`,
    secret: `${core}/secrets/${n('-secrets')}`,
    configMap: `${core}/configmaps/${n('-config')}`,
    certificate: `/apis/cert-manager.io/v1/namespaces/${ns}/certificates/${n('-tls')}`,
    middlewares: ['-strip-opencode', '-strip-code', '-strip-terminal'].map((s) => `${traefik}/middlewares/${n(s)}`),
  };
}

function containersOf(deployment: DeploymentShape): Container[] {
  return deployment.spec?.template?.spec?.containers ?? [];
}

/** Literal AGENT_UUID / PAP_AGENT_ID values anywhere in the pod spec. */
function identityValues(deployment: DeploymentShape): string[] {
  const all = [...containersOf(deployment), ...(deployment.spec?.template?.spec?.initContainers ?? [])];
  return all.flatMap((c) =>
    (c.env ?? []).filter((e) => IDENTITY_ENV.includes(e.name) && typeof e.value === 'string').map((e) => e.value as string)
  );
}

function envValue(deployment: DeploymentShape, name: string): string | undefined {
  for (const c of containersOf(deployment)) {
    const hit = c.env?.find((e) => e.name === name && typeof e.value === 'string');
    if (hit) return hit.value;
  }
  return undefined;
}

/** Ops bringing one existing container in line with the generator's. */
function containerOps(existing: Container, desired: Container, base: string, loopbackOnly: boolean): JsonPatchOp[] {
  const ops: JsonPatchOp[] = [];
  if (loopbackOnly) {
    // Not a pod port and never on the Service.
    if (existing.ports !== undefined) ops.push({ op: 'remove', path: `${base}/ports` });
    for (const field of LOOPBACK_CONTAINER_FIELDS) {
      if (same(existing[field], desired[field])) continue;
      if (desired[field] === undefined) ops.push({ op: 'remove', path: `${base}/${field}` });
      else ops.push({ op: existing[field] === undefined ? 'add' : 'replace', path: `${base}/${field}`, value: desired[field] });
    }
    return ops;
  }
  for (const name of LOOPBACK_WIRING_ENV) {
    const want = desired.env?.find((e) => e.name === name);
    if (!want || typeof want.value !== 'string') continue;
    const index = existing.env?.findIndex((e) => e.name === name) ?? -1;
    if (index >= 0) {
      if (!same(existing.env![index], want)) ops.push({ op: 'replace', path: `${base}/env/${index}`, value: want });
    } else if (existing.env) {
      ops.push({ op: 'add', path: `${base}/env/-`, value: want });
    } else {
      ops.push({ op: 'add', path: `${base}/env`, value: [want] });
    }
  }
  return ops;
}

/**
 * Plan the migration of one agent. Read-only: only `client.get` is called.
 */
export async function planAgentMigration(
  client: MigrationClient,
  target: MigrationTarget,
  options: { ingressControllerNamespace?: string } = {}
): Promise<AgentMigrationPlan> {
  const plan: AgentMigrationPlan = { target, status: 'planned', steps: [], warnings: [] };
  const skip = (reason: string): AgentMigrationPlan => ({ ...plan, status: 'skipped', reason, steps: [] });

  if (isReservedName(target.name)) {
    return skip(`'${target.name}' is a reserved name (shared infrastructure); not touched`);
  }

  const p = resourcePaths(target.namespace, target.name);
  const deployment = (await client.get(p.deployment)) as DeploymentShape | null;
  if (!deployment) {
    return skip(`no Deployment named ${target.name} in ${target.namespace}`);
  }
  const uid = deployment.metadata?.uid;
  if (!uid) {
    return skip(`Deployment ${target.name} has no uid`);
  }

  // Identity: never claim a Deployment that is not provably this agent's.
  const owner = deployment.metadata?.labels?.[AGENT_OWNER_LABEL];
  if (owner && owner !== target.uuid) {
    return skip(`Deployment ${target.name} is labelled for another agent (${owner})`);
  }
  if (!owner) {
    const ids = identityValues(deployment);
    if (ids.length === 0) {
      return skip(`Deployment ${target.name} has no owner label and no AGENT_UUID/PAP_AGENT_ID to verify it by`);
    }
    const foreign = ids.find((id) => id !== target.uuid);
    if (foreign) {
      return skip(`Deployment ${target.name} was deployed for another agent (${foreign}); a leftover, review manually`);
    }
  }

  const deployedTemplate =
    deployment.metadata?.labels?.template ?? deployment.spec?.template?.metadata?.labels?.template ?? null;
  const deployedIsOpenCode = typeof deployedTemplate === 'string' && deployedTemplate.startsWith('opencode-');
  if ((deployedIsOpenCode || target.templateType) && deployedTemplate !== target.templateType) {
    return skip(
      `template mismatch: the agent row says ${target.templateType ?? 'standard'}, the Deployment says ${deployedTemplate ?? 'standard'}`
    );
  }

  // The generator's view of this agent. Only non-secret fields are used
  // (listeners, env layout, probes, ports, routes, NetworkPolicy); the
  // placeholder credentials are never written anywhere.
  let desired: ReturnType<typeof buildOpenCodeManifests> | null = null;
  let loopback: Array<{ name: string; port: number }> = [];
  if (target.templateType) {
    const config: OpenCodeAgentConfig = {
      name: target.name,
      namespace: target.namespace,
      // The domain the agent actually runs with, if recorded in its env.
      dnsName: envValue(deployment, 'AGENT_DOMAIN') ?? target.dnsName,
      templateType: target.templateType,
      secretName: `${target.name}-secrets`,
      configMapName: `${target.name}-config`,
      uiPassword: '',
      defaultModel: '',
      agentUuid: target.uuid,
      modelRouterUrl: envValue(deployment, 'MODEL_ROUTER_URL') ?? '',
      modelRouterToken: '',
      papApiKey: '',
      pluggedinApiKey: '',
      ingressControllerNamespace: options.ingressControllerNamespace,
    };
    desired = buildOpenCodeManifests(config);
    loopback = getLoopbackOnlyContainers(config);
  }
  const loopbackPorts = new Set(loopback.map((c) => c.port));

  // 1. NetworkPolicy first: it isolates the pods immediately.
  if (desired) {
    const netpol = await client.get(p.networkPolicy);
    if (!netpol) {
      plan.steps.push({
        action: 'create',
        path: p.networkPolicies,
        body: desired.networkPolicy,
        description: `create NetworkPolicy ${target.name}-netpol`,
      });
    } else if (netpol.metadata?.labels?.[AGENT_OWNER_LABEL] !== target.uuid) {
      plan.warnings.push(`NetworkPolicy ${target.name}-netpol exists but is not labelled for this agent; left unchanged, review it`);
    }
  }

  // 2. Sibling resources: owner label, plus Service ports and IngressRoute
  //    routes for OpenCode agents.
  const siblings = desired
    ? [p.service, p.ingressRoute, ...p.middlewares, p.certificate, p.configMap, p.secret, p.pvc]
    : [p.service, p.ingress];
  for (const path of siblings) {
    const obj = await client.get(path);
    if (!obj) continue;
    const name = obj.metadata?.name ?? decodeURIComponent(path.split('/').pop() ?? '');
    const objOwner = obj.metadata?.labels?.[AGENT_OWNER_LABEL];
    if (objOwner && objOwner !== target.uuid) {
      plan.warnings.push(`${name} (${path.split('/').slice(-2, -1)[0]}) is labelled for another agent; left unchanged`);
      continue;
    }
    const ops = ownerLabelOps(obj.metadata?.labels, '/metadata/labels', target.uuid);

    if (desired && path === p.service) {
      const ports = (obj.spec?.ports as Array<{ port: number }> | undefined) ?? [];
      for (let i = ports.length - 1; i >= 0; i--) {
        if (loopbackPorts.has(ports[i].port)) {
          ops.push({ op: 'test', path: `/spec/ports/${i}/port`, value: ports[i].port });
          ops.push({ op: 'remove', path: `/spec/ports/${i}` });
        }
      }
    }
    if (desired && path === p.ingressRoute) {
      // Drop only the routes that reach a loopback-only listener (e.g. an old
      // public /terminal route); every other route, host included, stays.
      const routes = (obj.spec?.routes as Array<{ match?: string; services?: Array<{ port?: number }> }> | undefined) ?? [];
      for (let i = routes.length - 1; i >= 0; i--) {
        const exposesLoopback = (routes[i].services ?? []).some((svc) => svc.port !== undefined && loopbackPorts.has(svc.port));
        if (exposesLoopback) {
          ops.push({ op: 'test', path: `/spec/routes/${i}/match`, value: routes[i].match });
          ops.push({ op: 'remove', path: `/spec/routes/${i}` });
        }
      }
    }

    if (ops.length > 0) {
      const uidTest: JsonPatchOp[] = obj.metadata?.uid ? [{ op: 'test', path: '/metadata/uid', value: obj.metadata.uid }] : [];
      plan.steps.push({ action: 'patch', path, ops: [...uidTest, ...ops], description: `update ${name}` });
    }
  }

  // 3. The Deployment last, in one patch (one rollout).
  const depOps: JsonPatchOp[] = [
    ...ownerLabelOps(deployment.metadata?.labels, '/metadata/labels', target.uuid),
    ...ownerLabelOps(deployment.spec?.template?.metadata?.labels, '/spec/template/metadata/labels', target.uuid),
  ];
  if (desired) {
    const desiredContainers = containersOf(desired.deployment as DeploymentShape);
    const loopbackNames = new Set(loopback.map((c) => c.name));
    containersOf(deployment).forEach((existing, index) => {
      const want = desiredContainers.find((c) => c.name === existing.name);
      if (!want) return;
      const base = `/spec/template/spec/containers/${index}`;
      const ops = containerOps(existing, want, base, loopbackNames.has(existing.name));
      if (ops.length > 0) {
        depOps.push({ op: 'test', path: `${base}/name`, value: existing.name }, ...ops);
      }
    });
  }
  if (depOps.length > 0) {
    plan.steps.push({
      action: 'patch',
      path: p.deployment,
      ops: [{ op: 'test', path: '/metadata/uid', value: uid }, ...depOps],
      description: `update Deployment ${target.name}${desired ? ' (loopback listeners, owner label)' : ' (owner label)'}`,
    });
  }

  if (plan.steps.length === 0) plan.status = 'up-to-date';
  return plan;
}

/**
 * Apply a plan's steps in order, stopping at the first failure (planning
 * again afterwards picks up where it stopped).
 */
export async function applyAgentMigration(
  client: MigrationClient,
  plan: AgentMigrationPlan
): Promise<{ applied: number; error?: string }> {
  if (plan.status !== 'planned') return { applied: 0 };
  let applied = 0;
  for (const step of plan.steps) {
    try {
      if (step.action === 'create') await client.create(step.path, step.body);
      else await client.jsonPatch(step.path, step.ops);
      applied++;
    } catch (error) {
      return { applied, error: `${step.description}: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  return { applied };
}
