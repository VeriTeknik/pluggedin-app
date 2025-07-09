'use client';

import { useCallback,useState } from 'react';

export interface WizardData {
  // Step 1: GitHub Input
  githubUrl?: string;
  owner?: string;
  repo?: string;
  repoInfo?: {
    name: string;
    description?: string;
    private: boolean;
    defaultBranch: string;
    language?: string;
    stars: number;
  };

  // Step 2: Claim Decision
  willClaim?: boolean;
  isAuthenticated?: boolean;
  githubUsername?: string;
  ownershipVerified?: boolean;

  // Step 3: Environment Variables
  detectedEnvVars?: Array<{
    name: string;
    description?: string;
    defaultValue?: string;
    required: boolean;
    source: 'readme' | 'env-example' | 'code' | 'manual' | 'registry';
  }>;
  configuredEnvVars?: Record<string, string>;

  // Step 4: Discovery Test
  selectedTransports?: Array<'stdio' | 'sse' | 'streamable-http' | 'docker'>;
  transportConfigs?: {
    [transport: string]: {
      command?: string;
      args?: string[];
      url?: string;
      headers?: Record<string, string>;
      dockerImage?: string;
      dockerPorts?: string[];
      dockerVolumes?: string[];
      env?: Record<string, string>;
      packageName?: string;
      confidence?: number;
      source?: string;
    };
  };
  discoveryResult?: {
    success: boolean;
    output: string;
    tools?: Array<{ name: string; description?: string }>;
    resources?: Array<{ uri: string; name: string }>;
    prompts?: Array<{ name: string; description?: string }>;
    error?: string;
  };
  serverConfig?: {
    command?: string;
    args?: string[];
    url?: string;
    type: 'STDIO' | 'STREAMABLE_HTTP';
  };

  // Step 5: Registry Submission
  serverMetadata?: {
    name: string;
    description: string;
    categories: string[];
    tags: string[];
    icon?: string;
  };
  registryData?: {
    name: string;
    description: string;
    author: string;
    tags: string[];
    packages?: Array<{
      transport: string;
      type: 'npm' | 'pypi' | 'docker' | 'github';
      name: string;
      command?: string;
      url?: string;
      environment_variables?: Array<{
        name: string;
        description: string;
        is_required: boolean;
        is_secret?: boolean;
        default?: string;
      }>;
    }>;
  };
  submissionResult?: {
    success: boolean;
    serverId?: string;
    error?: string;
  };
}

export interface WizardStep {
  id: string;
  title: string;
  description: string;
  isComplete: boolean;
  isActive: boolean;
}

export function useWizardState() {
  const [currentStep, setCurrentStep] = useState(0);
  const [wizardData, setWizardData] = useState<WizardData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const steps: WizardStep[] = [
    {
      id: 'github-input',
      title: 'GitHub Repository',
      description: 'Enter the GitHub repository URL',
      isComplete: !!wizardData.githubUrl && !!wizardData.repoInfo,
      isActive: currentStep === 0,
    },
    {
      id: 'claim-decision',
      title: 'Ownership',
      description: 'Claim this server or add to community',
      isComplete: wizardData.willClaim !== undefined && 
                  (wizardData.willClaim === false || 
                   (wizardData.willClaim === true && wizardData.isAuthenticated === true && wizardData.ownershipVerified === true)),
      isActive: currentStep === 1,
    },
    {
      id: 'env-config',
      title: 'Configuration',
      description: 'Configure environment variables',
      isComplete: wizardData.configuredEnvVars !== undefined && 
                  (!wizardData.detectedEnvVars || 
                   wizardData.detectedEnvVars.filter(v => v.required).every(v => 
                     wizardData.configuredEnvVars![v.name] && 
                     wizardData.configuredEnvVars![v.name].trim() !== ''
                   )),
      isActive: currentStep === 2,
    },
    {
      id: 'discovery-test',
      title: 'Test Discovery',
      description: 'Test server discovery and capabilities',
      isComplete: !!wizardData.discoveryResult?.success,
      isActive: currentStep === 3,
    },
    {
      id: 'registry-submit',
      title: 'Submit',
      description: 'Submit to the registry',
      isComplete: !!wizardData.submissionResult?.success,
      isActive: currentStep === 4,
    },
  ];

  const updateWizardData = useCallback((updates: Partial<WizardData>) => {
    setWizardData((prev) => ({ ...prev, ...updates }));
  }, []);

  const goToStep = useCallback((stepIndex: number) => {
    if (stepIndex >= 0 && stepIndex < steps.length) {
      setCurrentStep(stepIndex);
    }
  }, [steps.length]);

  const goToNextStep = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep, steps.length]);

  const goToPreviousStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const canGoNext = useCallback(() => {
    const step = steps[currentStep];
    return step?.isComplete || false;
  }, [currentStep, steps]);

  const resetWizard = useCallback(() => {
    setCurrentStep(0);
    setWizardData({});
    setIsSubmitting(false);
  }, []);

  return {
    // State
    currentStep,
    wizardData,
    steps,
    isSubmitting,

    // Actions
    updateWizardData,
    goToStep,
    goToNextStep,
    goToPreviousStep,
    canGoNext,
    resetWizard,
    setIsSubmitting,
  };
}