'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ImagePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { signIn, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useLanguage } from '@/hooks/use-language';
import { localeNames,locales } from '@/i18n/config'; // Import locales and names
import { safeLocalStorage, safeSessionStorage } from '@/lib/storage-utils';

import { type ConnectedAccount, removeConnectedAccount, removePassword, setPassword } from '../actions';
import { AppearanceSection } from './appearance-section';
import { CurrentProjectSection } from './current-project-section';
import { LoginMethodsCard } from './login-methods-card';
import { ReauthDialog } from './reauth-dialog';
import { RemovePasswordDialog } from './remove-password-dialog';
type User = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  hasPassword: boolean;
};

interface SettingsFormProps {
  user: User;
  connectedAccounts: ConnectedAccount[];
  /**
   * Until when (ms) this session's sign-in counts as a re-authentication, which
   * linking a new provider requires (lib/auth.ts); null when it does not.
   */
  reauthValidUntil?: number | null;
  /** A provider whose link the server refused for want of a recent sign-in. */
  refusedLink?: string | null;
}

/** A sign-in method change waiting for the user to prove it is them. */
type PendingReauth =
  | { action: 'connect'; provider: string }
  | { action: 'disconnect'; provider: string; via: 'password' | 'provider' };

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  language: z.enum(['en', 'tr', 'nl', 'zh', 'ja', 'hi']), // Updated to include all supported languages
});

