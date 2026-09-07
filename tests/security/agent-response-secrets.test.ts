import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';
const agent = vi.hoisted(() => ({ uuid: 'agent', model_router_token: 'PLATFORM-SECRET', future_platform_credential: 'FUTURE-CREDENTIAL', config_values: { api_key: 'CONFIG-SECRET' }, metadata: {}, access_level: 'PRIVATE' }));
vi.mock('@/app/api/auth', () => ({ authenticate: async () => ({ activeProfile: { uuid: 'profile' }, project: { user_id: 'owner' } }) }));
vi.mock('@/lib/rate-limiter-redis', () => ({ EnhancedRateLimiters: { agentRead: async () => ({ allowed: true }), agentUpdate: async () => ({ allowed: true }), agentIntensive: async () => ({ allowed: true }) } }));
vi.mock('@/lib/services/kubernetes-service', () => ({ kubernetesService: {} }));
vi.mock('@/db', async () => {
 const { agentsTable } = await import('@/db/schema');
 const db = { insert: () => ({ values: async () => undefined }), select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === agentsTable ? [agent] : [], orderBy: () => ({ limit: async () => [] }) }) }) }), update: () => ({ set: () => ({ where: () => ({ returning: async () => [agent] }) }) }), transaction: async (fn: any) => fn(db) };
 return { db };
});
import { POST } from '@/app/api/agents/[id]/export/route';
import { GET, PATCH } from '@/app/api/agents/[id]/route';
it.each(['GET', 'PATCH', 'EXPORT'])('does not expose platform model credentials through %s', async (method) => {
 const params = { params: Promise.resolve({ id: 'agent' }) };
 const request = new NextRequest('https://plugged.in/api/agents/agent', { method: method === 'GET' ? 'GET' : 'POST', ...(method === 'GET' ? {} : { body: JSON.stringify({ metadata: { description: 'test' } }) }) });
 const response = method === 'GET' ? await GET(request, params) : method === 'PATCH' ? await PATCH(request, params) : await POST(request, params);
 expect(response.status).toBe(200);
 const text = await response.text();
 expect(JSON.parse(text).agent.has_model_router_token).toBe(true);
 expect(text).toContain('agent');
 expect(text).not.toContain('PLATFORM-SECRET');
 expect(text).not.toContain('FUTURE-CREDENTIAL');
 if (method === 'EXPORT') expect(text).not.toContain('CONFIG-SECRET');
});
