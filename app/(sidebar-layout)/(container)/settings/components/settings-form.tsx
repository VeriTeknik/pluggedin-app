'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ImagePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { signIn, signOut } from 'next-auth/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
import { users } from '@/db/schema';
import { useLanguage } from '@/hooks/use-language';
import { localeNames,locales } from '@/i18n/config'; // Import locales and names

import { type ConnectedAccount, removeConnectedAccount, removePassword, setPassword } from '../actions';
import { AppearanceSection } from './appearance-section';
import { CurrentProfileSection } from './current-profile-section';
import { CurrentProjectSection } from './current-project-section';
import { ProfileSocialSection } from './profile-social-section';
import { RemovePasswordDialog } from './remove-password-dialog';
import { LoginMethodsCard } from './login-methods-card';
type User = typeof users.$inferSelect;

interface SettingsFormProps {
  user: User;
  connectedAccounts: ConnectedAccount[];
}

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

export function SettingsForm({ user, connectedAccounts }: SettingsFormProps) {
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
      window.localStorage.clear();
      window.sessionStorage.clear();
      
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

  const handleRemoveAccount = async (provider: string) => {
    try {
      setIsRemovingAccount(provider);
      const result = await removeConnectedAccount(provider);

      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('settings.connectedAccounts.removed', `${provider} account disconnected successfully`),
        });
        router.refresh();
      } else {
        toast({
          title: t('common.error'),
          description: result.error || t('settings.connectedAccounts.error', 'Failed to disconnect account'),
          variant: 'destructive',
        });
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

  const handleRemovePassword = async (confirmEmail: string) => {
    try {
      setIsRemovingPassword(true);
      const result = await removePassword(confirmEmail);

      if (result.success) {
        toast({
          title: t('common.success'),
          description: t('settings.password.successMessages.removed'),
        });
        setRemovePasswordDialogOpen(false);
        router.refresh();
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
        router.refresh();
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
      <ProfileSocialSection user={user} />

      {/* Login Methods Card - Unified view of all login methods */}
      <LoginMethodsCard
        userEmail={user.email || ''}
        hasPassword={!!user.password}
        connectedAccounts={connectedAccounts.map((acc) => ({
          id: acc.provider,
          provider: acc.provider,
          providerAccountId: acc.provider,
        }))}
        onDisconnect={handleRemoveAccount}
        onConnect={(provider) => signIn(provider)}
        canRemoveAccount={
          connectedAccounts.length > 1 || (connectedAccounts.length === 1 && !!user.password)
        }
      />

      {/* Password Section - Smart UI based on user state */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.password.title')}</CardTitle>
          <CardDescription>
            {!user.password
              ? t('settings.password.descriptionNoPassword')
              : connectedAccounts.length > 0
              ? t('settings.password.descriptionWithRemove')
              : t('settings.password.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!user.password ? (
            // No password set - Show "Set Password" form
            <>
              <p className="text-sm text-muted-foreground mb-4">
                {t('settings.password.noPasswordSet')}
              </p>
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
                        onClick={() => setRemovePasswordDialogOpen(true)}
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

      {/* Current Workspace Section */}
      <CurrentProfileSection />

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
