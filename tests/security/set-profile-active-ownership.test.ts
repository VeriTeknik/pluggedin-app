/**
 * A Hub's active profile must belong to that Hub.
 *
 * `setProfileActive(projectUuid, profileUuid)` ran under `withProjectAuth`, so
 * the caller had to own the *project*. Nothing checked the *profile*. The
 * foreign key points at `profiles.uuid` and accepts any row, so a caller could
 * set their own Hub's `active_profile_uuid` to another tenant's profile.
 *
 * That is not cosmetic: `app/actions/registry-servers.ts` resolves the working
 * profile as `activeProject.active_profile_uuid` and acts on it. Pointing your
 * own Hub at someone else's profile shifts which profile your authenticated
 * calls operate on.
 *
 * Found by the 2026-09-06 re-scan; confirmed by reading the action and the
 * consumer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.fn();
const setSpy = vi.fn();

vi.mock('@/lib/auth-helpers', () => ({
  withProjectAuth: (_p: string, fn: (s: unknown, project: unknown) => unknown) =>
    fn({ user: { id: 'owner' } }, { uuid: 'project-1', user_id: 'owner' }),
  withProfileAuth: (_p: string, fn: (s: unknown) => unknown) => fn({ user: { id: 'owner' } }),
  withAuth: (fn: (s: unknown) => unknown) => fn({ user: { id: 'owner' } }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// profiles.ts pulls in lib/auth transitively, which builds the Auth.js Drizzle
// adapter at module scope against the mocked db.
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn(), authOptions: {} }));
vi.mock('@/db', () => ({
  db: {
    query: { profilesTable: { findFirst: (...a: unknown[]) => findFirst(...a) } },
    update: () => ({
      set: (v: unknown) => {
        setSpy(v);
        return { where: () => ({ returning: async () => [{ uuid: 'project-1' }] }) };
      },
    }),
  },
}));

const { setProfileActive } = await import('@/app/actions/profiles');

const PROJECT = '11111111-1111-1111-1111-111111111111';
const OWN_PROFILE = '22222222-2222-2222-2222-222222222222';
const OTHER_PROFILE = '33333333-3333-3333-3333-333333333333';

describe('setProfileActive', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses a profile that belongs to another project', async () => {
    findFirst.mockResolvedValue({ uuid: OTHER_PROFILE, project_uuid: 'someone-elses-project' });

    await expect(setProfileActive(PROJECT, OTHER_PROFILE)).rejects.toThrow();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('refuses a profile that does not exist', async () => {
    findFirst.mockResolvedValue(undefined);

    await expect(setProfileActive(PROJECT, OTHER_PROFILE)).rejects.toThrow();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('allows a profile that belongs to the project', async () => {
    findFirst.mockResolvedValue({ uuid: OWN_PROFILE, project_uuid: PROJECT });

    await setProfileActive(PROJECT, OWN_PROFILE);

    expect(setSpy).toHaveBeenCalledWith({ active_profile_uuid: OWN_PROFILE });
  });
});
