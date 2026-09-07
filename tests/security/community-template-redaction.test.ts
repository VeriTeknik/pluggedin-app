import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ first: vi.fn(), many: vi.fn(), written: [] as any[] }));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({ user: { id: 'owner' } }) }));
vi.mock('@/app/actions/registry-servers', () => ({ verifyGitHubOwnership: vi.fn() }));
vi.mock('@/lib/registry/pluggedin-registry-client', () => ({ PluggedinRegistryClient: class {} }));
vi.mock('@/db', () => ({ db: {
 query: { profilesTable: { findFirst: async () => ({ project: { user_id: 'owner' } }) }, mcpServersTable: { findFirst: async () => null }, registryServersTable: { findFirst: async () => null }, sharedMcpServersTable: { findFirst: m.first, findMany: m.many } },
 insert: () => ({ values: (v: any) => { m.written.push(v); return { returning: async () => [{ uuid: 'new', ...v }] }; } }),
} }));
import { createCommunityServer, getClaimableCommunityServers,getCommunityServer } from '@/app/actions/community-servers';
import { McpServerType } from '@/db/schema';
const template = { name: 'test', type: McpServerType.STDIO, command: 'npx', args: ['server', '--token', 'SECRET-ARG'], env: { API_KEY: 'SECRET-ENV' }, streamableHTTPOptions: { headers: { Authorization: 'SECRET-HEADER' } } };
beforeEach(() => { vi.clearAllMocks(); m.written.length = 0; m.many.mockResolvedValue([]); });
it('redacts the public template on creation while preserving the private local configuration', async () => {
 const result = await createCommunityServer({ title: 'Test', template, profileUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
 expect(result.success).toBe(true);
 expect(JSON.stringify(m.written.find(v => v.template)?.template)).not.toContain('SECRET-');
 expect(m.written.find(v => v.command)?.env.API_KEY).toBe('SECRET-ENV');
});
it.each(['single', 'list'])('redacts legacy public %s reads including the live server relation', async (kind) => {
 const share = { uuid: 'share', is_public: true, template, server: { uuid: 'server', ...template } };
 m.first.mockResolvedValue(share); m.many.mockResolvedValue([share]);
 const result = kind === 'single' ? await getCommunityServer('share') : await getClaimableCommunityServers();
 expect(result.success).toBe(true);
 expect(JSON.stringify(result)).not.toContain('SECRET-');
});
