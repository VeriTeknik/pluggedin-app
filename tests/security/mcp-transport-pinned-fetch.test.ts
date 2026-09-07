import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ safe: vi.fn(), raw: vi.fn() }));
vi.mock('@/lib/oauth/ssrf-protection', () => ({ safeFetch: m.safe }));
vi.mock('@/lib/mcp/sessions/SessionManager', () => ({ getSessionManager: () => ({ getSession: async () => null, createSession: vi.fn(), updateSession: vi.fn() }) }));
vi.mock('@/lib/mcp/oauth/OAuthStateManager', () => ({ oauthStateManager: {} }));
import { StreamableHTTPWrapper } from '@/lib/mcp/transports/StreamableHTTPWrapper';
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', m.raw); m.raw.mockImplementation(async () => new Response(null, { status: 202 })); m.safe.mockImplementation(async () => new Response(null, { status: 202 })); });
it('the installed MCP SDK actually invokes the pinned streaming fetch hook', async () => {
 const wrapper = new StreamableHTTPWrapper(new URL('https://mcp.example/mcp'), {}, 'server', 'profile');
 await wrapper.start();
 await wrapper.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
 expect(m.safe).toHaveBeenCalledWith('https://mcp.example/mcp', expect.objectContaining({ method: 'POST' }), false, true);
 expect(m.raw).not.toHaveBeenCalled();
 await wrapper.close();
});
