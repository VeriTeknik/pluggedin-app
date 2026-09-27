/**
 * The OpenCode Chamber marketplace template still advertised a `/terminal`
 * web shell and a public `/opencode` API. Neither exists any more: ttyd and
 * opencode-serve are bound to loopback, absent from the Service, and have no
 * IngressRoute (lib/agents/opencode-manifests.ts). Users should not be told to
 * expect them, and the template's routing metadata should not describe routes
 * the platform refuses to create.
 *
 * Reads the seed script as text; it is never executed.
 */
import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildOpenCodeManifests, type OpenCodeAgentConfig } from '@/lib/agents/opencode-manifests';

const src = fs.readFileSync('scripts/seed-opencode-chamber-template.ts', 'utf8');

function publicPrefixes(): string[] {
  const route = buildOpenCodeManifests({
    name: 'x',
    namespace: 'agents',
    dnsName: 'x.is.plugged.in',
    templateType: 'opencode-chamber',
    secretName: 'x-secrets',
    configMapName: 'x-config',
    uiPassword: 'pw',
    defaultModel: 'm',
    agentUuid: 'u',
    modelRouterUrl: 'https://r',
    modelRouterToken: 't',
    papApiKey: 'p',
    pluggedinApiKey: 'k',
  } as OpenCodeAgentConfig).ingressRoute as { spec: { routes: Array<{ match: string }> } };
  return route.spec.routes.map((r) => /PathPrefix\(`([^`]+)`\)/.exec(r.match)?.[1] ?? '/');
}

describe('OpenCode Chamber template text', () => {
  it('does not advertise the loopback-only terminal or OpenCode API as endpoints', () => {
    // Backticks inside the template literal are escaped (\`/terminal\`).
    expect(src).not.toMatch(/`\/terminal\\?`/);
    expect(src).not.toMatch(/'\/terminal'/);
    expect(src).not.toMatch(/\|\s*\\?`\/opencode\\?`\s*\|/);
    expect(src).not.toMatch(/'\/opencode'\s*:/);
    // Feature claims, not the sentence saying there is no public terminal.
    expect(src).not.toMatch(/\*\*Web Terminal\*\*|Web terminal access|full (shell|terminal) access|and web terminal/i);
  });

  it('routing metadata lists only paths the IngressRoute actually publishes', () => {
    const routing = /routing:\s*\{([\s\S]*?)\n\s*\},/.exec(src)?.[1] ?? '';
    const advertised = [...routing.matchAll(/'([^']+)':\s*\{/g)].map((m) => m[1]);
    expect(advertised.length).toBeGreaterThan(0);
    const published = publicPrefixes();
    for (const path of advertised) {
      expect(published).toContain(path);
    }
  });
});
