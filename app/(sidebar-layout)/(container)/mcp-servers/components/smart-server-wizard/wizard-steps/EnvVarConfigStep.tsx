'use client';

import { WizardData } from '../useWizardState';
import { Button } from '@/components/ui/button';

interface EnvVarConfigStepProps {
  data: WizardData;
  onUpdate: (updates: Partial<WizardData>) => void;
  onNext: () => void;
}

export function EnvVarConfigStep({ data, onUpdate, onNext }: EnvVarConfigStepProps) {
  // TODO: Implement environment variable configuration step
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Environment Variables</h2>
      <p>This step will be implemented next.</p>
      <Button onClick={() => {
        onUpdate({ configuredEnvVars: {} });
        onNext();
      }}>
        Continue (No Variables)
      </Button>
    </div>
  );
}