'use client';

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { BaseDialog, BaseDialogProps } from './base-dialog';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

export interface FormDialogProps<T = any> extends Omit<BaseDialogProps, 'footer' | 'loading'> {
  onSubmit: (data: T) => Promise<void>;
  submitText?: string;
  cancelText?: string;
  isSubmitting?: boolean;
  onCancel?: () => void;
  submitButtonVariant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  showToastOnSuccess?: boolean;
  successMessage?: string;
  disableSubmit?: boolean;
}

export function FormDialog<T = any>({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  children,
  className,
  size,
  onSubmit,
  submitText,
  cancelText,
  isSubmitting: externalIsSubmitting,
  onCancel,
  submitButtonVariant = 'default',
  showToastOnSuccess = true,
  successMessage,
  disableSubmit = false,
}: FormDialogProps<T>) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [internalIsSubmitting, setInternalIsSubmitting] = useState(false);

  const isSubmitting = externalIsSubmitting ?? internalIsSubmitting;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setInternalIsSubmitting(true);
      
      // Extract form data if it's a form element
      let data: any = {};
      if (e.target instanceof HTMLFormElement) {
        const formData = new FormData(e.target);
        data = Object.fromEntries(formData.entries());
      }
      
      await onSubmit(data as T);
      
      if (showToastOnSuccess) {
        toast({
          title: t('common.success'),
          description: successMessage || t('common.operationSuccessful'),
        });
      }
      
      onOpenChange(false);
    } catch (error) {
      console.error('Form submission error:', error);
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('common.operationFailed'),
        variant: 'destructive',
      });
    } finally {
      setInternalIsSubmitting(false);
    }
  }, [onSubmit, onOpenChange, showToastOnSuccess, successMessage, t, toast]);

  const handleCancel = useCallback(() => {
    if (onCancel) {
      onCancel();
    }
    onOpenChange(false);
  }, [onCancel, onOpenChange]);

  const footer = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={handleCancel}
        disabled={isSubmitting}
      >
        {cancelText || t('common.cancel')}
      </Button>
      <Button
        type="submit"
        variant={submitButtonVariant}
        disabled={isSubmitting || disableSubmit}
        form="dialog-form"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('common.processing')}
          </>
        ) : (
          submitText || t('common.submit')
        )}
      </Button>
    </>
  );

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      trigger={trigger}
      footer={footer}
      className={className}
      size={size}
      loading={isSubmitting}
    >
      <form id="dialog-form" onSubmit={handleSubmit}>
        {children}
      </form>
    </BaseDialog>
  );
}