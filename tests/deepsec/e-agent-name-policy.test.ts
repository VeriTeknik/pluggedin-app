/**
 * An agent's name becomes the Kubernetes resource name in the shared `agents`
 * namespace, and deleting the agent deletes `<name>`, `<name>-config`,
 * `<name>-secrets`, `<name>-tls` and `<name>-workspace` by name. The reserved
 * list matched exact strings only ('pap', 'collector'), so a tenant could claim
 * `pap-collector` — the real Service every agent heartbeats to
 * (http://pap-collector.agents.svc:8080) — and delete it, together with
 * `pap-collector-config` and `pap-collector-secrets`, by deleting their agent.
 */
import { describe, expect, it } from 'vitest';

import { isReservedName, validateAgentName } from '@/lib/agent-name-policy';

// Real shared resources in the agents namespace (pap-heartbeat-collector and
// pap-model-router k8s manifests), plus names whose derived resources collide.
const INFRA_NAMES = [
  'pap-collector',
  'pap-collector-headless',
  'pap-heartbeat-collector',
  'pap-model-router',
  'kube-dns',
  'kube-system',
  'wildcard-a-plugged-in',
  'model-router',
  'traefik',
  'cert-manager',
  'kubernetes',
];

describe('agent name policy reserves shared infrastructure', () => {
  it.each(INFRA_NAMES)('rejects %s', (name) => {
    const result = validateAgentName(name);
    expect(result.ok).toBe(false);
    expect(isReservedName(name)).toBe(true);
  });

  it.each(['PAP-Collector', '  Pap-Collector  ', 'PAP-MODEL-ROUTER', 'Kube-Proxy'])(
    'rejects %s regardless of case or surrounding space',
    (name) => {
      expect(validateAgentName(name).ok).toBe(false);
      expect(isReservedName(name)).toBe(true);
    }
  );

  it('still reserves the exact names it did before', () => {
    for (const name of ['pap', 'collector', 'api', 'admin']) {
      expect(validateAgentName(name).ok).toBe(false);
    }
  });

  it.each(['my-agent', 'compass', 'papaya', 'research-bot', 'kubelet-fan'])(
    'still accepts an ordinary name like %s',
    (name) => {
      const result = validateAgentName(name);
      expect(result).toEqual({ ok: true, normalizedName: name, dnsName: name });
    }
  );
});
