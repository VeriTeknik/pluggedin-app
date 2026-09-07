import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ stdio: vi.fn(), sse: vi.fn() }));
vi.mock('child_process', () => ({ default: { execFileSync: () => '/usr/bin/bwrap' }, execFileSync: () => '/usr/bin/bwrap' }));
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({ Client: class { connect = async () => {}; close = async () => {}; getServerCapabilities = () => ({}); } }));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({ StdioClientTransport: class { constructor(options: unknown) { m.stdio(options); } close = async () => {}; } }));
vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({ SSEClientTransport: class { constructor(url: unknown, options: unknown) { m.sse(url, options); } close = async () => {}; } }));
vi.mock('@/lib/mcp/package-manager', () => ({ packageManager: { transformCommand: async (command: string, args: string[]) => ({ command, args, env: { UV_CACHE_DIR: '/shared/uv-cache', PNPM_STORE_DIR: '/shared/pnpm-store' } }) } }));
import { McpServerType } from '@/db/schema';
import { listResourcesFromServer } from '@/lib/mcp/client-wrapper';
import { safeMcpFetch } from '@/lib/mcp/safe-fetch';
const server: any = { uuid: '11111111-1111-4111-8111-111111111111', name: 'test' };
it('connects SSE through the pinned fetch hook and retains authorization headers', async () => {
 await listResourcesFromServer({ ...server, type: McpServerType.SSE, url: 'https://mcp.example/sse', streamableHTTPOptions: { headers: { Authorization: 'Bearer owned-token' } } });
 expect(m.sse).toHaveBeenCalledWith(new URL('https://mcp.example/sse'), expect.objectContaining({ fetch: safeMcpFetch, requestInit: expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer owned-token' }) }) }));
});
