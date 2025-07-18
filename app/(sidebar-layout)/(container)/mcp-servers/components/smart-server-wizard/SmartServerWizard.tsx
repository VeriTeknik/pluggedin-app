'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import { WizardProgress } from './components/WizardProgress';
import { useWizardState } from './useWizardState';
import { ClaimDecisionStep } from './wizard-steps/ClaimDecisionStep';
import { DiscoveryTestStep } from './wizard-steps/DiscoveryTestStep';
import { EnvVarConfigStep } from './wizard-steps/EnvVarConfigStep';
import { GitHubInputStep } from './wizard-steps/GitHubInputStep';
import { RegistrySubmitStep } from './wizard-steps/RegistrySubmitStep';

interface SmartServerWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  currentProfileUuid?: string;
}

export function SmartServerWizard({ open, onOpenChange, onSuccess, currentProfileUuid }: SmartServerWizardProps) {
  const { t } = useTranslation('registry');
  const { toast } = useToast();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const {
    currentStep,
    wizardData,
    steps,
    isSubmitting,
    updateWizardData,
    goToStep,
    goToNextStep,
    goToPreviousStep,
    canGoNext,
    resetWizard,
    setIsSubmitting,
  } = useWizardState();

  const handleClose = useCallback(() => {
    if (isSubmitting) {
      toast({
        title: t('wizard.operationInProgress'),
        description: t('wizard.waitForOperation'),
        variant: 'default',
      });
      return;
    }

    // Show confirmation if user has made progress
    if (currentStep > 0 || wizardData.githubUrl) {
      setShowConfirmDialog(true);
    } else {
      resetWizard();
      onOpenChange(false);
    }
  }, [currentStep, wizardData, isSubmitting, onOpenChange, resetWizard, toast, t]);

  const handleConfirmClose = useCallback(() => {
    resetWizard();
    onOpenChange(false);
    setShowConfirmDialog(false);
  }, [onOpenChange, resetWizard]);

  const handleSuccess = useCallback(() => {
    toast({
      title: t('wizard.success'),
      description: t('wizard.successDescription'),
    });
    resetWizard();
    onOpenChange(false);
    onSuccess?.();
  }, [onOpenChange, onSuccess, resetWizard, toast, t]);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <GitHubInputStep
            data={wizardData}
            onUpdate={updateWizardData}
            onNext={goToNextStep}
          />
        );
      case 1:
        return (
          <ClaimDecisionStep
            data={wizardData}
            onUpdate={updateWizardData}
          />
        );
      case 2:
        return (
          <EnvVarConfigStep
            data={wizardData}
            onUpdate={updateWizardData}
          />
        );
      case 3:
        return (
          <DiscoveryTestStep
            data={wizardData}
            onUpdate={updateWizardData}
          />
        );
      case 4:
        return (
          <RegistrySubmitStep
            data={wizardData}
            onUpdate={updateWizardData}
            onSuccess={handleSuccess}
            setIsSubmitting={setIsSubmitting}
            currentProfileUuid={currentProfileUuid}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{t('wizard.title')}</DialogTitle>
          </DialogHeader>

        {/* Progress indicator */}
        <div className="flex-shrink-0 px-6">
          <WizardProgress
            steps={steps}
            currentStep={currentStep}
            onStepClick={isSubmitting ? undefined : goToStep}
          />
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {renderStep()}
        </div>

        {/* Navigation footer */}
        <div className="flex-shrink-0 border-t px-6 py-4">
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={goToPreviousStep}
              disabled={currentStep === 0 || isSubmitting}
              className={cn(currentStep === 0 && 'invisible')}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              {t('navigation.previous')}
            </Button>

            {currentStep < steps.length - 1 && (
              <Button
                onClick={goToNextStep}
                disabled={!canGoNext() || isSubmitting}
              >
                {t('navigation.next')}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        title={t('wizard.cancelTitle')}
        description={t('wizard.cancelDescription')}
        confirmText={t('wizard.confirmCancel')}
        cancelText={t('wizard.continueButton')}
        onConfirm={handleConfirmClose}
        variant="destructive"
      />
    </>
  );
}