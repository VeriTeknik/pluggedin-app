/**
 * The settings page tells the form whether this session may link a provider
 * right now (a sign-in within the re-auth window, lib/credential-reverification)
 * and passes on a link the signIn callback refused (lib/auth.ts redirects to
 * /settings?linkError=reauth_required&provider=<id>).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  user: null as null | Record<string, unknown>,
  accounts: [] as Array<{ provider: string; lastUsed: Date | null }>,
}));

vi.mock('@/lib/auth', () => ({ getAuthSession: async () => m.session }));
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: async () => m.user } } } }));
vi.mock('@/app/(sidebar-layout)/(container)/settings/actions', () => ({
  getConnectedAccounts: async () => m.accounts,
  getUserEmailPreferences: async () => null,
}));
vi.mock('@/app/(sidebar-layout)/(container)/settings/components/settings-form', () => ({ SettingsForm: () => null }));
vi.mock('@/app/(sidebar-layout)/(container)/settings/components/settings-title', () => ({ SettingsTitle: () => null }));
vi.mock('@/app/(sidebar-layout)/(container)/settings/components/email-preferences-section', () => ({
  EmailPreferencesSection: () => null,
}));

import { SettingsForm } from '@/app/(sidebar-layout)/(container)/settings/components/settings-form';
import SettingsPage from '@/app/(sidebar-layout)/(container)/settings/page';

const minutesAgo = (n: number) => Date.now() - n * 60_000;

/** The props the page hands SettingsForm. */
async function formProps(searchParams?: Record<string, string | string[]>) {
  const tree = (await SettingsPage(
    searchParams ? { searchParams: Promise.resolve(searchParams) } : {}
  )) as { props: { children: { props: { children: Array<{ type: unknown; props: Record<string, unknown> }> } } } };
  const form = tree.props.children.props.children.find((child) => child?.type === SettingsForm);
  return form!.props;
}

beforeEach(() => {
  m.user = { id: 'owner', name: 'Owner', email: 'owner@example.com', image: null, password: null, password_changed_at: null };
  m.accounts = [{ provider: 'github', lastUsed: null }];
});

describe('the re-authentication window', () => {
  it('is passed when this session signed in through a linked provider moments ago', async () => {
    const authTime = minutesAgo(1);
    m.session = { user: { id: 'owner' }, authTime, authProvider: 'github' };

    expect((await formProps()).reauthValidUntil).toBe(authTime + 5 * 60_000);
  });

  it('is null for an old sign-in', async () => {
    m.session = { user: { id: 'owner' }, authTime: minutesAgo(30), authProvider: 'github' };

    expect((await formProps()).reauthValidUntil).toBeNull();
  });

  it('counts a fresh password sign-in only while the account has a password', async () => {
    m.session = { user: { id: 'owner' }, authTime: minutesAgo(1), authProvider: 'credentials' };
    expect((await formProps()).reauthValidUntil).toBeNull();

    m.user = { ...m.user!, password: 'bcrypt-hash' };
    expect((await formProps()).reauthValidUntil).not.toBeNull();
  });
});

describe('a refused link', () => {
  beforeEach(() => {
    m.session = { user: { id: 'owner' } };
  });

  it('is passed on for a known provider', async () => {
    const props = await formProps({ linkError: 'reauth_required', provider: 'google' });

    expect(props.refusedLink).toBe('google');
  });

  it('is ignored for an unknown provider or error', async () => {
    expect((await formProps({ linkError: 'reauth_required', provider: '<script>' })).refusedLink).toBeNull();
    expect((await formProps({ linkError: 'other', provider: 'google' })).refusedLink).toBeNull();
    expect((await formProps({ linkError: ['reauth_required', 'x'], provider: 'google' })).refusedLink).toBeNull();
    expect((await formProps()).refusedLink).toBeNull();
  });
});
