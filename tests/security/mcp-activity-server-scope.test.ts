import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ server: vi.fn(), write: vi.fn(), notify: vi.fn() }));
vi.mock('@/app/api/auth', () => ({ authenticateApiKey: async () => ({ activeProfile: { uuid: 'owned-profile' } }) }));
vi.mock('@/lib/notifications-internal', () => ({ createNotification: m.notify }));
vi.mock('@/lib/analytics-cache', () => ({ analyticsCache: { invalidateProfile: vi.fn() } }));
vi.mock('@/db', () => ({ db: { query: { mcpServersTable: { findFirst: m.server } }, insert: () => ({ values: m.write }) } }));
import { POST } from '@/app/api/notifications/mcp-activity/route';
const send = (extra: object) => POST(new Request('https://plugged.in/api/notifications/mcp-activity', { method: 'POST', body: JSON.stringify({ action: 'tool_call', serverName: 'Test', success: true, ...extra }) }));
beforeEach(() => { vi.clearAllMocks(); m.server.mockResolvedValue(undefined); m.write.mockResolvedValue(undefined); m.notify.mockResolvedValue({ success: true }); });
it.each([{ serverUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, { serverUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', source: 'REGISTRY', externalId: 'victim' }, { externalId: 'victim', source: 'REGISTRY' }])('rejects an unowned activity reference %j', async (reference) => {
 expect((await send(reference)).status).toBe(404);
 expect(m.write).not.toHaveBeenCalled(); expect(m.notify).not.toHaveBeenCalled();
});
it('derives attribution from the owned server instead of trusting submitted ranking identifiers', async () => {
 m.server.mockResolvedValue({ uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', external_id: 'actual-registry-id', source: 'REGISTRY' });
 expect((await send({ serverUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', source: 'COMMUNITY', externalId: 'spoofed' })).status).toBe(200);
 expect(new PgDialect().sqlToQuery(m.server.mock.calls[0][0].where).params).toContain('owned-profile');
 expect(m.write).toHaveBeenCalledWith(expect.objectContaining({ external_id: 'actual-registry-id', source: 'REGISTRY', profile_uuid: 'owned-profile' }));
});
it('records built-in activity without accepting a forged registry attribution', async () => {
 expect((await send({ serverUuid: 'pluggedin_rag', source: 'REGISTRY', externalId: 'victim' })).status).toBe(200);
 expect(m.write).toHaveBeenCalledWith(expect.objectContaining({ source: 'PLUGGEDIN', server_uuid: null, external_id: 'pluggedin_rag' }));
});
