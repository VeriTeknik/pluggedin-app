/**
 * GHSA-fv94-f4f5-vr99 — reported by 0xParth.
 *
 * DELETE /api/profile/[profileId]/shared-servers/[serverId] authenticated the
 * caller but never checked that they owned the profile, so the delete ran
 * against whatever profileId the caller put in the path. The equivalent server
 * action (unshareServer) has always checked ownership; only the REST route
 * omitted it.
 *
 * Both identifiers are public: GET on the sibling route lists every public
 * share for a profile with its uuid and profile_uuid. So an attacker did not
 * have to guess anything — enumerate, then delete another tenant's shares.
 *
 * The invariant these tests hold: a caller who does not own the profile gets
 * 403 and the delete never runs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE } from '@/app/api/profile/[profileId]/shared-servers/[serverId]/route';
import { getAuthSession } from '@/lib/auth';
import { userOwnsProfile } from '@/lib/auth/profile-ownership';

// Factories, not automocks: lib/auth.ts builds the Auth.js Drizzle adapter at
// module scope, and automocking still imports the module to derive its shape.
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }));
vi.mock('@/lib/auth/profile-ownership', () => ({ userOwnsProfile: vi.fn() }));
vi.mock('@/db', () => ({ db: { delete: vi.fn() } }));

const { db } = await import('@/db');

const VICTIM_PROFILE = '11111111-1111-1111-1111-111111111111';
const VICTIM_SHARE = '22222222-2222-2222-2222-222222222222';

function request() {
  return new Request(
    `http://localhost/api/profile/${VICTIM_PROFILE}/shared-servers/${VICTIM_SHARE}`,
    { method: 'DELETE' }
  ) as never;
}

function params() {
  return { params: Promise.resolve({ profileId: VICTIM_PROFILE, serverId: VICTIM_SHARE }) };
}

/** A delete chain that would succeed, so a missing guard shows up as a 200. */
function armDeleteToSucceed() {
  const returning = vi.fn().mockResolvedValue([{ uuid: VICTIM_SHARE }]);
  vi.mocked(db).delete = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({ returning }),
  }) as never;
  return returning;
}

describe('DELETE /api/profile/[profileId]/shared-servers/[serverId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthSession).mockResolvedValue({ user: { id: 'attacker' } } as never);
  });

  it('refuses to delete a share on a profile the caller does not own', async () => {
    vi.mocked(userOwnsProfile).mockResolvedValue(false);
    const returning = armDeleteToSucceed();

    const response = await DELETE(request(), params());

    expect(response.status).toBe(403);
    expect(db.delete).not.toHaveBeenCalled();
    expect(returning).not.toHaveBeenCalled();
  });

  it('checks ownership against the caller and the path profile', async () => {
    vi.mocked(userOwnsProfile).mockResolvedValue(false);

    await DELETE(request(), params());

    expect(userOwnsProfile).toHaveBeenCalledWith('attacker', VICTIM_PROFILE);
  });

  it('still deletes for the profile owner', async () => {
    vi.mocked(userOwnsProfile).mockResolvedValue(true);
    armDeleteToSucceed();

    const response = await DELETE(request(), params());

    expect(response.status).toBe(200);
    expect(db.delete).toHaveBeenCalled();
  });

  it('rejects an unauthenticated caller before touching ownership or the database', async () => {
    vi.mocked(getAuthSession).mockResolvedValue(null as never);
    armDeleteToSucceed();

    const response = await DELETE(request(), params());

    expect(response.status).toBe(401);
    expect(userOwnsProfile).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });
});
