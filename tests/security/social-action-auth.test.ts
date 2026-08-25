import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  embeddedChatsTable,
  followersTable,
  profilesTable,
  sharedCollectionsTable,
  sharedMcpServersTable,
  users,
} from '@/db/schema';
import { db } from '@/db';
import { getAuthSession } from '@/lib/auth';
import { PUBLIC_USER_COLUMN_NAMES } from '@/lib/public-user';

vi.mock('@/db');
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(),
  authOptions: {},
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/app/actions/audit-logger', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/app/actions/notifications', () => ({ createNotification: vi.fn() }));
vi.mock('@/app/actions/mcp-servers', () => ({ createShareableTemplate: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ delete: vi.fn() })),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    const error: any = new Error('NEXT_REDIRECT');
    error.digest = 'NEXT_REDIRECT;replace;/login;307;';
    throw error;
  }),
}));

const {
  updateUserSocial,
  reserveUsername,
  getUserByUsername,
  searchUsers,
  getFollowers,
  getFollowing,
  shareMcpServer,
  getSharedMcpServer,
  getSharedMcpServers,
  isServerShared,
  shareCollection,
  updateSharedCollection,
  unshareCollection,
  shareEmbeddedChat,
  updateEmbeddedChat,
} = await import('@/app/actions/social');

const { createShareableTemplate } = vi.mocked(await import('@/app/actions/mcp-servers'));

const mockedDb = vi.mocked(db) as any;
const mockedGetAuthSession = vi.mocked(getAuthSession);

const OWNER_ID = 'owner-user-id';
const ATTACKER_ID = 'attacker-user-id';
const PROFILE_UUID = '11111111-1111-4111-8111-111111111111';
const SERVER_UUID = '22222222-2222-4222-8222-222222222222';
const SHARED_UUID = '33333333-3333-4333-8333-333333333333';
const OTHER_UUID = '44444444-4444-4444-8444-444444444444';

/** A full users row — what a bare `select({ user: users })` hands back. */
function fullUserRow(overrides: Record<string, any> = {}) {
  return {
    id: OWNER_ID,
    name: 'Victim',
    email: 'victim@example.com',
    password: '$2b$10$hashedpasswordhashedpassword',
    emailVerified: null,
    image: null,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    username: 'victim',
    bio: null,
    is_public: true,
    language: 'en',
    avatar_url: null,
    failed_login_attempts: 0,
    account_locked_until: null,
    last_login_at: null,
    last_login_ip: '203.0.113.9',
    password_changed_at: null,
    is_admin: false,
    requires_2fa: false,
    two_fa_secret: 'JBSWY3DPEHPK3PXP',
    two_fa_backup_codes: '["11111111"]',
    ...overrides,
  };
}

/** Results handed to `db.select(...).from(<table>)`, keyed by table. */
let selectResults: Map<unknown, any>;
/** Projections passed to every `db.select()` call in a test. */
let selectProjections: any[];
/** Arguments passed to the terminal `.limit()` of each select chain. */
let selectLimits: number[];

function signedInAs(userId: string | null) {
  mockedGetAuthSession.mockResolvedValue(
    userId ? ({ user: { id: userId }, expires: '2099-01-01' } as any) : null
  );
}

