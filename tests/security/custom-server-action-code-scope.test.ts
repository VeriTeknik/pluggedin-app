import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ code: vi.fn(), write: vi.fn(), joined: vi.fn() }));
vi.mock('@/lib/auth-helpers', () => ({ withProfileAuth: async (_profile: string, fn: any) => fn({ user: { id: 'owner' } }) }));
vi.mock('@/db', () => ({ db: {
 query: { codesTable: { findFirst: m.code } },
 insert: () => ({ values: (v: any) => { m.write(v); return { returning: async () => [{ uuid: 'new' }] }; } }),
 update: () => ({ set: (v: any) => { m.write(v); return { where: async () => undefined }; } }),
 select: () => ({ from: () => ({ leftJoin: (_table: unknown, condition: any) => { m.joined(condition); return { where: () => ({ orderBy: async () => [], limit: async () => [] }) }; } }) }),
} }));
import { createCustomMcpServer, getCustomMcpServerByUuid,getCustomMcpServers, updateCustomMcpServer } from '@/app/actions/custom-mcp-servers';
beforeEach(() => { vi.clearAllMocks(); m.code.mockResolvedValue(undefined); });
it.each(['create', 'update'])('refuses a foreign code reference on %s', async (kind) => {
 const run = () => kind === 'create' ? createCustomMcpServer('profile', { name: 'test', code_uuid: 'code' }) : updateCustomMcpServer('profile', 'server', { code_uuid: 'code' });
 await expect(run()).rejects.toThrow(/code not found/i);
 expect(m.write).not.toHaveBeenCalled();
});
it('permits owned code and discards caller-supplied ownership fields', async () => {
 m.code.mockResolvedValue({ uuid: 'code' });
 await updateCustomMcpServer('profile', 'server', { name: 'test', code_uuid: 'code', profile_uuid: 'victim', uuid: 'victim-server' } as any);
 expect(new PgDialect().sqlToQuery(m.code.mock.calls[0][0].where).params).toEqual(['code', 'owner']);
 expect(m.write).toHaveBeenCalledWith(expect.objectContaining({ name: 'test', code_uuid: 'code' }));
 expect(m.write.mock.calls[0][0]).not.toHaveProperty('profile_uuid');
 expect(m.write.mock.calls[0][0]).not.toHaveProperty('uuid');
});
it('does not join historically poisoned code references from another owner', async () => {
 await getCustomMcpServers('profile'); await getCustomMcpServerByUuid('profile', 'server');
 expect(m.joined).toHaveBeenCalledTimes(2);
 for (const [condition] of m.joined.mock.calls) expect(new PgDialect().sqlToQuery(condition).params).toContain('owner');
});
