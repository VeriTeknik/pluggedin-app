import { beforeEach, describe, expect, it, vi } from 'vitest';

const findFirst = vi.fn();
const profileFindFirst = vi.fn();
const getAuthSession = vi.fn(async () => null as unknown);

vi.mock('@/db', () => ({
  db: {
    query: {
      sharedCollectionsTable: { findFirst },
      profilesTable: { findFirst: profileFindFirst },
    },
  },
}));
vi.mock('@/lib/auth', () => ({ getAuthSession }));

const PRIVATE = {
  uuid: 'c1',
  is_public: false,
  profile_uuid: 'profile-1',
  title: 'private',
  content: { servers: [{ name: 'gh', env: { GH_PAT: 'ghp_live' } }] },
  profile: { project: { user: { id: 'owner', name: 'Owner', username: 'owner' } } },
};

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue(PRIVATE);
  getAuthSession.mockResolvedValue(null);
  // The profile behind the collection belongs to `owner`.
  profileFindFirst.mockResolvedValue({ uuid: 'profile-1', project: { user_id: 'owner' } });
});

/**
 * Gating getSharedCollection on is_public alone locked owners out of their own
 * private collections: /collections/[uuid] calls it with no authorization
 * context and renders notFound() on null.
 */
describe('getSharedCollection and private collections', () => {
  it('hides a private collection from an anonymous visitor', async () => {
    const { getSharedCollection } = await import('@/app/actions/social');

    expect(await getSharedCollection('c1')).toBeNull();
  });

  it('hides a private collection from a signed-in non-owner', async () => {
    getAuthSession.mockResolvedValue({ user: { id: 'someone-else' } });
    const { getSharedCollection } = await import('@/app/actions/social');

    expect(await getSharedCollection('c1')).toBeNull();
  });

  it('still shows a private collection to its owner', async () => {
    getAuthSession.mockResolvedValue({ user: { id: 'owner' } });
    const { getSharedCollection } = await import('@/app/actions/social');

    const collection = await getSharedCollection('c1');

    expect(collection).not.toBeNull();
    expect(collection!.title).toBe('private');
  });

  it('sanitizes the content it shows the owner', async () => {
    getAuthSession.mockResolvedValue({ user: { id: 'owner' } });
    const { getSharedCollection } = await import('@/app/actions/social');

    const collection = await getSharedCollection('c1');

    expect(JSON.stringify(collection)).not.toContain('ghp_live');
  });
});
