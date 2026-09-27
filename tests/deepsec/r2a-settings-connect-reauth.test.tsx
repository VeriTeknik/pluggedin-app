/**
 * UI side of the account-linking fix. Linking a new provider now needs a sign-in
 * from the last five minutes (lib/auth.ts signIn callback), and disconnecting
 * one needs the current password or a fresh sign-in through another provider
 * (removeConnectedAccount). The settings page must ask for that up front
 * instead of bouncing the user through the provider only to be refused.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  removeConnectedAccount: vi.fn(),
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
  removePassword: vi.fn(),
  setPassword: vi.fn(),
  removeConnectedAccount: m.removeConnectedAccount,
}));
vi.mock('@/app/(sidebar-layout)/(container)/settings/components/appearance-section', () => ({ AppearanceSection: () => null }));
vi.mock('@/app/(sidebar-layout)/(container)/settings/components/current-project-section', () => ({ CurrentProjectSection: () => null }));

import { SettingsForm } from '@/app/(sidebar-layout)/(container)/settings/components/settings-form';

const owner = { id: 'u1', name: 'Owner', email: 'owner@example.com', image: null };
const github = { provider: 'github', lastUsed: null };
const google = { provider: 'google', lastUsed: null };
const GITHUB_NAME = 'settings.loginMethods.providers.github';
const GOOGLE_NAME = 'settings.loginMethods.providers.google';

type Props = Parameters<typeof SettingsForm>[0];
function renderForm(props: Partial<Props> & Pick<Props, 'user' | 'connectedAccounts'>) {
  return render(createElement(SettingsForm, props as Props));
}

const connectButton = () => screen.getByRole('button', { name: 'settings.loginMethods.connect' });

beforeEach(() => {
  vi.clearAllMocks();
  m.signIn.mockResolvedValue({ ok: true, error: null, status: 200, url: null });
  m.removeConnectedAccount.mockResolvedValue({ success: true });
});

describe('connecting another account', () => {
  it('starts the link straight away when this session re-authenticated recently', () => {
    renderForm({
      user: { ...owner, hasPassword: false },
      connectedAccounts: [github],
      reauthValidUntil: Date.now() + 60_000,
    });

    fireEvent.click(connectButton());

    expect(m.signIn).toHaveBeenCalledWith('google', { callbackUrl: '/settings' });
  });

  it('asks the user to confirm it is them first when the sign-in is not recent', async () => {
    renderForm({ user: { ...owner, hasPassword: false }, connectedAccounts: [github], reauthValidUntil: null });

    fireEvent.click(connectButton());

    expect(m.signIn).not.toHaveBeenCalled();
    expect(await screen.findByText(`settings.loginMethods.reauth.connectDescription:${GOOGLE_NAME}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `settings.password.reauthButton:${GITHUB_NAME}` }));
    expect(m.signIn).toHaveBeenCalledWith('github', { callbackUrl: '/settings' });
  });

  it('treats an expired re-authentication as none', async () => {
    renderForm({
      user: { ...owner, hasPassword: false },
      connectedAccounts: [github],
      reauthValidUntil: Date.now() - 1,
    });

    fireEvent.click(connectButton());

    expect(m.signIn).not.toHaveBeenCalled();
    expect(await screen.findByText(`settings.loginMethods.reauth.connectDescription:${GOOGLE_NAME}`)).toBeInTheDocument();
  });

  it('lets a password account confirm with the password, then starts the link', async () => {
    renderForm({ user: { ...owner, hasPassword: true }, connectedAccounts: [github], reauthValidUntil: null });

    fireEvent.click(connectButton());
    fireEvent.change(within(await screen.findByRole('dialog')).getByLabelText('settings.password.current.label'), {
      target: { value: 'Current-Pass-1!' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'settings.loginMethods.reauth.confirmAndConnect' }));
    });

    expect(m.signIn).toHaveBeenNthCalledWith(1, 'credentials', {
      email: 'owner@example.com',
      password: 'Current-Pass-1!',
      redirect: false,
    });
    expect(m.signIn).toHaveBeenNthCalledWith(2, 'google', { callbackUrl: '/settings' });
  });

  it('does not start the link after a wrong password', async () => {
    m.signIn.mockResolvedValueOnce({ ok: false, error: 'CredentialsSignin', status: 401, url: null });
    renderForm({ user: { ...owner, hasPassword: true }, connectedAccounts: [github], reauthValidUntil: null });

    fireEvent.click(connectButton());
    fireEvent.change(within(await screen.findByRole('dialog')).getByLabelText('settings.password.current.label'), {
      target: { value: 'wrong-guess' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'settings.loginMethods.reauth.confirmAndConnect' }));
    });

    expect(m.signIn).toHaveBeenCalledTimes(1);
    expect(m.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'settings.loginMethods.reauth.passwordIncorrect' })
    );
  });

  it('explains a link the server refused and offers the confirmation for that provider', async () => {
    renderForm({
      user: { ...owner, hasPassword: false },
      connectedAccounts: [github],
      reauthValidUntil: null,
      refusedLink: 'google',
    });

    await waitFor(() =>
      expect(m.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: `settings.loginMethods.reauth.linkRefused:${GOOGLE_NAME}` })
      )
    );
    expect(await screen.findByText(`settings.loginMethods.reauth.connectDescription:${GOOGLE_NAME}`)).toBeInTheDocument();
  });
});

describe('disconnecting an account', () => {
  it('asks a password account for the current password and sends it', async () => {
    renderForm({ user: { ...owner, hasPassword: true }, connectedAccounts: [github] });

    fireEvent.click(screen.getByRole('button', { name: 'settings.loginMethods.disconnect' }));
    expect(m.removeConnectedAccount).not.toHaveBeenCalled();
    fireEvent.change(within(await screen.findByRole('dialog')).getByLabelText('settings.password.current.label'), {
      target: { value: 'Current-Pass-1!' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'settings.loginMethods.reauth.confirmAndDisconnect' }));
    });

    expect(m.removeConnectedAccount).toHaveBeenCalledWith('github', { currentPassword: 'Current-Pass-1!' });
  });

  it('offers a sign-in through another provider when an OAuth-only account must re-authenticate', async () => {
    m.removeConnectedAccount.mockResolvedValue({
      success: false,
      code: 'REAUTH_REQUIRED',
      error: 'For your security, sign in again with another connected account, then disconnect this one.',
    });
    renderForm({ user: { ...owner, hasPassword: false }, connectedAccounts: [github, google] });

    // Rows are Google then GitHub; disconnect GitHub.
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'settings.loginMethods.disconnect' })[1]);
    });

    expect(m.removeConnectedAccount).toHaveBeenCalledWith('github');
    expect(
      await screen.findByText(`settings.loginMethods.reauth.disconnectProviderDescription:${GITHUB_NAME}`)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `settings.password.reauthButton:${GITHUB_NAME}` })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `settings.password.reauthButton:${GOOGLE_NAME}` }));
    expect(m.signIn).toHaveBeenCalledWith('google', { callbackUrl: '/settings' });
  });

  it('shows the throttling message when the password budget is spent', async () => {
    m.removeConnectedAccount.mockResolvedValue({ success: false, code: 'RATE_LIMITED', error: 'Too many attempts.' });
    renderForm({ user: { ...owner, hasPassword: true }, connectedAccounts: [github] });

    fireEvent.click(screen.getByRole('button', { name: 'settings.loginMethods.disconnect' }));
    fireEvent.change(within(await screen.findByRole('dialog')).getByLabelText('settings.password.current.label'), {
      target: { value: 'Current-Pass-1!' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'settings.loginMethods.reauth.confirmAndDisconnect' }));
    });

    expect(m.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'settings.password.errors.tooManyAttempts' })
    );
  });
});
