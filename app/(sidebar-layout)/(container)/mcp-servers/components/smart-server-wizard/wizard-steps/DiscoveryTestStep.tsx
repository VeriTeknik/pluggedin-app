'use client';

import { WizardData } from '../useWizardState';
import { Button } from '@/components/ui/button';

interface DiscoveryTestStepProps {
  data: WizardData;
  onUpdate: (updates: Partial<WizardData>) => void;
  onNext: () => void;
  setIsSubmitting: (value: boolean) => void;
}

export function DiscoveryTestStep({ data, onUpdate, onNext, setIsSubmitting }: DiscoveryTestStepProps) {
  // TODO: Implement discovery test step
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Test Discovery</h2>
      <p>This step will be implemented next.</p>
      <Button onClick={() => {
        onUpdate({ 
          discoveryResult: { 
            success: true, 
            output: 'Test output',
            tools: [],
            resources: [],
            prompts: []
          } 
        });
        onNext();
      }}>
        Skip Test
      </Button>
    </div>
  );
}