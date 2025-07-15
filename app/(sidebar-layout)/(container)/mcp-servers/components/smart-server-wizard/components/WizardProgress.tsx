'use client';

import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

import { WizardStep } from '../useWizardState';

interface WizardProgressProps {
  steps: WizardStep[];
  currentStep: number;
  onStepClick?: (stepIndex: number) => void;
}

export function WizardProgress({ steps, currentStep, onStepClick }: WizardProgressProps) {
  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isComplete = step.isComplete;
          const isPast = index < currentStep;
          const canNavigate = isPast || isComplete;

          return (
            <div key={step.id} className="flex-1">
              <div className="relative flex flex-col items-center">
                {/* Progress line */}
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'absolute left-[50%] top-5 h-0.5 w-full',
                      isPast || isComplete ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                )}

                {/* Step circle */}
                <button
                  onClick={() => canNavigate && onStepClick?.(index)}
                  disabled={!canNavigate}
                  className={cn(
                    'relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all',
                    isActive && 'border-primary bg-primary text-primary-foreground',
                    !isActive && isComplete && 'border-primary bg-primary text-primary-foreground',
                    !isActive && !isComplete && isPast && 'border-primary bg-background',
                    !isActive && !isComplete && !isPast && 'border-muted bg-background',
                    canNavigate && 'cursor-pointer hover:scale-110',
                    !canNavigate && 'cursor-not-allowed'
                  )}
                >
                  {isComplete ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </button>

                {/* Step label */}
                <div className="mt-2 text-center">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      isActive && 'text-foreground',
                      !isActive && 'text-muted-foreground'
                    )}
                  >
                    {step.title}
                  </p>
                  {isActive && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}