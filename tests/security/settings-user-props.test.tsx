import { expect, it, vi } from 'vitest';
const raw = vi.hoisted(() => ({ id: 'owner', name: 'Owner', email: 'owner@example.com', image: null,
  password: 'SECRET-HASH', two_fa_secret: 'SECRET-2FA', two_fa_backup_codes: ['SECRET-BACKUP'], last_login_ip: 'SECRET-IP',
}));
vi.mock('@/lib/auth', () => ({ getAuthSession: async () => ({ user: { id: 'owner' } }) }));
vi.mock('@/db', () => ({ db: { query: { users: { findFirst: async () => raw } } } }));
vi.mock('@/app/(sidebar-layout)/(container)/settings/actions', () => ({ getConnectedAccounts: async () => [], getUserEmailPreferences: async () => null }));
vi.mock('@/app/(sidebar-layout)/(container)/settings/components/settings-form', () => ({ SettingsForm: () => null }));
vi.mock('@/app/(sidebar-layout)/(container)/settings/components/settings-title', () => ({ SettingsTitle: () => null }));
vi.mock('@/app/(sidebar-layout)/(container)/settings/components/email-preferences-section', () => ({ EmailPreferencesSection: () => null }));
import SettingsPage from '@/app/(sidebar-layout)/(container)/settings/page';
it('passes only display fields and a password-presence boolean across the client boundary', async () => {
  const tree = await SettingsPage();
  const serialized = JSON.stringify(tree);
  expect(serialized).not.toContain('SECRET-');
  expect(serialized).toContain('owner@example.com');
  expect(serialized).toContain('"hasPassword":true');
});