const passwordSchema = z.object({
  currentPassword: z.string().min(8, 'Password must be at least 8 characters'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Password must be at least 8 characters'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

const setPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Password must be at least 8 characters'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export function SettingsForm({
  user,
  connectedAccounts,
  reauthValidUntil = null,
  refusedLink = null,
}: SettingsFormProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { currentLanguage, setLanguage } = useLanguage();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isRemovingAccount, setIsRemovingAccount] = useState<string | null>(null);
  const [removePasswordDialogOpen, setRemovePasswordDialogOpen] = useState(false);
  const [isRemovingPassword, setIsRemovingPassword] = useState(false);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [reauthRequired, setReauthRequired] = useState(false);
  const [pendingReauth, setPendingReauth] = useState<PendingReauth | null>(
    refusedLink ? { action: 'connect', provider: refusedLink } : null
  );
  const [isReauthenticating, setIsReauthenticating] = useState(false);

  const providerName = (provider: string) => t(`settings.loginMethods.providers.${provider}`);

  // The server refused a link (lib/auth.ts signIn callback): say why.
  useEffect(() => {
    if (!refusedLink) return;
    toast({
      title: t('common.error'),
      description: t('settings.loginMethods.reauth.linkRefused', { provider: providerName(refusedLink) }),
      variant: 'destructive',
    });
    // Only on arrival with the refusal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refusedLink]);

  const profileForm = useForm<z.infer<typeof profileSchema>>({ // Explicitly type useForm
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name || '', // Provide empty string fallback for null name
      language: currentLanguage,
    },
  });

  const passwordForm = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const setPasswordForm = useForm({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onProfileSubmit = async (values: z.infer<typeof profileSchema>) => {
    try {
      setIsUpdatingProfile(true);
      const response = await fetch('/api/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || t('settings.profile.error'));
      }

      toast({
        title: t('common.success'),
        description: t('settings.profile.success'),
      });

      // Update the form with new values
      profileForm.reset(values);
      router.refresh();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('settings.profile.error'),
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const onPasswordSubmit = async (values: z.infer<typeof passwordSchema>) => {
    try {
      const response = await fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || t('settings.password.error'));
      }

      toast({
        title: t('common.success'),
        description: t('settings.password.success'),
      });

      passwordForm.reset();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('settings.password.error'),
        variant: 'destructive',
      });
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch('/api/settings/avatar', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || t('settings.profile.error'));
      }


      toast({
        title: t('common.success'),
        description: t('settings.profile.success'),
      });

      router.refresh();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('settings.profile.error'),
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      return;
    }

    try {
      setIsDeleting(true);
      const response = await fetch('/api/settings/account', {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || t('settings.account.error'));
      }

      // Clear any local session data
      safeLocalStorage.clear();
      safeSessionStorage.clear();
      
      // Note: serverLogout() is not needed here because the DELETE endpoint
      // already handles session cleanup as part of the CASCADE deletion
      
      // Sign out using NextAuth to clear client-side auth state
      // Using redirect: false to avoid race conditions
      await signOut({ 
        callbackUrl: '/login',
        redirect: false
      });
      
      // Force a full page reload to /login
      window.location.href = '/login';
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('settings.account.error'),
        variant: 'destructive',
      });
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  };

  const showError = (description: string) =>
    toast({ title: t('common.error'), description, variant: 'destructive' });

  // Linking a new provider needs a sign-in from the last few minutes; the
  // server refuses it otherwise (lib/auth.ts), so ask for one up front.
  const handleConnect = (provider: string) => {
    if (reauthValidUntil !== null && Date.now() < reauthValidUntil) {
      void signIn(provider, { callbackUrl: '/settings' });
      return;
    }
    setPendingReauth({ action: 'connect', provider });
  };

  // A fresh password sign-in re-authenticates this session, then the link starts.
  const confirmPasswordThenConnect = async (provider: string, password: string) => {
    try {
      setIsReauthenticating(true);
      const result = await signIn('credentials', {
        email: user.email ?? '',
        password,
        redirect: false,
      });
      if (!result?.ok || result.error) {
        showError(t('settings.loginMethods.reauth.passwordIncorrect'));
        return;
      }
      await signIn(provider, { callbackUrl: '/settings' });
    } finally {
      setIsReauthenticating(false);
    }
  };

  // Disconnecting needs the current password, or (without one) a fresh sign-in
  // through another connected provider; removeConnectedAccount checks it.
  const handleDisconnect = async (provider: string) => {
    if (user.hasPassword) {
      setPendingReauth({ action: 'disconnect', provider, via: 'password' });
      return;
    }
    await handleRemoveAccount(provider);
  };

  const handleRemoveAccount = async (provider: string, currentPassword?: string) => {
    try {
      setIsRemovingAccount(provider);
      const result = currentPassword
        ? await removeConnectedAccount(provider, { currentPassword })
        : await removeConnectedAccount(provider);

      if (result.success) {
        setPendingReauth(null);
        toast({
          title: t('common.success'),
          description: t('settings.connectedAccounts.removed', { provider: providerName(provider) }),
        });
        router.refresh();
      } else if (result.code === 'REAUTH_REQUIRED') {
        setPendingReauth({ action: 'disconnect', provider, via: 'provider' });
      } else if (result.code === 'RATE_LIMITED') {
        showError(t('settings.password.errors.tooManyAttempts'));
      } else if (result.code === 'INCORRECT_PASSWORD' || result.code === 'PASSWORD_REQUIRED') {
        showError(t('settings.loginMethods.reauth.passwordIncorrect'));
      } else if (result.code === 'LAST_LOGIN_METHOD') {
        setPendingReauth(null);
        showError(t('settings.loginMethods.reauth.lastLoginMethod'));
      } else {
        setPendingReauth(null);
        showError(result.error || t('settings.connectedAccounts.error'));
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('settings.connectedAccounts.error', 'Failed to disconnect account'),
        variant: 'destructive',
      });
    } finally {
      setIsRemovingAccount(null);
    }
  };

  // Removing a password re-verifies it: the current password is taken from the
  // form's "Current Password" field and checked on the server.
  const openRemovePasswordDialog = () => {
    if (!passwordForm.getValues('currentPassword')) {
      passwordForm.setError('currentPassword', {
        type: 'manual',
        message: t('settings.password.errors.currentPasswordRequired'),
      });
      return;
    }
    passwordForm.clearErrors('currentPassword');
    setRemovePasswordDialogOpen(true);
  };

  const handleRemovePassword = async (confirmEmail: string) => {
    try {
      setIsRemovingPassword(true);
      const result = await removePassword({
        confirmEmail,
        currentPassword: passwordForm.getValues('currentPassword'),
      });

      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('settings.password.successMessages.removed'),
        });
        setRemovePasswordDialogOpen(false);
        passwordForm.reset();
        router.refresh();
      } else if ('code' in result && result.code === 'RATE_LIMITED') {
        showError(t('settings.password.errors.tooManyAttempts'));
      } else {
        toast({
          title: t('common.error'),
          description: result.error || t('settings.password.errors.removalFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('settings.password.errors.removalFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsRemovingPassword(false);
    }
  };

  const onSetPasswordSubmit = async (values: z.infer<typeof setPasswordSchema>) => {
    try {
      setIsSettingPassword(true);
      const result = await setPassword(values.newPassword);

      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('settings.password.successMessages.set'),
        });
        setPasswordForm.reset();
        setReauthRequired(false);
        router.refresh();
      } else if ('code' in result && result.code === 'REAUTH_REQUIRED') {
        // Adding a credential needs a fresh sign-in with a linked provider.
        setReauthRequired(true);
        toast({
          title: t('common.error'),
          description: t('settings.password.errors.reauthRequired'),
          variant: 'destructive',
        });
      } else {
        toast({
          title: t('common.error'),
          description: result.error || t('settings.password.errors.setFailed'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('settings.password.errors.setFailed'),
        variant: 'destructive',
      });
    } finally {
      setIsSettingPassword(false);
    }
  };

  return (
    <div className="space-y-12">
      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.profile.title')}</CardTitle>
          <CardDescription>
            {t('settings.profile.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={user.image || ''} />
                  <AvatarFallback>{user.name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <Label htmlFor="avatar" className="cursor-pointer">
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="flex items-center gap-2" 
                      disabled={isUploading}
                    >
                      <ImagePlus className="h-4 w-4" />
                      {t('settings.profile.avatar')}
                    </Button>
                    <Input
                      id="avatar"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                      disabled={isUploading}
                    />
                  </Label>
                </div>
              </div>
              <FormField
                control={profileForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.profile.name')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={profileForm.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.profile.language')}</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        onChange={(e) => {
                          field.onChange(e);
                          // Cast to Locale type from config
                          setLanguage(e.target.value as typeof locales[number]); 
                        }}
                      >
                        {/* Dynamically generate options */}
                        {locales.map((locale) => (
                          <option key={locale} value={locale}>
                            {localeNames[locale]}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isUpdatingProfile}>
                {isUpdatingProfile ? t('common.saving') : t('common.save')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Social Profile Section - Pass user prop */}

      {/* Login Methods Card - Unified view of all login methods */}
      <LoginMethodsCard
        userEmail={user.email || ''}
        hasPassword={!!user.hasPassword}
        connectedAccounts={connectedAccounts.map((acc) => ({
          id: acc.provider,
          provider: acc.provider,
          providerAccountId: acc.provider,
        }))}
        onDisconnect={handleDisconnect}
        onConnect={handleConnect}
        canRemoveAccount={
          connectedAccounts.length > 1 || (connectedAccounts.length === 1 && !!user.hasPassword)
        }
      />

      {/* Confirm it's you before a sign-in method is connected or disconnected */}
      {pendingReauth && (
        <ReauthDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingReauth(null);
          }}
          isLoading={isReauthenticating || isRemovingAccount !== null}
          {...(pendingReauth.action === 'connect'
            ? {
                description: t('settings.loginMethods.reauth.connectDescription', {
                  provider: providerName(pendingReauth.provider),
                }),
                providers: connectedAccounts.map((account) => account.provider),
                providersHint: t('settings.loginMethods.reauth.connectProvidersHint'),
                password: user.hasPassword
                  ? {
                      submitLabel: t('settings.loginMethods.reauth.confirmAndConnect'),
                      onSubmit: (password: string) =>
                        confirmPasswordThenConnect(pendingReauth.provider, password),
                    }
                  : undefined,
              }
            : pendingReauth.via === 'password'
              ? {
                  description: t('settings.loginMethods.reauth.disconnectPasswordDescription', {
                    provider: providerName(pendingReauth.provider),
                  }),
                  providers: [],
                  password: {
                    submitLabel: t('settings.loginMethods.reauth.confirmAndDisconnect'),
                    onSubmit: (password: string) =>
                      handleRemoveAccount(pendingReauth.provider, password),
                  },
                }
              : {
                  description: t('settings.loginMethods.reauth.disconnectProviderDescription', {
                    provider: providerName(pendingReauth.provider),
                  }),
                  // Only a provider that stays connected can vouch for the removal.
                  providers: connectedAccounts
                    .map((account) => account.provider)
                    .filter((provider) => provider !== pendingReauth.provider),
                })}
          onProvider={(provider) => {
            void signIn(provider, { callbackUrl: '/settings' });
          }}
        />
      )}

      {/* Password Section - Smart UI based on user state */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.password.title')}</CardTitle>
          <CardDescription>
            {!user.hasPassword
              ? t('settings.password.descriptionNoPassword')
              : connectedAccounts.length > 0
              ? t('settings.password.descriptionWithRemove')
              : t('settings.password.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!user.hasPassword ? (
            // No password set - Show "Set Password" form
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {t('settings.password.noPasswordSet')}
              </p>
              {reauthRequired && connectedAccounts.length > 0 && (
                <div className="space-y-2 rounded-md border p-4">
                  <p className="text-sm text-muted-foreground">
                    {t('settings.password.reauthDescription')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {connectedAccounts.map((account) => (
                      <Button
                        key={account.provider}
                        type="button"
                        variant="outline"
                        onClick={() => signIn(account.provider, { callbackUrl: '/settings' })}
                      >
                        {t('settings.password.reauthButton', { provider: account.provider })}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <Form {...setPasswordForm}>
                <form
                  onSubmit={setPasswordForm.handleSubmit(onSetPasswordSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={setPasswordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.password.new.label')}</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            {...field}
                            placeholder={t('settings.password.new.placeholder')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={setPasswordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.password.confirm.label')}</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            {...field}
                            placeholder={t('settings.password.confirm.placeholder')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={isSettingPassword}>
                    {isSettingPassword ? t('common.saving') : t('settings.password.setButton')}
                  </Button>
                </form>
              </Form>
            </>
          ) : (
            // Has password - Show "Change Password" form
            <>
              <Form {...passwordForm}>
                <form
                  onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={passwordForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.password.current.label')}</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            {...field}
                            placeholder={t('settings.password.current.placeholder')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.password.new.label')}</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            {...field}
                            placeholder={t('settings.password.new.placeholder')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('settings.password.confirm.label')}</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            {...field}
                            placeholder={t('settings.password.confirm.placeholder')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-center gap-2">
                    <Button type="submit">{t('settings.password.updateButton')}</Button>
                    {/* Show remove button only if user has OAuth accounts */}
                    {connectedAccounts.length > 0 && (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={openRemovePasswordDialog}
                      >
                        {t('settings.password.removeButton')}
                      </Button>
                    )}
                  </div>
                </form>
              </Form>
            </>
          )}
        </CardContent>
      </Card>

      {/* Remove Password Dialog */}
      <RemovePasswordDialog
        open={removePasswordDialogOpen}
        onOpenChange={setRemovePasswordDialogOpen}
        userEmail={user.email || ''}
        onConfirm={handleRemovePassword}
        isLoading={isRemovingPassword}
      />

      {/* Current Project Section */}
      <CurrentProjectSection />

      {/* Appearance Section */}
      <AppearanceSection />

      {/* Delete Account Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.account.title')}</CardTitle>
          <CardDescription>
            {t('settings.account.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive">{t('settings.account.deleteButton')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('settings.account.confirmTitle')}</DialogTitle>
                <DialogDescription>
                  {t('settings.account.confirmDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Please type &quot;DELETE&quot; to confirm:
                </p>
                <Input
                  type="text"
                  placeholder="Type DELETE to confirm"
                  onChange={(e) => setIsConfirmingDelete(e.target.value === 'DELETE')}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={!isConfirmingDelete || isDeleting}
                >
                  {isDeleting ? t('settings.account.deletingButton') : t('settings.account.confirmButton')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
