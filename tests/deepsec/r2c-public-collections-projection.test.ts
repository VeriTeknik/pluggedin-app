/**
 * GET /api/collections and GET /api/user/[username]/collections are
 * unauthenticated. They loaded every public collection with its full profile
 * row, the profile's full project row (uuid, user_id, active_profile_uuid)
 * and, on /api/collections, the owner's user id — and returned all of it.
 *
 * Both now select, and return, what the already-fixed
 * /api/profile/[profileId]/shared-collections returns: the profile's uuid and
 * name, plus the owner's display fields (name, username).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();

vi.mock('@/db', () => ({
  db: { query: { sharedCollectionsTable: { findMany } } },
}));

const SENTINELS = [
  'SENTINEL-PROJECT-UUID',
  'SENTINEL-USER-ID',
  'SENTINEL-ACTIVE-PROFILE',
  'SENTINEL-PROFILE-FIELD',
  'sentinel@example.com',
  'SENTINEL-USER-FIELD',
];

function row(username: string) {
  return {
    uuid: `c-${username}`,
    profile_uuid: 'profile-1',
    title: 'Collection',
    description: 'd',
    content: { servers: [] },
    is_public: true,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    profile: {
      uuid: 'profile-1',
      name: 'Default',
      project_uuid: 'SENTINEL-PROJECT-UUID',
      language: 'SENTINEL-PROFILE-FIELD',
      project: {
        uuid: 'SENTINEL-PROJECT-UUID',
        user_id: 'SENTINEL-USER-ID',
        active_profile_uuid: 'SENTINEL-ACTIVE-PROFILE',
        user: {
          id: 'SENTINEL-USER-ID',
          name: 'Someone',
          username,
          email: 'sentinel@example.com',
          bio: 'SENTINEL-USER-FIELD',
        },
      },
    },
  };
}

type WithConfig = {
  with: {
    profile: {
      columns?: Record<string, boolean>;
      with: { project: { columns?: Record<string, boolean>; with: { user: { columns?: Record<string, boolean> } } } };
    };
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([row('someone'), row('other')]);
});

async function listAll() {
  const { GET } = await import('@/app/api/collections/route');
  return GET();
}

async function listForUser(username: string) {
  const { GET } = await import('@/app/api/user/[username]/collections/route');
  return GET({} as never, { params: Promise.resolve({ username }) } as never);
}

describe.each([
  ['GET /api/collections', () => listAll()],
  ['GET /api/user/[username]/collections', () => listForUser('someone')],
])('%s', (_name, call) => {
  it('returns no project, user id or other internal profile/user field', async () => {
    const body = await (await call()).text();

    for (const sentinel of SENTINELS) {
      expect(body).not.toContain(sentinel);
    }
  });

  it('returns the profile uuid and name and the owner’s display fields', async () => {
    const [first] = await (await call()).json();

    expect(first.profile).toEqual({
      uuid: 'profile-1',
      name: 'Default',
      project: { user: { name: 'Someone', username: 'someone' } },
    });
    expect(first.title).toBe('Collection');
  });

  it('selects only those columns from the relations', async () => {
    await call();

    const config = findMany.mock.calls[0][0] as WithConfig;
    expect(config.with.profile.columns).toEqual({ uuid: true, name: true });
    expect(config.with.profile.with.project.columns).toEqual({});
    expect(config.with.profile.with.project.with.user.columns).toEqual({ name: true, username: true });
  });
});

it('GET /api/user/[username]/collections still filters by username', async () => {
  const items = await (await listForUser('other')).json();

  expect(items).toHaveLength(1);
  expect(items[0].profile.project.user.username).toBe('other');
});
