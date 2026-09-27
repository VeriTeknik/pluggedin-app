/**
 * lib/pap-ui-utils.ts carried its own copy of the reserved agent names
 * ("Must match backend validation in lib/agent-name-policy.ts") and had
 * drifted: it knew none of the reserved prefixes (pap-, kube-, wildcard-) or
 * names such as model-router, cert-manager, coredns, blog or docs, so the
 * deploy wizard accepted names the API then rejected — and listed dozens the
 * API accepts. The client check now reads the same constant as the server.
 */
import { describe, expect, it } from 'vitest';

import * as policy from '@/lib/agent-name-policy';
import * as ui from '@/lib/pap-ui-utils';

const SAMPLES = [
  // server-reserved names and prefixes
  'pap-collector', 'pap-heartbeat-collector', 'kube-dns', 'wildcard-tls', 'model-router',
  'cert-manager', 'coredns', 'traefik', 'k8s', 'blog', 'docs', 'api', 'admin', 'test',
  // names only the old client copy listed
  'web', 'dns', 'ns1', 'focus', 'memory', 'mcp', 'sso', 'healthz',
  // ordinary names
  'my-agent', 'compass-1', 'pap', 'papa', 'kubex',
];

describe('client and server agree on reserved agent names', () => {
  it('shares one reserved-name constant instead of a copy', () => {
    expect(ui.RESERVED_AGENT_NAMES).toBe(policy.RESERVED_AGENT_NAMES);
  });

  it.each(SAMPLES)('%s gets the same verdict in the wizard and the API', (name) => {
    const serverAccepts = policy.validateAgentName(name).ok;
    const clientAccepts = ui.validateAgentName(name) === null;
    expect(clientAccepts).toBe(serverAccepts);
  });

  it('rejects the reserved prefixes client-side', () => {
    for (const name of ['pap-collector', 'kube-dns', 'wildcard-tls']) {
      expect(ui.validateAgentName(name)).toMatch(/reserved/);
    }
  });
});
