// @vitest-environment node
/**
 * Deploys refuse to adopt a leftover resource that is not labelled with the
 * agent's uuid, but every other agent operation addressed the cluster by name
 * alone: logs, events and pod status selected pods by `app=<name>`, and scale,
 * restart, upgrade and status read or patched the Deployment called `<name>`.
 *
 * Orphan takeover: an account is deleted and leaves an unlabelled Deployment
 * behind. Someone registers the same name. The deploy correctly refuses, but
 * the agent row still pointed at `<name>`, so /logs returned the previous
 * tenant's pod logs, /events worked, and suspend -> resume -> upgrade PATCHed
 * the orphan's image, which then ran with the orphan's PAP_API_KEY and
 * MODEL_ROUTER_TOKEN in its environment.
 *
 * Pods now carry the owner label too and are selected by it, and every
 * Deployment operation reads the Deployment first and refuses unless its owner
 * label is this agent's uuid (legacy unlabelled Deployments included, until an
 * operator backfills the label). The patch names the uid that was checked, so
 * a Deployment replaced in between is not patched either.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.K8S_SERVICE_ACCOUNT_TOKEN = 'test-token';
});
vi.mock('https', async () => (await import('./r2c-k8s-fake')).httpsModule());

import { fake, OWNER_LABEL, pathsFor } from './r2c-k8s-fake';

const { kubernetesService } = await import('@/lib/services/kubernetes-service');

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const P = pathsFor('victim');

type Deployment = {
  metadata: { labels?: Record<string, string>; uid?: string };
  spec: {
    selector: { matchLabels: Record<string, string> };
    template: {
      metadata: { labels: Record<string, string> };
      spec: { containers: Array<{ name: string; image?: string; env?: Array<{ name: string; value?: string }> }> };
    };
  };
};

function seedDeployment(owner?: string, image = 'ghcr.io/veriteknik/victim:1') {
  return fake.seed(P.deployment, {
    metadata: {
      name: 'victim',
      labels: owner ? { app: 'victim', [OWNER_LABEL]: owner } : { app: 'victim', 'pap-agent': 'true' },
    },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'victim' } },
      template: {
        metadata: { labels: owner ? { app: 'victim', [OWNER_LABEL]: owner } : { app: 'victim' } },
        spec: {
          containers: [
            {
              name: 'agent',
              image,
              env: [
                { name: 'PAP_AGENT_KEY', value: 'pg_in_previous_tenant_key' },
                { name: 'MODEL_ROUTER_TOKEN', value: 'previous-tenant-jwt' },
              ],
            },
          ],
        },
      },
    },
    status: { replicas: 1, readyReplicas: 1, availableReplicas: 1, updatedReplicas: 1 },
  });
}

function seedPod(podName: string, owner?: string, log = `log of ${podName}`) {
  fake.seed(P.pod(podName), {
    metadata: { name: podName, labels: owner ? { app: 'victim', [OWNER_LABEL]: owner } : { app: 'victim' } },
    status: { phase: 'Running', containerStatuses: [{ name: 'agent', ready: true, restartCount: 0, state: { running: {} } }] },
  });
  fake.logs.set(podName, log);
}

function seedEvent(name: string, involved: { kind: string; name: string; uid: string }, message: string) {
  fake.seed(`${P.events}/${name}`, {
    metadata: { name },
    involvedObject: involved,
    type: 'Normal',
    reason: 'Test',
    message,
    lastTimestamp: '2026-01-01T00:00:00Z',
  });
}

beforeEach(() => {
  fake.reset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('pod templates carry the owner label', () => {
  it('standard deploy: pods are labelled with the agent uuid (selector unchanged)', async () => {
    const result = await kubernetesService.deployAgent({
      name: 'victim',
      namespace: 'agents',
      dnsName: 'victim.is.plugged.in',
      agentUuid: ME,
      image: 'ghcr.io/veriteknik/compass-agent:latest',
    });

    expect(result.success).toBe(true);
    const d = fake.get(P.deployment) as unknown as Deployment;
    expect(d.spec.template.metadata.labels[OWNER_LABEL]).toBe(ME);
    // Selectors are immutable; the owner label is added to the template only.
    expect(d.spec.selector.matchLabels).toEqual({ app: 'victim' });
  });

  it('OpenCode deploy: pods are labelled with the agent uuid', async () => {
    const result = await kubernetesService.deployOpenCodeAgent({
      name: 'victim',
      namespace: 'agents',
      dnsName: 'victim.is.plugged.in',
      templateType: 'opencode-chamber',
      agentUuid: ME,
      uiPassword: 'password123',
      defaultModel: 'claude-sonnet-4',
      modelRouterUrl: 'https://router.example.com',
      modelRouterToken: 'tok',
      papApiKey: 'pap',
      pluggedinApiKey: 'plug',
    });

    expect(result.success).toBe(true);
    const d = fake.get(P.deployment) as unknown as Deployment;
    expect(d.spec.template.metadata.labels[OWNER_LABEL]).toBe(ME);
  });
});

describe('logs, events and pod status only ever show this agent’s pods', () => {
  it('does not return an orphan pod’s logs to the new holder of the name', async () => {
    seedDeployment();
    seedPod('victim-orphan', undefined, 'SECRET previous tenant output');

    const logs = await kubernetesService.getAgentLogs('victim', 'agents', ME, 100);

    expect(logs).toBeNull();
    expect(fake.calls.some((c) => c.path.endsWith('/log'))).toBe(false);
  });

  it('selects pods by the owner label and returns this agent’s logs', async () => {
    seedDeployment(ME);
    seedPod('victim-orphan', undefined, 'SECRET previous tenant output');
    seedPod('victim-mine', ME, 'my own output');

    const logs = await kubernetesService.getAgentLogs('victim', 'agents', ME, 100);

    expect(logs).toBe('my own output');
    const list = fake.callsOf('GET', P.pods).find((c) => c.path === P.pods)!;
    expect(list.query.get('labelSelector')).toContain(`${OWNER_LABEL}=${ME}`);
  });

  it('pod status lists only pods labelled for this agent', async () => {
    seedPod('victim-orphan');
    seedPod('victim-other', OTHER);
    seedPod('victim-mine', ME);

    const pods = await kubernetesService.getAgentPodStatus('victim', 'agents', ME);

    expect(pods.map((p) => p.name)).toEqual(['victim-mine']);
  });

  it('events: nothing from an orphan Deployment or its pods', async () => {
    seedDeployment();
    seedPod('victim-orphan');
    seedEvent('e1', { kind: 'Deployment', name: 'victim', uid: 'seed-victim' }, 'orphan deployment event');
    seedEvent('e2', { kind: 'Pod', name: 'victim-orphan', uid: 'seed-victim-orphan' }, 'orphan pod event');

    const events = await kubernetesService.getAgentEvents('victim', 'agents', ME);

    expect(events).toEqual([]);
  });

  it('events: returns the owned Deployment’s and owned pods’ events', async () => {
    seedDeployment(ME);
    seedPod('victim-mine', ME);
    seedEvent('e1', { kind: 'Deployment', name: 'victim', uid: 'seed-victim' }, 'my deployment event');
    seedEvent('e2', { kind: 'Pod', name: 'victim-mine', uid: 'seed-victim-mine' }, 'my pod event');

    const events = await kubernetesService.getAgentEvents('victim', 'agents', ME);

    expect(events.map((e) => e.message).sort()).toEqual(['my deployment event', 'my pod event']);
  });

  it.each([
    ['an unlabelled (orphan or legacy)', undefined],
    ['another agent’s', OTHER],
  ])('deployment status is not reported for %s Deployment', async (_label, owner) => {
    seedDeployment(owner);

    expect(await kubernetesService.getDeploymentStatus('victim', 'agents', ME)).toBeNull();
  });

  it('deployment status is reported for this agent’s Deployment', async () => {
    seedDeployment(ME);

    const status = await kubernetesService.getDeploymentStatus('victim', 'agents', ME);

    expect(status?.readyReplicas).toBe(1);
  });
});

const ops = {
  scale: () => kubernetesService.scaleAgent('victim', 0, 'agents', ME),
  restart: () => kubernetesService.restartDeployment('victim', 'agents', ME),
  upgrade: () =>
    kubernetesService.upgradeAgent({
      name: 'victim',
      namespace: 'agents',
      agentUuid: ME,
      image: 'ghcr.io/veriteknik/attacker:1',
    }),
};

describe.each(Object.keys(ops) as Array<keyof typeof ops>)('%s refuses a Deployment that is not provably this agent’s', (op) => {
  it('refuses an unlabelled Deployment (orphan, or legacy until backfilled) without patching it', async () => {
    seedDeployment();

    const result = await ops[op]();

    expect(result.success).toBe(false);
    expect(result.code).toBe('not_owned');
    expect(fake.callsOf('PATCH')).toHaveLength(0);
  });

  it('refuses a Deployment labelled for another agent', async () => {
    seedDeployment(OTHER);

    const result = await ops[op]();

    expect(result.success).toBe(false);
    expect(result.code).toBe('not_owned');
    expect(fake.callsOf('PATCH')).toHaveLength(0);
  });

  it('reports a missing Deployment as not found', async () => {
    const result = await ops[op]();

    expect(result.success).toBe(false);
    expect(result.code).toBe('not_found');
  });

  it('patches this agent’s Deployment, naming the uid it checked', async () => {
    seedDeployment(ME);

    const result = await ops[op]();

    expect(result.success).toBe(true);
    const patches = fake.callsOf('PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0].path).toBe(P.deployment);
    expect((patches[0].body as { metadata?: { uid?: string } }).metadata?.uid).toBe('seed-victim');
  });

  it('does not patch a Deployment replaced after the ownership check', async () => {
    seedDeployment(ME);
    // Swap the object between the GET and the PATCH: same name, new uid.
    fake.after = (call) => {
      if (call.method === 'GET' && call.path === P.deployment) {
        const current = fake.get(P.deployment)!;
        fake.objects.set(P.deployment, { ...current, metadata: { ...current.metadata, uid: 'replaced' } });
      }
    };

    const result = await ops[op]();

    expect(result.success).toBe(false);
    expect(fake.get(P.deployment)?.metadata.uid).toBe('replaced');
  });
});

describe('orphan takeover, end to end', () => {
  it('a new agent with an orphan’s name can neither deploy over it nor read, scale or re-image it', async () => {
    seedDeployment(undefined, 'ghcr.io/veriteknik/orphan:1');
    seedPod('victim-orphan', undefined, 'SECRET previous tenant output');

    const deploy = await kubernetesService.deployAgent({
      name: 'victim',
      namespace: 'agents',
      dnsName: 'victim.is.plugged.in',
      agentUuid: ME,
      image: 'ghcr.io/veriteknik/compass-agent:latest',
    });
    expect(deploy.success).toBe(false);
    // The caller needs to know the name is held by someone else's leftovers.
    expect(deploy.ownershipConflict).toBe(true);

    expect(await kubernetesService.getAgentLogs('victim', 'agents', ME, 100)).toBeNull();
    expect((await kubernetesService.scaleAgent('victim', 1, 'agents', ME)).success).toBe(false);
    expect(
      (await kubernetesService.upgradeAgent({ name: 'victim', namespace: 'agents', agentUuid: ME, image: 'ghcr.io/veriteknik/attacker:1' }))
        .success
    ).toBe(false);

    const orphan = fake.get(P.deployment) as unknown as Deployment;
    expect(orphan.spec.template.spec.containers[0].image).toBe('ghcr.io/veriteknik/orphan:1');
  });

  it('a deploy that fails for another reason is not reported as an ownership conflict', async () => {
    fake.failures.set(`POST ${P.deployments}`, 500);

    const deploy = await kubernetesService.deployAgent({
      name: 'victim',
      namespace: 'agents',
      dnsName: 'victim.is.plugged.in',
      agentUuid: ME,
      image: 'ghcr.io/veriteknik/compass-agent:latest',
    });

    expect(deploy.success).toBe(false);
    expect(deploy.ownershipConflict).toBeFalsy();
  });
});
