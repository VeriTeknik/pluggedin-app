/**
 * UI side of the credential re-verification fix: the settings form must send
 * the current password when removing it, and must offer a provider sign-in
 * when setting a password is refused for lack of a fresh re-authentication.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  removePassword: vi.fn(),
  setPassword: vi.fn(),
  signIn: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && typeof opts === 'object' && 'provider' in opts ? `${key}:${String(opts.provider)}` : key,
  }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('next-auth/react', () => ({ signIn: m.signIn, signOut: vi.fn() }));
vi.mock('@/hooks/use-language', () => ({ useLanguage: () => ({ currentLanguage: 'en', setLanguage: vi.fn() }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: m.toast }) }));
vi.mock('@/app/(sidebar-layout)/(container)/settings/actions', () => ({
  removePassword: m.removePassword,
  setPassword: m.setPassword,
  removeConnectedAccount: vi.fn(),
}));
vi.mock('@/app/(sidebar-layout)/(container)/settings/components/appearance-section', () => ({ AppearanceSection: () => null }));
vi.mock('@/app/(sidebar-layout)/(container)/settings/components/current-project-section', () => ({ CurrentProjectSection: () => null }));
vi.mock('@/app/(sidebar-layout)/(container)/settings/components/login-methods-card', () => ({ LoginMethodsCard: () => null }));
vi.mock('@/app/(sidebar-layout)/(container)/settings/components/remove-password-dialog', async () => {
  const { createElement: h } = await import('react');
  return {
    RemovePasswordDialog: ({ open, onConfirm, userEmail }: { open: boolean; onConfirm: (e: string) => Promise<void>; userEmail: string }) =>
      open ? h('button', { type: 'button', onClick: () => onConfirm(userEmail) }, 'confirm-remove') : null,
  };
});

import { SettingsForm } from '@/app/(sidebar-layout)/(container)/settings/components/settings-form';

const baseUser = { id: 'u1', name: 'Owner', email: 'owner@example.com', image: null };
const github = [{ provider: 'github', lastUsed: null }];

beforeEach(() => {
  vi.clearAllMocks();
  m.removePassword.mockResolvedValue({ success: true });
});

describe('remove password', () => {
  it('sends the current password with the removal', async () => {
    render(createElement(SettingsForm, { user: { ...baseUser, hasPassword: true }, connectedAccounts: github }));

    fireEvent.change(screen.getByPlaceholderText('settings.password.current.placeholder'), {
      target: { value: 'Current-Pass-1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'settings.password.removeButton' }));
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'confirm-remove' }));
    });

    expect(m.removePassword).toHaveBeenCalledWith({
      confirmEmail: 'owner@example.com',
      currentPassword: 'Current-Pass-1!',
    });
  });

  it('asks for the current password instead of opening the dialog when it is empty', async () => {
    render(createElement(SettingsForm, { user: { ...baseUser, hasPassword: true }, connectedAccounts: github }));

    fireEvent.click(screen.getByRole('button', { name: 'settings.password.removeButton' }));

    expect(await screen.findByText('settings.password.errors.currentPasswordRequired')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'confirm-remove' })).toBeNull();
    expect(m.removePassword).not.toHaveBeenCalled();
  });
});

describe('set password on an OAuth-only account', () => {
  it('offers a provider sign-in when the server asks for re-authentication', async () => {
    m.setPassword.mockResolvedValue({ success: false, code: 'REAUTH_REQUIRED', error: 'reauth' });
    render(createElement(SettingsForm, { user: { ...baseUser, hasPassword: false }, connectedAccounts: github }));

    fireEvent.change(screen.getAllByPlaceholderText('settings.password.new.placeholder')[0], {
      target: { value: 'New-Password-1!' },
    });
    fireEvent.change(screen.getByPlaceholderText('settings.password.confirm.placeholder'), {
      target: { value: 'New-Password-1!' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'settings.password.setButton' }));
    });

    await waitFor(() => expect(m.setPassword).toHaveBeenCalledWith('New-Password-1!'));
    const reauth = await screen.findByRole('button', { name: 'settings.password.reauthButton:github' });
    fireEvent.click(reauth);

    expect(m.signIn).toHaveBeenCalledWith('github', { callbackUrl: '/settings' });
    expect(m.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'settings.password.errors.reauthRequired' })
    );
  });
});
