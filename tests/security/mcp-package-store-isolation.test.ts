import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ stdio: vi.fn(), sse: vi.fn() }));
vi.mock('child_process', () => ({ default: { execFileSync: () => '/usr/bin/bwrap' }, execFileSync: () => '/usr/bin/bwrap' }));
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: class { connect = async () => {}; close = async () => {}; getServerCapabilities = () => ({}); } }));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: class { constructor(options: unknown) { m.stdio(options); } close = async () => {}; } }));
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({ SSEClientTransport: class { constructor(url: unknown, options: unknown) { m.sse(url, options); } close = async () => {}; } }));
vi.mock('@/lib/mcp/package-manager', () => ({ packageManager: { transformCommand: async (command: string, args: string[]) => ({ command, args, env: { UV_CACHE_DIR: '/shared/uv-cache', PNPM_STORE_DIR: '/shared/pnpm-store' } }) } }));
import { McpServerType } from '@/db/schema';
import { createBubblewrapConfig, listResourcesFromServer } from '@/lib/mcp/client-wrapper';
import { PackageManagerConfig } from '@/lib/mcp/package-manager/config';
const uuid = '11111111-1111-4111-8111-111111111111';
const own = `${PackageManagerConfig.PACKAGE_STORE_DIR}/servers/${uuid}`;
const server: any = { uuid, name: 'test', type: McpServerType.STDIO, command: 'npx', args: ['test-package'], env: {} };
it('mounts only this server package directory and withholds the Docker socket', () => {
 const cfg = createBubblewrapConfig(server)!;
 expect(cfg.args).toContain(own);
 expect(cfg.args).not.toContain(PackageManagerConfig.PACKAGE_STORE_DIR);
 expect(cfg.args).not.toContain('/var/run/docker.sock');
 expect(cfg.env.UV_CACHE_DIR).toBe(`${own}/workspace/.cache/uv`);
 expect(cfg.env.PNPM_STORE_DIR).toBe(`${own}/workspace/.cache/pnpm`);
});
it('enforces private runtime caches after package manager and user environment merges', async () => {
 await listResourcesFromServer({ ...server, env: { UV_CACHE_DIR: '/shared/override' } });
 const cfg = m.stdio.mock.calls.at(-1)![0];
 expect(cfg.command).toBe('bwrap');
 expect(cfg.env.UV_CACHE_DIR).toBe(`${own}/workspace/.cache/uv`);
 expect(cfg.env.PNPM_STORE_DIR).toBe(`${own}/workspace/.cache/pnpm`);
});
