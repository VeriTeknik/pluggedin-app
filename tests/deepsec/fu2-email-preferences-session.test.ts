/**
 * getUserEmailPreferences / updateEmailPreferences are server actions — HTTP
 * endpoints — that trusted a caller-supplied userId (deepsec
 * pluggedin-app-missing-auth-13b3133b8e, pluggedin-app-cross-tenant-id-b7c59a3405).
 * Any signed-in user could read another user's preferences, unsubscribe them,
 * or re-subscribe them, and the update spread an unvalidated object into the
 * row (notificationSeverity, even userId).
 *
 * Now both derive the user from the session, and the update accepts only the
 * four boolean preferences.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  existing: null as null | Record<string, unknown>,
  findFirst: vi.fn(),
  set: vi.fn(),
  updateWhere: vi.fn(),
  values: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getAuthSession: async () => m.session }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/email', () => ({}));
vi.mock('@/lib/auth-security', () => ({}));
vi.mock('@/db/schema', () => ({
  accounts: {},
  users: {},
  userEmailPreferencesTable: { userId: 'user_email_preferences.user_id' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ and: conditions }),
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));
vi.mock('@/db', () => ({
  db: {
    query: {
      userEmailPreferencesTable: {
        findFirst: async (args: unknown) => (m.findFirst(args), m.existing),
      },
    },
    update: () => ({
      set: (values: unknown) => (m.set(values), { where: async (w: unknown) => m.updateWhere(w) }),
    }),
    insert: () => ({ values: async (row: unknown) => m.values(row) }),
  },
}));

import {
  getUserEmailPreferences,
  updateEmailPreferences,
} from '@/app/(sidebar-layout)/(container)/settings/actions';

const OWNER_ROW = { value: 'owner', column: 'user_email_preferences.user_id' };
const ALL_OFF = { welcomeEmails: false, productUpdates: false, marketingEmails: false, adminNotifications: false };

// The old signatures took (userId) and (userId, preferences). Calls in that
// shape are exactly what an attacker would send, so they are exercised as-is.
const legacyGet = getUserEmailPreferences as unknown as (userId: string) => ReturnType<typeof getUserEmailPreferences>;
const legacyUpdate = updateEmailPreferences as unknown as (
  userId: string,
  preferences: unknown
) => ReturnType<typeof updateEmailPreferences>;

beforeEach(() => {
  vi.clearAllMocks();
  m.session = { user: { id: 'owner' } };
  m.existing = null;
});

describe('getUserEmailPreferences', () => {
  it("reads the session user's preferences, whatever id is passed", async () => {
    await legacyGet('victim');

    expect(m.findFirst).toHaveBeenCalledWith({ where: OWNER_ROW });
  });

  it('returns nothing without a session', async () => {
    m.session = null;

    expect(await legacyGet('victim')).toBeNull();
    expect(m.findFirst).not.toHaveBeenCalled();
  });
});

describe('updateEmailPreferences', () => {
  it("updates the session user's row", async () => {
    m.existing = { userId: 'owner' };

    const result = await updateEmailPreferences(ALL_OFF);

    expect(result).toEqual({ success: true });
    expect(m.set).toHaveBeenCalledWith({ ...ALL_OFF, updatedAt: expect.any(Date) });
    expect(m.updateWhere).toHaveBeenCalledWith(OWNER_ROW);
  });

  it('creates the row for the session user', async () => {
    const result = await updateEmailPreferences({ marketingEmails: true });

    expect(result).toEqual({ success: true });
    expect(m.values).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner', marketingEmails: true }));
  });

  it("cannot be pointed at another user's id", async () => {
    m.existing = { userId: 'victim' };

    const result = await legacyUpdate('victim', ALL_OFF);

    expect(result.success).toBe(false);
    expect(m.set).not.toHaveBeenCalled();
    expect(m.values).not.toHaveBeenCalled();
  });

  it('refuses fields beyond the four preferences', async () => {
    m.existing = { userId: 'owner' };

    for (const extra of [{ userId: 'victim' }, { notificationSeverity: 'INFO' }, { welcomeEmails: 'yes' }]) {
      const result = await updateEmailPreferences({ ...ALL_OFF, ...extra } as never);
      expect(result.success).toBe(false);
    }
    expect(m.set).not.toHaveBeenCalled();
    expect(m.values).not.toHaveBeenCalled();
  });

  it('refuses without a session', async () => {
    m.session = null;

    const result = await updateEmailPreferences(ALL_OFF);

    expect(result.success).toBe(false);
    expect(m.findFirst).not.toHaveBeenCalled();
    expect(m.set).not.toHaveBeenCalled();
    expect(m.values).not.toHaveBeenCalled();
  });
});
