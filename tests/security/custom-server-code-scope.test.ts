import { PgDialect } from 'drizzle-orm/pg-core';
import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ code: vi.fn(), insert: vi.fn(), values: vi.fn() }));
vi.mock('@/app/api/auth', () => ({ authenticateApiKey: async () => ({ activeProfile: { uuid: 'owned-profile' }, project: { user_id: 'owner' } }) }));
vi.mock('@/db', () => ({ db: {
 query: { codesTable: { findFirst: m.code } },
 insert: m.insert,
} }));
import { POST } from '@/app/api/custom-mcp-servers/route';
beforeEach(() => { vi.clearAllMocks(); m.insert.mockReturnValue({ values: m.values }); m.values.mockReturnValue({ returning: async () => [{ uuid: 'new' }] }); });
it.each([false, true])('checks code ownership before creating a custom server (%s)', async (owned) => {
 m.code.mockResolvedValue(owned ? { uuid: 'code' } : undefined);
 const response = await POST(new NextRequest('https://plugged.in/api/custom-mcp-servers', { method: 'POST', body: JSON.stringify({ name: 'test', code_uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }) }));
 expect(response.status).toBe(owned ? 200 : 404);
 if (!owned) expect(m.insert).not.toHaveBeenCalled();
 else {
  expect(m.code).toHaveBeenCalledOnce();
  const query = new PgDialect().sqlToQuery(m.code.mock.calls[0][0].where);
  expect(query.params).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner']);
 }
});
