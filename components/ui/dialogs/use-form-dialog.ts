import { useState, useCallback } from 'react';
import { useDialogState, DialogState } from './use-dialog-state';

export interface FormDialogState<T = any> extends DialogState {
  formData: T;
  setFormData: (data: T | ((prev: T) => T)) => void;
  resetForm: () => void;
  isSubmitting: boolean;
  setIsSubmitting: (submitting: boolean) => void;
  handleSubmit: (onSubmit: (data: T) => Promise<void>) => Promise<void>;
}

export function useFormDialog<T = any>(initialData: T): FormDialogState<T> {
  const dialogState = useDialogState();
  const [formData, setFormData] = useState<T>(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setFormData(initialData);
    setIsSubmitting(false);
  }, [initialData]);

  const handleClose = useCallback(() => {
    dialogState.handleClose();
    // Reset form after a short delay to avoid UI flicker
    setTimeout(resetForm, 200);
  }, [dialogState, resetForm]);

  const handleSubmit = useCallback(async (onSubmit: (data: T) => Promise<void>) => {
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      handleClose();
    } catch (error) {
      // Error is handled by the FormDialog component
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, handleClose]);

  return {
    ...dialogState,
    handleClose,
    formData,
    setFormData,
    resetForm,
    isSubmitting,
    setIsSubmitting,
    handleSubmit,
  };
}