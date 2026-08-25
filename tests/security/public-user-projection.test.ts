import { describe, expect, it } from 'vitest';

import {
  PUBLIC_USER_COLUMNS,
  PUBLIC_USER_COLUMN_NAMES,
  publicUserSelection,
  toPublicUser,
} from '@/lib/public-user';

/**
 * The `users` table doubles as the auth table: it holds `password`,
 * `two_fa_secret`, `two_fa_backup_codes`, `last_login_ip` and `email`.
 * Anything that renders a profile, a follower list or a search result must go
 * through this projection, never through the whole row.
 */
const FORBIDDEN_COLUMNS = [
  'password',
  'two_fa_secret',
  'two_fa_backup_codes',
  'last_login_ip',
  'email',
  'emailVerified',
  'failed_login_attempts',
  'account_locked_until',
  'password_changed_at',
  'last_login_at',
  'is_admin',
  'requires_2fa',
];

/** A full `users` row, as `db.select({ user: users })` would hand it back. */
const fullUserRow = {
  id: 'user-1',
  name: 'Test User',
  email: 'victim@example.com',
  password: '$2b$10$hashedpasswordhashedpassword',
  emailVerified: new Date('2026-01-01'),
  image: 'https://example.com/i.png',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-02'),
  username: 'victim',
  bio: 'hello',
  is_public: true,
  language: 'en',
  avatar_url: 'https://example.com/a.png',
  failed_login_attempts: 3,
  account_locked_until: null,
  last_login_at: new Date('2026-02-01'),
  last_login_ip: '203.0.113.9',
  password_changed_at: new Date('2026-01-15'),
  is_admin: true,
  requires_2fa: true,
  two_fa_secret: 'JBSWY3DPEHPK3PXP',
  two_fa_backup_codes: '["11111111","22222222"]',
};

describe('public user projection', () => {
  it('never lists an auth column as publicly selectable', () => {
    for (const column of FORBIDDEN_COLUMNS) {
      expect(PUBLIC_USER_COLUMN_NAMES).not.toContain(column);
    }
  });

  it('exposes the fields the public profile and follower pages render', () => {
    for (const column of ['id', 'username', 'name', 'bio', 'avatar_url', 'image', 'is_public']) {
      expect(PUBLIC_USER_COLUMN_NAMES).toContain(column);
    }
  });

  it('keeps the drizzle column map and the select projection in step with the name list', () => {
    expect(Object.keys(PUBLIC_USER_COLUMNS).sort()).toEqual([...PUBLIC_USER_COLUMN_NAMES].sort());
    expect(Object.keys(publicUserSelection).sort()).toEqual([...PUBLIC_USER_COLUMN_NAMES].sort());
    expect(Object.values(PUBLIC_USER_COLUMNS).every((v) => v === true)).toBe(true);
  });

  it('drops every auth field when narrowing a full users row', () => {
    const publicUser = toPublicUser(fullUserRow);

    for (const column of FORBIDDEN_COLUMNS) {
      expect(publicUser).not.toHaveProperty(column);
    }
    expect(Object.keys(publicUser).sort()).toEqual([...PUBLIC_USER_COLUMN_NAMES].sort());
  });

  it('leaks no secret value through serialization', () => {
    const serialized = JSON.stringify(toPublicUser(fullUserRow));

    expect(serialized).not.toContain('hashedpassword');
    expect(serialized).not.toContain('JBSWY3DPEHPK3PXP');
    expect(serialized).not.toContain('11111111');
    expect(serialized).not.toContain('victim@example.com');
    expect(serialized).not.toContain('203.0.113.9');
  });

  it('preserves the public values it does carry', () => {
    const publicUser = toPublicUser(fullUserRow);

    expect(publicUser.id).toBe('user-1');
    expect(publicUser.username).toBe('victim');
    expect(publicUser.bio).toBe('hello');
    expect(publicUser.is_public).toBe(true);
  });

  it('returns null for a null row so callers can pass through misses', () => {
    expect(toPublicUser(null)).toBeNull();
  });
});
