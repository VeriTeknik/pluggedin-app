/**
 * The agent pod's web terminal must not be published without authentication.
 *
 * buildIngressRouteManifest routed `PathPrefix('/terminal')` on the agent's
 * public DNS name straight to ttyd on port 7681, with a `stripPrefix`
 * middleware and nothing else. The container runs `ttyd -W -p 7681 sh` — `-W`
 * is writable, `sh` is a shell — so anyone who reached
 * `https://<agent>.<domain>/terminal` got an interactive shell inside the pod,
 * with its mounted workspace and its service-account token.
 *
 * No agent has ever been deployed (0 rows in `agents` and `clusters` in
 * production), so this was latent rather than live — it would have become live
 * with the first deployment.
 *
 * Found by the 2026-09-06 re-scan.
 *
 * ttyd stays in the pod: it is still reachable with `kubectl port-forward`,
 * which requires cluster credentials. What is removed is the public route.
 * `uiPassword` exists in the config and is written into the Secret, but nothing
 * wires it to Traefik, so there is no authenticated route to fall back to.
 */
import { describe, expect, it } from 'vitest';

import { buildOpenCodeManifests, type OpenCodeAgentConfig } from '@/lib/agents/opencode-manifests';

const config = {
  name: 'agent-1',
  namespace: 'agents',
  dnsName: 'agent-1.example.com',
  uiPassword: 'pw',
  defaultModel: 'claude-sonnet-4',
  agentUuid: 'uuid-1',
  modelRouterUrl: 'https://router.example.com',
  modelRouterToken: 'tok',
  papApiKey: 'pap',
  pluggedinApiKey: 'plug',
} as unknown as OpenCodeAgentConfig;

/** Every route in the manifest, flattened. */
function routes(): Array<{ match: string; services: Array<{ port: number }>; middlewares?: unknown[] }> {
  const manifests = buildOpenCodeManifests(config);
  const ingress = manifests.ingressRoute as { spec?: { routes?: unknown[] } };
  return (ingress.spec?.routes ?? []) as Array<{
    match: string;
    services: Array<{ port: number }>;
    middlewares?: unknown[];
  }>;
}

describe('agent ingress', () => {
  it('builds routes at all', () => {
    expect(routes().length).toBeGreaterThan(0);
  });

  it('publishes no route to the ttyd port', () => {
    const terminalRoutes = routes().filter((r) => r.services?.some((s) => s.port === 7681));

    expect(terminalRoutes).toEqual([]);
  });

  it('publishes no /terminal path', () => {
    const terminalRoutes = routes().filter((r) => /\/terminal/.test(r.match ?? ''));

    expect(terminalRoutes).toEqual([]);
  });

  it('still keeps ttyd in the pod for port-forward access', () => {
    const manifests = buildOpenCodeManifests(config);
    const deployment = manifests.deployment as {
      spec?: { template?: { spec?: { containers?: Array<{ name: string }> } } };
    };
    const names = (deployment.spec?.template?.spec?.containers ?? []).map((c) => c.name);

    expect(names).toContain('ttyd');
  });
});
