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
    <div className="w-full py-2 md:py-4">
      {/* Mobile: Vertical layout for better space usage */}
      <div className="block md:hidden">
        <div className="space-y-3">
          {steps.map((step, index) => {
            const isActive = index === currentStep;
            const isComplete = step.isComplete;
            const isPast = index < currentStep;
            const canNavigate = isPast || isComplete;

            return (
              <div key={step.id} className="flex items-center space-x-3">
                {/* Step circle */}
                <button
                  onClick={() => canNavigate && onStepClick?.(index)}
                  disabled={!canNavigate}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all shrink-0',
                    isActive && 'border-primary bg-primary text-primary-foreground',
                    !isActive && isComplete && 'border-primary bg-primary text-primary-foreground',
                    !isActive && !isComplete && isPast && 'border-primary bg-background',
                    !isActive && !isComplete && !isPast && 'border-muted bg-background',
                    canNavigate && 'cursor-pointer hover:scale-110',
                    !canNavigate && 'cursor-not-allowed'
                  )}
                >
                  {isComplete ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-medium">{index + 1}</span>
                  )}
                </button>

                {/* Step label - mobile vertical */}
                <div className="flex-1 min-w-0">
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
                    <p className="text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  )}
                </div>

                {/* Progress indicator - mobile */}
                <div className="flex flex-col items-center space-y-1">
                  {index < steps.length - 1 && (
                    <div
                      className={cn(
                        'w-0.5 h-4',
                        isPast || isComplete ? 'bg-primary' : 'bg-muted'
                      )}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Desktop: Fixed alignment with proper positioning */}
      <div className="hidden md:block">
        <div className="relative">
          {/* Background line container */}
          <div className="absolute top-5 left-0 right-0 flex items-center">
            <div className="flex-1 h-0.5 bg-muted mx-5"></div>
          </div>
          
          {/* Steps container */}
          <div className="relative flex items-start justify-between">
            {steps.map((step, index) => {
              const isActive = index === currentStep;
              const isComplete = step.isComplete;
              const isPast = index < currentStep;
              const canNavigate = isPast || isComplete;

              return (
                <div key={step.id} className="flex-1 flex flex-col items-center relative">
                  {/* Progress line segment */}
                  {index < steps.length - 1 && (
                    <div className="absolute top-5 left-1/2 w-full h-0.5 z-0">
                      <div
                        className={cn(
                          'h-full w-full',
                          isPast || isComplete ? 'bg-primary' : 'bg-muted'
                        )}
                      />
                    </div>
                  )}

                  {/* Step circle */}
                  <button
                    onClick={() => canNavigate && onStepClick?.(index)}
                    disabled={!canNavigate}
                    className={cn(
                      'relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all bg-background',
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
                  <div className="mt-3 text-center max-w-24">
                    <p
                      className={cn(
                        'text-sm font-medium leading-tight',
                        isActive && 'text-foreground',
                        !isActive && 'text-muted-foreground'
                      )}
                    >
                      {step.title}
                    </p>
                    {isActive && (
                      <p className="mt-1 text-xs text-muted-foreground leading-tight">
                        {step.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}