'use client';

import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

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

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  cancelText?: string;
  confirmText?: string;
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
  variant?: 'default' | 'destructive';
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelText,
  confirmText,
  onConfirm,
  isLoading = false,
  variant = 'destructive',
  children,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  
  const handleConfirm = async () => {
    try {
      await onConfirm();
      // Only close the dialog if the operation was successful
      onOpenChange(false);
    } catch (error) {
      // Keep the dialog open if there was an error
      console.error('Operation failed:', error);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        
        {children}
        
        <AlertDialogFooter>
          <AlertDialogCancel>
            {cancelText || t('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={variant === 'destructive' ? 'bg-destructive hover:bg-destructive/90 text-white dark:text-white' : ''}
          >
            {confirmText || t('common.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
} 