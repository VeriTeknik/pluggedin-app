import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PUBLIC_USER_COLUMNS } from '@/lib/public-user';

const findFirst = vi.fn();
const findMany = vi.fn();

vi.mock('@/db', () => ({
  db: { query: { sharedMcpServersTable: { findFirst, findMany } } },
}));
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn(async () => null) }));
vi.mock('@/lib/registry/pluggedin-registry-client', () => ({ PluggedinRegistryClient: class {} }));
vi.mock('./registry-servers', () => ({ verifyGitHubOwnership: vi.fn() }));

const { getCommunityServer, getClaimableCommunityServers } = await import(
  '@/app/actions/community-servers'
);

/** A row as Drizzle returns it when the relation is left unrestricted. */
const rowWithFullOwner = (isPublic: boolean) => ({
  uuid: 'share-uuid',
  is_public: isPublic,
  template: {},
  profile: {
    project: {
      user: {
        id: 'owner',
        username: 'owner',
        password: '$2b$10$hash',
        two_fa_secret: 'JBSWY3DPEHPK3PXP',
        two_fa_backup_codes: ['a', 'b'],
        email: 'owner@example.com',
      },
    },
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue(rowWithFullOwner(true));
  findMany.mockResolvedValue([rowWithFullOwner(true)]);
});

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

describe('the users relation is never pulled in whole', () => {
  /**
   * Drizzle's relational API selects every column of a related table when it
   * is given `true`. `users` is also the auth table — password hash,
   * two_fa_secret, two_fa_backup_codes, last_login_ip — so `user: true` inside
   * a `with:` block ships all of that to whatever returns the row. Two of the
   * actions doing it were unauthenticated, one of them a bulk listing.
   */
  it('has no unrestricted `user: true` include anywhere', () => {
    const offenders = ['app', 'lib']
      .flatMap((dir) => walk(dir))
      .filter((file) => /\buser:\s*true\b/.test(fs.readFileSync(file, 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('asks for only the public columns of the owner', async () => {
    await getCommunityServer('share-uuid');

    const arg = findFirst.mock.calls[0][0];
    expect(arg.with.profile.with.project.with.user.columns).toEqual(PUBLIC_USER_COLUMNS);
  });

  it('asks for only the public columns in the claimable listing', async () => {
    await getClaimableCommunityServers();

    const arg = findMany.mock.calls[0][0];
    expect(arg.with.profile.with.project.with.user.columns).toEqual(PUBLIC_USER_COLUMNS);
  });
});

describe('getCommunityServer does not serve private shares', () => {
  /**
   * The lookup was by uuid alone, with no `is_public` condition, so a share
   * that had been deliberately kept private was readable — template included —
   * by anyone holding its uuid.
   */
  it('refuses a share that is not public', async () => {
    findFirst.mockResolvedValue(rowWithFullOwner(false));

    const result = await getCommunityServer('share-uuid');

    expect(result.success).toBe(false);
    expect((result as { server?: unknown }).server).toBeUndefined();
  });

  it('still serves a public share', async () => {
    const result = await getCommunityServer('share-uuid');

    expect(result.success).toBe(true);
  });
});
