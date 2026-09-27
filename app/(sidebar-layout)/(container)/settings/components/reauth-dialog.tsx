'use client';

import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ReauthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
  /** Connected providers the user can sign in again with. */
  providers: string[];
  /** Shown above the provider buttons. */
  providersHint?: string;
  onProvider: (provider: string) => void;
  /** Offered when the account has a password: confirm with it. */
  password?: {
    submitLabel: string;
    onSubmit: (password: string) => Promise<void>;
  };
  isLoading?: boolean;
}

/**
 * Asks the user to prove it is them before a sign-in method is added or
 * removed: with the current password, or by signing in again through a
 * provider that is already connected.
 */
export function ReauthDialog({
  open,
  onOpenChange,
  description,
  providers,
  providersHint,
  onProvider,
  password,
  isLoading = false,
}: ReauthDialogProps) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');

  const close = (next: boolean) => {
    if (!next) setCurrentPassword('');
    onOpenChange(next);
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || !currentPassword) return;
    await password.onSubmit(currentPassword);
    setCurrentPassword('');
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.loginMethods.reauth.title')}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {password && (
          <form onSubmit={submitPassword} className="space-y-2">
            <Label htmlFor="reauth-current-password">{t('settings.password.current.label')}</Label>
            <Input
              id="reauth-current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder={t('settings.password.current.placeholder')}
              disabled={isLoading}
            />
            <Button type="submit" disabled={isLoading || !currentPassword}>
              {password.submitLabel}
            </Button>
          </form>
        )}

        {providers.length > 0 && (
          <div className="space-y-2">
            {providersHint && <p className="text-sm text-muted-foreground">{providersHint}</p>}
            <div className="flex flex-wrap gap-2">
              {providers.map((provider) => (
                <Button
                  key={provider}
                  type="button"
                  variant="outline"
                  disabled={isLoading}
                  onClick={() => onProvider(provider)}
                >
                  {t('settings.password.reauthButton', {
                    provider: t(`settings.loginMethods.providers.${provider}`),
                  })}
                </Button>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => close(false)}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
