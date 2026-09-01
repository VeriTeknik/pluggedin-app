import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db');
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn(async () => null), authOptions: {} }));

const { db } = await import('@/db');
const { PUBLIC_USER_COLUMN_NAMES } = await import('@/lib/public-user');
const { GET } = await import('@/app/api/search/users/route');

const mockedDb = vi.mocked(db) as any;

/** A full users row, as findMany returns it without a `columns` restriction. */
const fullRow = {
  id: 'u1',
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
  is_admin: true,
  requires_2fa: false,
  two_fa_secret: 'JBSWY3DPEHPK3PXP',
  two_fa_backup_codes: '["11111111"]',
};

function request(q: string) {
  return { nextUrl: new URL(`https://plugged.in/api/search/users?q=${q}`) } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedDb.query = { users: { findMany: vi.fn(async () => [fullRow]) } };
});

describe('GET /api/search/users', () => {
  it('asks the database only for public columns', async () => {
    await GET(request('vi'));

    const call = mockedDb.query.users.findMany.mock.calls.at(-1)?.[0];
    expect(call?.columns).toBeDefined();
    expect(Object.keys(call.columns).sort()).toEqual([...PUBLIC_USER_COLUMN_NAMES].sort());
  });

  it('returns no auth columns even when the driver hands back a wide row', async () => {
    const body = await (await GET(request('vi'))).json();

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('hashedpassword');
    expect(serialized).not.toContain('JBSWY3DPEHPK3PXP');
    expect(serialized).not.toContain('victim@example.com');
    expect(serialized).not.toContain('203.0.113.9');
    for (const field of ['password', 'two_fa_secret', 'two_fa_backup_codes', 'email', 'is_admin', 'last_login_ip']) {
      expect(body[0]).not.toHaveProperty(field);
    }
  });

  it('still returns the public fields a search result needs', async () => {
    const body = await (await GET(request('vi'))).json();

    expect(body[0].id).toBe('u1');
    expect(body[0].username).toBe('victim');
    expect(body[0].name).toBe('Victim');
  });

  it('still rejects a too-short query', async () => {
    expect((await GET(request('a'))).status).toBe(400);
  });
});
