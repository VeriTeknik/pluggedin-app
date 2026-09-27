/**
 * removePassword asked only for the account's email — which the settings page
 * shows to whoever holds the session — and then cleared the password.
 * setPassword accepted any new password once none was set. Together, anyone
 * holding a (stolen, recently validated) session could replace the password
 * without knowing it, turning temporary session access into a persistent
 * credential; session revocation on password change only runs every 15 min.
 *
 * Now: removing a password requires the current password; setting one on an
 * OAuth-only account requires a fresh sign-in with a linked provider.
 */
import { hashSync } from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CURRENT = 'Correct-Horse-9!';
const HASH = hashSync(CURRENT, 4);

const m = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>,
  session: null as null | Record<string, unknown>,
  update: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getAuthSession: async () => m.session }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/email', () => ({
  generatePasswordRemovedEmail: vi.fn(() => ({})),
  generatePasswordSetEmail: vi.fn(() => ({})),
  sendEmail: vi.fn(async () => true),
}));
vi.mock('@/lib/auth-security', () => ({
  isPasswordComplex: () => ({ isValid: true, errors: [] }),
  recordPasswordChange: vi.fn(async () => undefined),
  isAccountLocked: vi.fn(async () => false),
  recordFailedLoginAttempt: vi.fn(async () => ({ locked: false, remainingAttempts: 4 })),
}));
vi.mock('@/db', () => ({
  db: {
    query: { users: { findFirst: async () => m.user } },
    update: (...args: unknown[]) => {
      m.update(...args);
      return {
        set: (values: unknown) => {
          m.set(values);
          return { where: async () => undefined };
        },
      };
    },
  },
}));

async function actions() {
  return import('@/app/(sidebar-layout)/(container)/settings/actions');
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  m.session = { user: { id: 'user-1' } };
});

describe('removePassword requires the current password', () => {
  beforeEach(() => {
    m.user = {
      id: 'user-1',
      email: 'owner@example.com',
      password: HASH,
      accounts: [{ provider: 'github', last_used: minutesAgo(60 * 24) }],
    };
  });

  it('refuses when only the email is supplied', async () => {
    const { removePassword } = await actions();

    const result = await removePassword({ confirmEmail: 'owner@example.com' } as never);

    expect(result.success).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('refuses a wrong current password', async () => {
    const { removePassword } = await actions();

    const result = await removePassword({ confirmEmail: 'owner@example.com', currentPassword: 'guess-123456' });

    expect(result.success).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('removes the password when the current password is correct', async () => {
    const { removePassword } = await actions();

    const result = await removePassword({ confirmEmail: 'owner@example.com', currentPassword: CURRENT });

    expect(result).toEqual({ success: true });
    expect(m.set).toHaveBeenCalledWith(expect.objectContaining({ password: null }));
  });

  it('still requires the email confirmation', async () => {
    const { removePassword } = await actions();

    const result = await removePassword({ confirmEmail: 'someone@else.com', currentPassword: CURRENT });

    expect(result.success).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
});

describe('setPassword on an OAuth-only account requires a fresh provider sign-in', () => {
  it('refuses when no linked provider was used recently', async () => {
    m.session = { user: { id: 'user-1' }, authTime: minutesAgo(30).getTime(), authProvider: 'github' };
    m.user = {
      id: 'user-1',
      email: 'owner@example.com',
      password: null,
      accounts: [{ provider: 'github', last_used: minutesAgo(30) }, { provider: 'google', last_used: null }],
    };
    const { setPassword } = await actions();

    const result = await setPassword('Attacker-Chosen-1!');

    expect(result.success).toBe(false);
    expect((result as { code?: string }).code).toBe('REAUTH_REQUIRED');
    expect(m.update).not.toHaveBeenCalled();
  });

  it('refuses an account with no linked provider at all', async () => {
    m.session = { user: { id: 'user-1' }, authTime: minutesAgo(1).getTime(), authProvider: 'github' };
    m.user = { id: 'user-1', email: 'owner@example.com', password: null, accounts: [] };
    const { setPassword } = await actions();

    const result = await setPassword('Attacker-Chosen-1!');

    expect(result.success).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('sets the password right after a fresh sign-in with a linked provider', async () => {
    m.session = { user: { id: 'user-1' }, authTime: minutesAgo(1).getTime(), authProvider: 'github' };
    m.user = {
      id: 'user-1',
      email: 'owner@example.com',
      password: null,
      accounts: [{ provider: 'github', last_used: minutesAgo(1) }],
    };
    const { setPassword } = await actions();

    const result = await setPassword('Fresh-Password-1!');

    expect(result).toEqual({ success: true });
    expect(m.set).toHaveBeenCalledWith(expect.objectContaining({ password: expect.any(String) }));
  });

  it('still refuses when a password already exists', async () => {
    m.user = {
      id: 'user-1',
      email: 'owner@example.com',
      password: HASH,
      accounts: [{ provider: 'github', last_used: minutesAgo(1) }],
    };
    const { setPassword } = await actions();

    const result = await setPassword('Fresh-Password-1!');

    expect(result.success).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
  });
});
