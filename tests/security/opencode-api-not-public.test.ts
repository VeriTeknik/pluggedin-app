import { expect, it } from 'vitest';

import { buildOpenCodeManifests, type OpenCodeAgentConfig } from '@/lib/agents/opencode-manifests';
it('exposes the authenticated chamber UI without directly publishing the OpenCode backend', () => {
 const config = { name: 'agent', namespace: 'agents', dnsName: 'agent.example.com', templateType: 'opencode-chamber', uiPassword: 'pw', defaultModel: 'model', agentUuid: 'agent', modelRouterUrl: 'https://router.example.com', modelRouterToken: 'token', papApiKey: 'key', pluggedinApiKey: 'key' } as unknown as OpenCodeAgentConfig;
 const manifests = buildOpenCodeManifests(config);
 const routes = (manifests.ingressRoute as any).spec.routes;
 expect(routes.some((r: any) => r.services.some((s: any) => s.port === 3000))).toBe(true);
 expect(routes.filter((r: any) => r.services.some((s: any) => s.port === 4000))).toEqual([]);
 expect(routes.filter((r: any) => r.match.includes('/opencode'))).toEqual([]);
});
