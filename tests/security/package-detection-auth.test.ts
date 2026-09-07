import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ user: null as string | null, fetch: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => m.user ? { user: { id: m.user } } : null }));
vi.mock('@/lib/url-validator', () => ({ validateExternalUrl: (url: string) => new URL(url) }));
import { detectPackageConfiguration } from '@/app/actions/detect-package';
beforeEach(() => {
 vi.clearAllMocks(); vi.stubEnv('GITHUB_TOKEN', 'PRIVATE-PAT'); vi.stubGlobal('fetch', m.fetch);
 m.fetch.mockResolvedValue(new Response(JSON.stringify({ encoding: 'base64', content: Buffer.from(JSON.stringify({ name: 'public-package', mcpServers: { server: { command: 'npx', args: ['public-package'] } } })).toString('base64') }), { status: 200 }));
});
it('does not proxy requests for anonymous callers', async () => {
 m.user = null;
 expect(await detectPackageConfiguration('owner', 'repo', ['stdio'])).toEqual({});
 expect(m.fetch).not.toHaveBeenCalled();
});
it('detects public configuration without attaching the platform GitHub PAT', async () => {
 m.user = 'owner';
 expect(await detectPackageConfiguration('owner', 'repo', ['stdio'])).toHaveProperty('stdio.command', 'npx');
 expect(m.fetch).toHaveBeenCalled();
 for (const [, init] of m.fetch.mock.calls) expect(new Headers(init?.headers).has('authorization')).toBe(false);
});
