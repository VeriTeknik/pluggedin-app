'use client';

import { useState } from 'react';
import { FieldValues, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

import { handleError } from '@/lib/error-handler';

interface UseAsyncFormOptions<TData = any> {
  onSuccess?: (data: TData) => void;
  onError?: (error: string) => void;
  successMessage?: string;
  errorMessage?: string;
  showToast?: boolean;
}

/**
 * Hook for handling async form submissions with loading state and error handling
 */
export function useAsyncForm<TFieldValues extends FieldValues, TData = any>(
  form: UseFormReturn<TFieldValues>,
  submitHandler: (data: TFieldValues) => Promise<{ success: boolean; error?: string; data?: TData }>,
  options: UseAsyncFormOptions<TData> = {}
) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const {
    onSuccess,
    onError,
    successMessage = 'Operation completed successfully',
    errorMessage = 'Operation failed',
    showToast = true,
  } = options;

  const handleSubmit = async (data: TFieldValues) => {
    setIsSubmitting(true);
    
    try {
      const result = await submitHandler(data);
      
      if (result.success) {
        if (showToast) {
          toast.success(successMessage);
        }
        if (onSuccess && result.data) {
          onSuccess(result.data);
        }
        // Reset form on success
        form.reset();
      } else {
        const error = result.error || errorMessage;
        if (showToast) {
          toast.error(error);
        }
        if (onError) {
          onError(error);
        }
      }
    } catch (error) {
      const message = handleError(error, { 
        showToast, 
        fallbackMessage: errorMessage 
      });
      if (onError) {
        onError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    handleSubmit: form.handleSubmit(handleSubmit),
    isSubmitting,
  };
}