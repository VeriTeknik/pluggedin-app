'use client';

import { Button } from '@/components/ui/button';

import { WizardData } from '../useWizardState';

interface RegistrySubmitStepProps {
  data: WizardData;
  onUpdate: (updates: Partial<WizardData>) => void;
  onSuccess: () => void;
  setIsSubmitting: (value: boolean) => void;
}

export function RegistrySubmitStep({ data, onUpdate, onSuccess, setIsSubmitting }: RegistrySubmitStepProps) {
  // TODO: Implement registry submission step
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Submit to Registry</h2>
      <p>This step will be implemented next.</p>
      <Button onClick={() => {
        onUpdate({ 
          submissionResult: { 
            success: true, 
            serverId: 'test-id' 
          } 
        });
        onSuccess();
      }}>
        Complete Wizard
      </Button>
    </div>
  );
}