/** Makes `withProfileAuth(PROFILE_UUID, …)` succeed for `ownerId`. */
function profileOwnedBy(ownerId: string) {
  selectResults.set(profilesTable, [
    {
      profile: { uuid: PROFILE_UUID, project_uuid: 'project-1' },
      project: { uuid: 'project-1', user_id: ownerId },
    },
  ]);
  mockedDb.query.profilesTable.findFirst.mockResolvedValue({
    uuid: PROFILE_UUID,
    project_uuid: 'project-1',
    project: { uuid: 'project-1', user_id: ownerId },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  selectResults = new Map();
  selectProjections = [];
  selectLimits = [];

  mockedDb.query = {
    users: {
      // withAuth re-checks the session user exists; it asks for `id` only.
      findFirst: vi.fn(async (args: any) => {
        if (typeof args?.where === 'function') {
          const session = await mockedGetAuthSession();
          return session?.user?.id ? { id: session.user.id } : null;
        }
        return null;
      }),
      findMany: vi.fn(),
    },
    projectsTable: { findFirst: vi.fn(), findMany: vi.fn() },
    profilesTable: { findFirst: vi.fn(), findMany: vi.fn() },
    mcpServersTable: { findFirst: vi.fn(), findMany: vi.fn() },
    sharedMcpServersTable: { findFirst: vi.fn(), findMany: vi.fn() },
    sharedCollectionsTable: { findFirst: vi.fn(), findMany: vi.fn() },
    embeddedChatsTable: { findFirst: vi.fn(), findMany: vi.fn() },
    followersTable: { findFirst: vi.fn(), findMany: vi.fn() },
  };

  mockedDb.select = vi.fn((projection: any) => {
    selectProjections.push(projection);
    let table: unknown;
    const chain: any = {
      from: vi.fn((t: unknown) => {
        table = t;
        return chain;
      }),
      where: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn((n: number) => {
        selectLimits.push(n);
        return chain;
      }),
      then: (resolve: any, reject: any) =>
        Promise.resolve(selectResults.get(table) ?? []).then(resolve, reject),
    };
    return chain;
  });

  const writeChain = (result: any = []) => {
    const chain: any = {
      values: vi.fn(() => chain),
      set: vi.fn(() => chain),
      where: vi.fn(() => chain),
      returning: vi.fn(() => Promise.resolve(result)),
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  };

  mockedDb.insert = vi.fn(() => writeChain([{ uuid: SHARED_UUID }]));
  mockedDb.update = vi.fn(() => writeChain([{ uuid: SHARED_UUID }]));
  mockedDb.delete = vi.fn(() => writeChain());
});

// ---------------------------------------------------------------------------
// #2 — getUserByUsername
// ---------------------------------------------------------------------------
describe('getUserByUsername visibility', () => {
  it('returns a public profile to an anonymous visitor', async () => {
    signedInAs(null);
    mockedDb.query.users.findFirst.mockResolvedValue(fullUserRow({ is_public: true }));

    const result = await getUserByUsername('victim');

    expect(result?.username).toBe('victim');
  });

  it('does not return a private profile to a logged-in non-owner', async () => {
    signedInAs(ATTACKER_ID);
    mockedDb.query.users.findFirst.mockResolvedValue(fullUserRow({ is_public: false }));

    const result = await getUserByUsername('victim');

    expect(result).toBeNull();
  });

  it('returns a private profile to its owner', async () => {
    signedInAs(OWNER_ID);
    mockedDb.query.users.findFirst.mockResolvedValue(fullUserRow({ is_public: false }));

    const result = await getUserByUsername('victim');

    expect(result?.id).toBe(OWNER_ID);
  });

  it('asks the database only for public columns', async () => {
    signedInAs(null);
    mockedDb.query.users.findFirst.mockResolvedValue(fullUserRow());

    await getUserByUsername('victim');

    const call = mockedDb.query.users.findFirst.mock.calls.at(-1)?.[0];
    expect(Object.keys(call.columns).sort()).toEqual([...PUBLIC_USER_COLUMN_NAMES].sort());
  });

  it('strips auth columns even if the row arrives wide', async () => {
    signedInAs(null);
    mockedDb.query.users.findFirst.mockResolvedValue(fullUserRow());

    const serialized = JSON.stringify(await getUserByUsername('victim'));

    expect(serialized).not.toContain('hashedpassword');
    expect(serialized).not.toContain('JBSWY3DPEHPK3PXP');
    expect(serialized).not.toContain('victim@example.com');
  });
});

// ---------------------------------------------------------------------------
// Self-service writes that took a caller-supplied userId
// ---------------------------------------------------------------------------
describe('updateUserSocial identity', () => {
  beforeEach(() => {
    mockedDb.update = vi.fn(() => {
      const chain: any = {
        set: vi.fn(() => chain),
        where: vi.fn(() => chain),
        returning: vi.fn(() => Promise.resolve([fullUserRow()])),
      };
      return chain;
    });
  });

  it('refuses an anonymous caller', async () => {
    signedInAs(null);

    const result = await updateUserSocial(OWNER_ID, { is_public: true });

    expect(result.success).toBe(false);
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it('refuses to write to another user', async () => {
    signedInAs(ATTACKER_ID);

    const result = await updateUserSocial(OWNER_ID, { is_public: true });

    expect(result.success).toBe(false);
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it('lets a user update themselves', async () => {
    signedInAs(OWNER_ID);

    const result = await updateUserSocial(OWNER_ID, { is_public: true });

    expect(result.success).toBe(true);
    expect(mockedDb.update).toHaveBeenCalled();
  });

  it('returns no auth columns to the user it updated', async () => {
    signedInAs(OWNER_ID);

    const serialized = JSON.stringify(await updateUserSocial(OWNER_ID, { is_public: true }));

    expect(serialized).not.toContain('hashedpassword');
    expect(serialized).not.toContain('JBSWY3DPEHPK3PXP');
    expect(serialized).not.toContain('victim@example.com');
  });
});

describe('reserveUsername identity', () => {
  /** The user exists, and the username they are asking for is unclaimed. */
  function usernameIsFree(userId: string) {
    mockedDb.query.users.findFirst.mockImplementation(async (args: any) => {
      // withAuth's session probe passes a callback as `where`.
      if (typeof args?.where === 'function') {
        const session = await mockedGetAuthSession();
        return session?.user?.id ? { id: session.user.id } : null;
      }
      // The availability check narrows to `id`; nobody holds the name.
      if (args?.columns) {
        return null;
      }
      // The existence check: this user is real.
      return fullUserRow({ id: userId });
    });
  }

  beforeEach(() => {
    mockedDb.update = vi.fn(() => {
      const chain: any = {
        set: vi.fn(() => chain),
        where: vi.fn(() => chain),
        returning: vi.fn(() => Promise.resolve([fullUserRow({ username: 'newname' })])),
      };
      return chain;
    });
  });

  it('refuses an anonymous caller even when the username is free', async () => {
    signedInAs(null);
    usernameIsFree(OWNER_ID);

    const result = await reserveUsername(OWNER_ID, 'newname');

    expect(result.success).toBe(false);
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it('refuses to claim a username for another user', async () => {
    signedInAs(ATTACKER_ID);
    usernameIsFree(OWNER_ID);

    const result = await reserveUsername(OWNER_ID, 'newname');

    expect(result.success).toBe(false);
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it('lets a user claim their own username', async () => {
    signedInAs(OWNER_ID);
    usernameIsFree(OWNER_ID);

    const result = await reserveUsername(OWNER_ID, 'newname');

    expect(result.success).toBe(true);
    expect(mockedDb.update).toHaveBeenCalled();
  });

  it('returns no auth columns on success', async () => {
    signedInAs(OWNER_ID);
    usernameIsFree(OWNER_ID);

    const serialized = JSON.stringify(await reserveUsername(OWNER_ID, 'newname'));

    expect(serialized).not.toContain('hashedpassword');
    expect(serialized).not.toContain('JBSWY3DPEHPK3PXP');
    expect(serialized).not.toContain('victim@example.com');
  });
});

// ---------------------------------------------------------------------------
// #1 — getFollowers / getFollowing
// ---------------------------------------------------------------------------
describe.each([
  ['getFollowers', (...args: any[]) => (getFollowers as any)(...args)],
  ['getFollowing', (...args: any[]) => (getFollowing as any)(...args)],
])('%s column projection and visibility', (_name, callAction) => {
  function targetUser(overrides: Record<string, any> = {}) {
    mockedDb.query.users.findFirst.mockImplementation(async (args: any) => {
      if (typeof args?.where === 'function') {
        const session = await mockedGetAuthSession();
        return session?.user?.id ? { id: session.user.id } : null;
      }
      return fullUserRow(overrides);
    });
  }

  it('never selects the whole users table', async () => {
    signedInAs(null);
    targetUser({ is_public: true });
    selectResults.set(followersTable, []);

    await callAction(OWNER_ID);

    const joinProjection = selectProjections.find((p) => p && !('profile' in p));
    expect(Object.values(joinProjection ?? {})).not.toContain(users);
    expect(Object.keys(joinProjection ?? {}).sort()).toEqual(
      [...PUBLIC_USER_COLUMN_NAMES].sort()
    );
  });

  it('serves a public user\'s list to an anonymous visitor', async () => {
    signedInAs(null);
    targetUser({ is_public: true });
    selectResults.set(followersTable, [
      { id: 'f1', username: 'follower', name: null, bio: null, avatar_url: null, image: null, is_public: true, created_at: new Date() },
    ]);

    const result = await callAction(OWNER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].username).toBe('follower');
  });

  it('withholds a private user\'s list from a non-owner', async () => {
    signedInAs(ATTACKER_ID);
    targetUser({ is_public: false });
    selectResults.set(followersTable, [fullUserRow({ id: 'f1' })]);

    const result = await callAction(OWNER_ID);

    expect(result).toEqual([]);
  });

  it('serves a private user\'s list to the owner', async () => {
    signedInAs(OWNER_ID);
    targetUser({ is_public: false });
    selectResults.set(followersTable, [
      { id: 'f1', username: 'follower', name: null, bio: null, avatar_url: null, image: null, is_public: true, created_at: new Date() },
    ]);

    const result = await callAction(OWNER_ID);

    expect(result).toHaveLength(1);
  });

  it('clamps a caller-supplied limit', async () => {
    signedInAs(null);
    targetUser({ is_public: true });
    selectResults.set(followersTable, []);

    await callAction(OWNER_ID, 100000);

    expect(Math.max(...selectLimits)).toBeLessThanOrEqual(100);
  });

  it('leaks no secret even if the driver returns wide rows', async () => {
    signedInAs(null);
    targetUser({ is_public: true });
    selectResults.set(followersTable, [fullUserRow({ id: 'f1' })]);

    const serialized = JSON.stringify(await callAction(OWNER_ID));

    expect(serialized).not.toContain('hashedpassword');
    expect(serialized).not.toContain('JBSWY3DPEHPK3PXP');
    expect(serialized).not.toContain('victim@example.com');
  });
});

describe('searchUsers column projection', () => {
  it('never selects the whole users table', async () => {
    selectResults.set(users, []);

    await searchUsers('vic');

    expect(Object.values(selectProjections[0] ?? {})).not.toContain(users);
    expect(Object.keys(selectProjections[0] ?? {}).sort()).toEqual(
      [...PUBLIC_USER_COLUMN_NAMES].sort()
    );
  });
});

// ---------------------------------------------------------------------------
// #3 — MCP server sharing
// ---------------------------------------------------------------------------
describe('shareMcpServer ownership', () => {
  beforeEach(() => {
    createShareableTemplate.mockResolvedValue({ name: 'srv', type: 'STDIO' });
    mockedDb.query.mcpServersTable.findFirst.mockResolvedValue({
      uuid: SERVER_UUID,
      profile_uuid: PROFILE_UUID,
      name: 'srv',
      config: null,
    });
    mockedDb.query.sharedMcpServersTable.findFirst.mockResolvedValue(null);
  });

  it('refuses an anonymous caller', async () => {
    signedInAs(null);
    profileOwnedBy(OWNER_ID);

    const result = await shareMcpServer(PROFILE_UUID, SERVER_UUID, 'title');

    expect(result.success).toBe(false);
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('refuses a caller who does not own the profile', async () => {
    signedInAs(ATTACKER_ID);
    profileOwnedBy(OWNER_ID);

    const result = await shareMcpServer(PROFILE_UUID, SERVER_UUID, 'title');

    expect(result.success).toBe(false);
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('refuses a server that lives under another profile', async () => {
    signedInAs(OWNER_ID);
    profileOwnedBy(OWNER_ID);
    mockedDb.query.mcpServersTable.findFirst.mockResolvedValue({
      uuid: SERVER_UUID,
      profile_uuid: OTHER_UUID,
      name: 'victim-server',
      config: null,
    });

    const result = await shareMcpServer(PROFILE_UUID, SERVER_UUID, 'title');

    expect(result.success).toBe(false);
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('lets the owner share their own server', async () => {
    signedInAs(OWNER_ID);
    profileOwnedBy(OWNER_ID);

    const result = await shareMcpServer(PROFILE_UUID, SERVER_UUID, 'title');

    expect(result.success).toBe(true);
    expect(mockedDb.insert).toHaveBeenCalled();
  });
});

describe('shared MCP server read paths', () => {
  it('getSharedMcpServers ignores includePrivate for a non-owner', async () => {
    signedInAs(ATTACKER_ID);
    profileOwnedBy(OWNER_ID);
    mockedDb.query.sharedMcpServersTable.findMany.mockResolvedValue([]);

    await getSharedMcpServers(PROFILE_UUID, 10, true);

    const call = mockedDb.query.sharedMcpServersTable.findMany.mock.calls.at(-1)?.[0];
    expect(call.where).toEqual(
      and(
        eq(sharedMcpServersTable.profile_uuid, PROFILE_UUID),
        eq(sharedMcpServersTable.is_public, true)
      )
    );
  });

  it('getSharedMcpServers honours includePrivate for the owner', async () => {
    signedInAs(OWNER_ID);
    profileOwnedBy(OWNER_ID);
    mockedDb.query.sharedMcpServersTable.findMany.mockResolvedValue([]);

    await getSharedMcpServers(PROFILE_UUID, 10, true);

    const call = mockedDb.query.sharedMcpServersTable.findMany.mock.calls.at(-1)?.[0];
    expect(call.where).toEqual(eq(sharedMcpServersTable.profile_uuid, PROFILE_UUID));
  });

  it('getSharedMcpServer withholds a private share from a non-owner', async () => {
    signedInAs(ATTACKER_ID);
    profileOwnedBy(OWNER_ID);
    mockedDb.query.sharedMcpServersTable.findFirst.mockResolvedValue({
      uuid: SHARED_UUID,
      profile_uuid: PROFILE_UUID,
      server_uuid: SERVER_UUID,
      title: 'secret',
      description: null,
      is_public: false,
      template: { env: { API_KEY: 'sk-live-secret' } },
      created_at: new Date(),
      updated_at: new Date(),
      server: null,
      profile: { name: 'p', uuid: PROFILE_UUID, project: { user: { username: 'victim', email: 'victim@example.com', name: 'Victim' } } },
    });

    const result = await getSharedMcpServer(SHARED_UUID);

    expect(result).toBeNull();
  });

  it('getSharedMcpServer never returns the owner email', async () => {
    signedInAs(null);
    mockedDb.query.sharedMcpServersTable.findFirst.mockResolvedValue({
      uuid: SHARED_UUID,
      profile_uuid: PROFILE_UUID,
      server_uuid: SERVER_UUID,
      title: 'public share',
      description: null,
      is_public: true,
      template: {},
      created_at: new Date(),
      updated_at: new Date(),
      server: null,
      profile: { name: 'p', uuid: PROFILE_UUID, project: { user: { username: null, email: 'victim@example.com', name: 'Victim' } } },
    });

    const serialized = JSON.stringify(await getSharedMcpServer(SHARED_UUID));

    expect(serialized).not.toContain('victim@example.com');
  });

  it('isServerShared returns nothing to a caller who does not own the profile', async () => {
    signedInAs(ATTACKER_ID);
    profileOwnedBy(OWNER_ID);
    mockedDb.query.sharedMcpServersTable.findFirst.mockResolvedValue({
      uuid: SHARED_UUID,
      profile_uuid: PROFILE_UUID,
      server_uuid: SERVER_UUID,
      title: 'secret',
      is_public: false,
      template: { env: { API_KEY: 'sk-live-secret' } },
    });

    const result = await isServerShared(PROFILE_UUID, SERVER_UUID);

    expect(result.isShared).toBe(false);
    expect(JSON.stringify(result)).not.toContain('sk-live-secret');
  });

  it('isServerShared never hands back the raw template to the owner either', async () => {
    signedInAs(OWNER_ID);
    profileOwnedBy(OWNER_ID);
    mockedDb.query.sharedMcpServersTable.findFirst.mockResolvedValue({
      uuid: SHARED_UUID,
      profile_uuid: PROFILE_UUID,
      server_uuid: SERVER_UUID,
      title: 'mine',
      description: null,
      is_public: true,
      template: { env: { API_KEY: 'sk-live-secret' } },
    });

    const result = await isServerShared(PROFILE_UUID, SERVER_UUID);

    expect(result.isShared).toBe(true);
    expect(result.server).not.toHaveProperty('template');
  });
});

// ---------------------------------------------------------------------------
// #5 — collection and embedded-chat mutations
// ---------------------------------------------------------------------------
const MUTATIONS: Array<[string, () => Promise<{ success: boolean }>]> = [
  ['shareCollection', () => shareCollection(PROFILE_UUID, 'title', undefined, {}, true)],
  ['updateSharedCollection', () => updateSharedCollection(PROFILE_UUID, SHARED_UUID, { title: 'x' })],
  ['unshareCollection', () => unshareCollection(PROFILE_UUID, SHARED_UUID)],
  ['shareEmbeddedChat', () => shareEmbeddedChat(PROFILE_UUID, 'title', undefined, {}, true)],
  ['updateEmbeddedChat', () => updateEmbeddedChat(PROFILE_UUID, SHARED_UUID, { title: 'x' })],
];

describe.each(MUTATIONS)('%s profile ownership', (_name, callAction) => {
  beforeEach(() => {
    mockedDb.query.sharedCollectionsTable.findFirst.mockResolvedValue({
      uuid: SHARED_UUID,
      profile_uuid: PROFILE_UUID,
      title: 'existing',
    });
    mockedDb.query.embeddedChatsTable.findFirst.mockResolvedValue({
      uuid: SHARED_UUID,
      profile_uuid: PROFILE_UUID,
      title: 'existing',
    });
  });

  it('refuses an anonymous caller and writes nothing', async () => {
    signedInAs(null);
    profileOwnedBy(OWNER_ID);

    const result = await callAction();

    expect(result.success).toBe(false);
    expect(mockedDb.insert).not.toHaveBeenCalled();
    expect(mockedDb.update).not.toHaveBeenCalled();
    expect(mockedDb.delete).not.toHaveBeenCalled();
  });

  it('refuses a caller who does not own the supplied profile', async () => {
    signedInAs(ATTACKER_ID);
    profileOwnedBy(OWNER_ID);

    const result = await callAction();

    expect(result.success).toBe(false);
    expect(mockedDb.insert).not.toHaveBeenCalled();
    expect(mockedDb.update).not.toHaveBeenCalled();
    expect(mockedDb.delete).not.toHaveBeenCalled();
  });

  it('allows the profile owner', async () => {
    signedInAs(OWNER_ID);
    profileOwnedBy(OWNER_ID);

    const result = await callAction();

    expect(result.success).toBe(true);
  });
});

// Keep the table imports meaningful to the reader / linter.
void [sharedCollectionsTable, sharedMcpServersTable, embeddedChatsTable];
