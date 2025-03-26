'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

import { AppearanceSection } from './appearance-section';
import { CurrentProfileSection } from './current-profile-section';
import { CurrentProjectSection } from './current-project-section';

interface SettingsFormProps {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string;
    emailVerified?: Date | null;
  };
  connectedAccounts: string[];
}

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(8, 'Password must be at least 8 characters'),
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  const profileForm = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name,
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
    if (!file) return;

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

      const data = await response.json();

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
        const error = await response.text();
        throw new Error(error || t('settings.account.error'));
      }

      // Clear any session data
      window.localStorage.clear();
      window.sessionStorage.clear();
      
      // Redirect to login page and force a full page reload
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

  return (
    <div className="space-y-6">
      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.profile.title')}</CardTitle>
          <CardDescription>
            {t('settings.profile.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center space-x-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.image} />
              <AvatarFallback>{user.name?.charAt(0)?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <Input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                disabled={isUploading}
              />
              <p className="text-sm text-muted-foreground mt-2">
                {t('settings.profile.avatar.recommendation')}
              </p>
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label>{t('auth.common.emailLabel')}</Label>
            <div className="flex items-center space-x-2">
              <Input value={user.email} disabled />
              {user.emailVerified ? (
                <Badge variant="secondary" className="shrink-0 bg-green-500/10 text-green-500 hover:bg-green-500/20">Verified</Badge>
              ) : (
                <Badge variant="destructive" className="shrink-0">Not Verified</Badge>
              )}
            </div>
          </div>

          {/* Name */}
          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
              <FormField
                control={profileForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('settings.profile.name.label')}</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isUpdatingProfile} placeholder={t('settings.profile.name.placeholder')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isUpdatingProfile}>
                {isUpdatingProfile ? 'Updating...' : t('settings.profile.updateButton')}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Connected Accounts */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.connectedAccounts.title', 'Connected Accounts')}</CardTitle>
          <CardDescription>
            {t('settings.connectedAccounts.description', 'Manage your connected social accounts')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* GitHub */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <svg className="h-6 w-6" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <div>
                <div className="font-medium">GitHub</div>
                <div className="text-sm text-muted-foreground">
                  {connectedAccounts.includes('github') 
                    ? t('settings.connectedAccounts.github.connected', 'Connected to GitHub')
                    : t('settings.connectedAccounts.github.connect', 'Connect your GitHub account')}
                </div>
              </div>
            </div>
            {connectedAccounts.includes('github') ? (
              <Badge variant="secondary" className="shrink-0">{t('settings.connectedAccounts.connected', 'Connected')}</Badge>
            ) : (
              <Button variant="outline" onClick={() => signIn('github')}>
                {t('auth.social.github')}
              </Button>
            )}
          </div>

          {/* Google */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <svg className="h-6 w-6" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <div>
                <div className="font-medium">Google</div>
                <div className="text-sm text-muted-foreground">
                  {connectedAccounts.includes('google') 
                    ? t('settings.connectedAccounts.google.connected', 'Connected to Google')
                    : t('settings.connectedAccounts.google.connect', 'Connect your Google account')}
                </div>
              </div>
            </div>
            {connectedAccounts.includes('google') ? (
              <Badge variant="secondary" className="shrink-0">{t('settings.connectedAccounts.connected', 'Connected')}</Badge>
            ) : (
              <Button variant="outline" onClick={() => signIn('google')}>
                {t('auth.social.google')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Password Section - Only show for non-OAuth users */}
      {!connectedAccounts.length && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.password.title')}</CardTitle>
            <CardDescription>
              {t('settings.password.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.password.current.label')}</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} placeholder={t('settings.password.current.placeholder')} />
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
                        <Input type="password" {...field} placeholder={t('settings.password.new.placeholder')} />
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
                        <Input type="password" {...field} placeholder={t('settings.password.confirm.placeholder')} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit">{t('settings.password.updateButton')}</Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

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
                  Please type "DELETE" to confirm:
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
