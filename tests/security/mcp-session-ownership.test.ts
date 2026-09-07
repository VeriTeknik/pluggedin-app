import { PgDialect } from 'drizzle-orm/pg-core';
import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ owner: vi.fn(), get: vi.fn(), del: vi.fn(), handle: vi.fn() }));
vi.mock('next-auth/next', () => ({ getServerSession: async () => ({ user: { id: 'caller' } }) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/mcp/connector/handle-request', () => ({ isPublicConnectorRequest: () => false, handleConnectorRequest: vi.fn() }));
vi.mock('@/lib/mcp/streamable-http/handler', () => ({ handleStreamableHTTPRequest: m.handle }));
vi.mock('@/lib/mcp/sessions/SessionManager', () => ({ getSessionManager: () => ({ getSession: m.get, deleteSession: m.del }) }));
vi.mock('@/db', () => ({ db: { select: () => ({ from: () => ({ innerJoin: () => ({ where: m.owner }) }) }) } }));
import { DELETE, GET } from '@/app/api/mcp/route';
beforeEach(() => { vi.clearAllMocks(); m.get.mockResolvedValue({ profile_uuid: 'session-profile' }); m.owner.mockReturnValue({ limit: async () => [] }); m.handle.mockResolvedValue({ success: false, error: 'end' }); });
it.each([['GET', GET], ['DELETE', DELETE]] as const)('rejects another user session on %s', async (method, handler) => {
 const response = await handler(new NextRequest('https://plugged.in/api/mcp', { method, headers: { 'Mcp-Session-Id': 'victim-session' } }));
 expect(response.status).toBe(404);
 expect(new PgDialect().sqlToQuery(m.owner.mock.calls[0][0]).params).toEqual(['session-profile', 'caller']);
 expect(m.del).not.toHaveBeenCalled(); expect(m.handle).not.toHaveBeenCalled();
});
it('allows the owner to delete their session', async () => {
 m.owner.mockReturnValue({ limit: async () => [{ uuid: 'session-profile' }] });
 expect((await DELETE(new NextRequest('https://plugged.in/api/mcp', { method: 'DELETE', headers: { 'Mcp-Session-Id': 'owned-session' } }))).status).toBe(200);
 expect(m.del).toHaveBeenCalledWith('owned-session');
});
