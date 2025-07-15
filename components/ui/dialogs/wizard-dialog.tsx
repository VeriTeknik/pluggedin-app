'use client';

import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import React, { useCallback,useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

import { BaseDialog, BaseDialogProps } from './base-dialog';

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  content: React.ReactNode;
  isValid?: () => boolean;
  onNext?: () => Promise<boolean>;
}

export interface WizardDialogProps extends Omit<BaseDialogProps, 'footer' | 'children'> {
  steps: WizardStep[];
  currentStep?: number;
  onStepChange?: (step: number) => void;
  onComplete: () => Promise<void>;
  showProgress?: boolean;
  allowSkip?: boolean;
  completeText?: string;
}

export function WizardDialog({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  className,
  size = 'lg',
  steps,
  currentStep: externalCurrentStep,
  onStepChange,
  onComplete,
  showProgress = true,
  allowSkip = false,
  completeText,
}: WizardDialogProps) {
  const { t } = useTranslation();
  const [internalCurrentStep, setInternalCurrentStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const currentStep = externalCurrentStep ?? internalCurrentStep;
  const activeStep = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;
  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleStepChange = useCallback((newStep: number) => {
    if (onStepChange) {
      onStepChange(newStep);
    } else {
      setInternalCurrentStep(newStep);
    }
  }, [onStepChange]);

  const handleNext = useCallback(async () => {
    if (activeStep.onNext) {
      setIsProcessing(true);
      try {
        const canProceed = await activeStep.onNext();
        if (!canProceed) {
          return;
        }
      } catch (error) {
        console.error('Error in step validation:', error);
        return;
      } finally {
        setIsProcessing(false);
      }
    }

    if (isLastStep) {
      setIsProcessing(true);
      try {
        await onComplete();
        onOpenChange(false);
      } catch (error) {
        console.error('Error completing wizard:', error);
      } finally {
        setIsProcessing(false);
      }
    } else {
      handleStepChange(currentStep + 1);
    }
  }, [activeStep, isLastStep, currentStep, handleStepChange, onComplete, onOpenChange]);

  const handlePrevious = useCallback(() => {
    if (!isFirstStep) {
      handleStepChange(currentStep - 1);
    }
  }, [isFirstStep, currentStep, handleStepChange]);

  const handleSkip = useCallback(() => {
    if (allowSkip && !isLastStep) {
      handleStepChange(currentStep + 1);
    }
  }, [allowSkip, isLastStep, currentStep, handleStepChange]);

  const isNextDisabled = activeStep.isValid ? !activeStep.isValid() : false;

  const footer = (
    <div className="flex items-center justify-between w-full">
      <Button
        type="button"
        variant="outline"
        onClick={handlePrevious}
        disabled={isFirstStep || isProcessing}
      >
        <ChevronLeft className="mr-2 h-4 w-4" />
        {t('common.previous')}
      </Button>

      <div className="flex gap-2">
        {allowSkip && !isLastStep && (
          <Button
            type="button"
            variant="ghost"
            onClick={handleSkip}
            disabled={isProcessing}
          >
            {t('common.skip')}
          </Button>
        )}
        
        <Button
          type="button"
          onClick={handleNext}
          disabled={isNextDisabled || isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('common.processing')}
            </>
          ) : isLastStep ? (
            completeText || t('common.complete')
          ) : (
            <>
              {t('common.next')}
              <ChevronRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );

  const wizardTitle = activeStep.title || title;
  const wizardDescription = activeStep.description || description;

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title={wizardTitle}
      description={wizardDescription}
      trigger={trigger}
      footer={footer}
      className={cn('wizard-dialog', className)}
      size={size}
      loading={isProcessing}
    >
      {showProgress && (
        <div className="mb-6">
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-muted-foreground mt-2">
            {t('common.stepProgress', { current: currentStep + 1, total: steps.length })}
          </p>
        </div>
      )}

      <div className="wizard-content">
        {activeStep.content}
      </div>
    </BaseDialog>
  );
}