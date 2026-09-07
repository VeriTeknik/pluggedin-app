import { PgDialect } from 'drizzle-orm/pg-core';
import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ update: vi.fn(), active: vi.fn() }));
vi.mock('@/db', async () => {
 const { projectsTable } = await import('@/db/schema');
 return { db: {
  select: () => ({ from: (table: unknown) => {
   const chain: any = { innerJoin: () => chain, where: (where: any) => {
    if (table === projectsTable) return { limit: async () => [{ uuid: 'owned-project', active_profile_uuid: 'foreign-profile' }] };
    const params = new PgDialect().sqlToQuery(where).params;
    if (params.includes('foreign-profile')) {
     m.active(where);
     return { limit: async () => params.includes('owned-project') ? [] : [{ uuid: 'foreign-profile', userId: 'victim' }] };
    }
    return Promise.resolve([{ uuid: 'owned-profile', userId: 'owner' }]);
   } }; return chain;
  } }),
  update: () => ({ set: m.update }),
 } };
});
import { getProjectActiveProfileInternal } from '@/lib/active-profile-internal';
it('repairs a cross-project active reference instead of returning its user data', async () => {
 m.update.mockReturnValue({ where: async () => undefined });
 expect(await getProjectActiveProfileInternal('owned-project')).toEqual({ uuid: 'owned-profile', userId: 'owner' });
 expect(new PgDialect().sqlToQuery(m.active.mock.calls[0][0]).params).toEqual(['foreign-profile', 'owned-project']);
 expect(m.update).toHaveBeenCalledWith({ active_profile_uuid: 'owned-profile' });
});
