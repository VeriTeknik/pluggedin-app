import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db';
import {
  embeddedChatsTable,
  profilesTable,
  sharedCollectionsTable,
  sharedMcpServersTable,
} from '@/db/schema';
import { getAuthSession } from '@/lib/auth';

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
  shareMcpServer,
  isServerShared,
  shareCollection,
  unshareCollection,
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
/** Values passed to every insert/update in a test. */
let writtenValues: any[];

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
  writtenValues = [];

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
      values: vi.fn((v: any) => {
        writtenValues.push(v);
        return chain;
      }),
      set: vi.fn((v: any) => {
        writtenValues.push(v);
        return chain;
      }),
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
// Self-service writes that took a caller-supplied userId
// ---------------------------------------------------------------------------

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

  it('redirects an anonymous caller to login instead of swallowing it', async () => {
    signedInAs(null);
    profileOwnedBy(OWNER_ID);

    await expect(shareMcpServer(PROFILE_UUID, SERVER_UUID, 'title')).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    });
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


// ---------------------------------------------------------------------------
// #5 — collection and embedded-chat mutations
// ---------------------------------------------------------------------------
// updateSharedCollection, shareEmbeddedChat and updateEmbeddedChat were deleted
// along with the rest of the dead social surface — the guard they were checked
// for cannot regress on a function that no longer exists.
const MUTATIONS: Array<[string, () => Promise<{ success: boolean }>]> = [
  ['shareCollection', () => shareCollection(PROFILE_UUID, 'title', undefined, {}, true)],
  ['unshareCollection', () => unshareCollection(PROFILE_UUID, SHARED_UUID)],
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

  it('redirects an anonymous caller to login and writes nothing', async () => {
    signedInAs(null);
    profileOwnedBy(OWNER_ID);

    await expect(callAction()).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    });
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
