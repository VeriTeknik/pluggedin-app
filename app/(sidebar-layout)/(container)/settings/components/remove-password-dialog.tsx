'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface RemovePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string;
  onConfirm: (confirmEmail: string) => Promise<void>;
  isLoading?: boolean;
}

export function RemovePasswordDialog({
  open,
  onOpenChange,
  userEmail,
  onConfirm,
  isLoading = false,
}: RemovePasswordDialogProps) {
  const { t } = useTranslation();
  const [confirmEmail, setConfirmEmail] = useState('');

  const handleConfirm = async () => {
    if (confirmEmail === userEmail) {
      await onConfirm(confirmEmail);
      setConfirmEmail(''); // Reset input after confirmation
    }
  };

  const handleCancel = () => {
    setConfirmEmail(''); // Reset input when canceled
    onOpenChange(false);
  };

  const isConfirmDisabled = confirmEmail !== userEmail || isLoading;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('settings.password.removeDialog.title')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('settings.password.removeDialog.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="confirmEmail">
              {t('settings.password.removeDialog.confirmLabel')}
            </Label>
            <Input
              id="confirmEmail"
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={t('settings.password.removeDialog.confirmPlaceholder')}
              disabled={isLoading}
              className="font-mono text-sm"
              autoComplete="off"
            />
            {confirmEmail && confirmEmail !== userEmail && (
              <p className="text-xs text-destructive">
                {t('settings.password.errors.confirmEmailMismatch')}
              </p>
            )}
          </div>

          <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {t('settings.password.removeDialog.warning')}
            </AlertDescription>
          </Alert>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isLoading}>
            {t('settings.password.removeDialog.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t('common.loading')}
              </span>
            ) : (
              t('settings.password.removeDialog.confirm')
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
