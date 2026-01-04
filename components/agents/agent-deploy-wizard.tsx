'use client';

import {
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  DollarSign,
  Eye,
  Globe,
  Info,
  Lock,
  Rocket,
  Star,
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  ConfigField,
  ConfigValues,
  ModelRouterModel,
  TemplateConfigurable,
} from '@/lib/agent-config';
import { validateConfigValues } from '@/lib/agent-config';
import { isValidImageUrl, validateAgentName } from '@/lib/pap-ui-utils';

interface AgentDeployWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: {
    uuid: string;
    namespace: string;
    name: string;
    display_name: string;
    version: string;
    icon_url?: string;
  };
  configurable: TemplateConfigurable | null;
  onDeploy: (data: {
    name: string;
    accessLevel: string;
    configValues: ConfigValues;
  }) => Promise<void>;
  isDeploying: boolean;
}

interface WizardStep {
  id: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  fieldKey?: string; // For config field steps
}

// Format price for display
function formatPrice(pricePerMillion: number, freeLabel: string = 'Free'): string {
  if (pricePerMillion === 0) return freeLabel;
  if (pricePerMillion < 0.01) return `$${pricePerMillion.toFixed(4)}`;
  if (pricePerMillion < 1) return `$${pricePerMillion.toFixed(3)}`;
  return `$${pricePerMillion.toFixed(2)}`;
}

// Get provider badge color
function getProviderColor(provider: string): string {
  const colors: Record<string, string> = {
    anthropic: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    openai: 'bg-green-500/10 text-green-500 border-green-500/20',
    google: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    xai: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    deepseek: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  };
  return colors[provider.toLowerCase()] || 'bg-muted text-muted-foreground';
}

export function AgentDeployWizard({
  open,
  onOpenChange,
  template,
  configurable,
  onDeploy,
  isDeploying,
}: AgentDeployWizardProps) {
  const { t } = useTranslation('agents');

  // Wizard state
  const [currentStep, setCurrentStep] = useState(0);

  // Form state
  const [agentName, setAgentName] = useState('');
  const [accessLevel, setAccessLevel] = useState('PRIVATE');
  const [configValues, setConfigValues] = useState<ConfigValues>({});

  // Model loading state
  const [models, setModels] = useState<ModelRouterModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Build wizard steps dynamically
  const steps: WizardStep[] = useMemo(() => {
    const wizardSteps: WizardStep[] = [
      {
        id: 'identity',
        title: t('deployWizard.steps.identity.title'),
        description: t('deployWizard.steps.identity.description'),
        icon: <Zap className="h-4 w-4" />,
      },
    ];

    // Add one step per configurable field
    if (configurable) {
      Object.entries(configurable).forEach(([fieldKey, field]) => {
        wizardSteps.push({
          id: `config-${fieldKey}`,
          title: field.ui?.label || fieldKey,
          description: field.ui?.description,
          icon: <Box className="h-4 w-4" />,
          fieldKey,
        });
      });
    }

    // Add review step
    wizardSteps.push({
      id: 'review',
      title: t('deployWizard.steps.review.title'),
      description: t('deployWizard.steps.review.description'),
      icon: <Rocket className="h-4 w-4" />,
    });

    return wizardSteps;
  }, [configurable, t]);

  // Load models when wizard opens and we have model-router fields
  useEffect(() => {
    if (!open) return;

    const hasModelRouterField =
      configurable &&
      Object.values(configurable).some((f) => f.source === 'model-router');

    if (hasModelRouterField && models.length === 0) {
      setLoadingModels(true);
      fetch('/api/model-router/models')
        .then((res) => res.json())
        .then((data) => {
          if (data.data) {
            setModels(data.data);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingModels(false));
    }
  }, [open, configurable, models.length]);

  // Initialize default values when configurable changes
  useEffect(() => {
    if (configurable) {
      const defaults: ConfigValues = {};
      Object.entries(configurable).forEach(([key, field]) => {
        if (field.default !== undefined) {
          defaults[key] = field.default;
        }
      });
      setConfigValues(defaults);
    }
  }, [configurable]);

  // Reset wizard when closed
  useEffect(() => {
    if (!open) {
      setCurrentStep(0);
      setAgentName('');
      setAccessLevel('PRIVATE');
      setConfigValues({});
    }
  }, [open]);

  // Validation
  const nameError = validateAgentName(agentName);

  const isCurrentStepValid = useCallback(() => {
    const step = steps[currentStep];

    if (step.id === 'identity') {
      return agentName.length > 0 && !nameError;
    }

    if (step.fieldKey && configurable) {
      const field = configurable[step.fieldKey];
      const value = configValues[step.fieldKey];

      if (field.required && (value === undefined || value === null || value === '')) {
        return false;
      }

      // Multi-select validation
      if (field.type === 'multi-select' && field.multi_select_constraints) {
        const arr = Array.isArray(value) ? value : [];
        const { min, max } = field.multi_select_constraints;
        if (min !== undefined && arr.length < min) return false;
        if (max !== undefined && arr.length > max) return false;
      }

      // Number validation
      if (field.type === 'number' || field.type === 'slider') {
        const num = typeof value === 'number' ? value : parseFloat(value);
        if (isNaN(num)) return !field.required;
        const constraints = field.number_constraints;
        if (constraints) {
          if (constraints.min !== undefined && num < constraints.min) return false;
          if (constraints.max !== undefined && num > constraints.max) return false;
        }
      }
    }

    return true;
  }, [currentStep, steps, agentName, nameError, configurable, configValues]);

  // Navigation
  const goNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleDeploy = async () => {
    await onDeploy({
      name: agentName,
      accessLevel,
      configValues,
    });
  };

  // Render field input based on type
  const renderFieldStep = (fieldKey: string, field: ConfigField) => {
    const value = configValues[fieldKey];

    // Model selection with pricing table
    if (field.source === 'model-router') {
      return renderModelSelection(fieldKey, field);
    }

    switch (field.type) {
      case 'select':
        return (
          <div className="space-y-4">
            <Label className="text-base">{field.ui?.label || fieldKey}</Label>
            {field.ui?.description && (
              <p className="text-sm text-muted-foreground">{field.ui.description}</p>
            )}
            <Select
              value={String(value ?? '')}
              onValueChange={(v) => setConfigValues({ ...configValues, [fieldKey]: v })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={field.ui?.placeholder || t('deployWizard.select.placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {field.options?.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                    {opt.description && (
                      <span className="text-muted-foreground ml-2">- {opt.description}</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 'multi-select':
        return (
          <div className="space-y-4">
            <Label className="text-base">{field.ui?.label || fieldKey}</Label>
            {field.ui?.description && (
              <p className="text-sm text-muted-foreground">{field.ui.description}</p>
            )}
            {field.multi_select_constraints && (
              <p className="text-xs text-muted-foreground">
                {t('deployWizard.multiSelect.selectRange', {
                  min: field.multi_select_constraints.min || 0,
                  max: field.multi_select_constraints.max || '∞',
                })}
              </p>
            )}
            <div className="grid gap-2 max-h-60 overflow-y-auto">
              {field.options?.map((opt) => {
                const selected = Array.isArray(value) && value.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-muted hover:border-muted-foreground/30'
                    }`}
                  >
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) => {
                        const arr = Array.isArray(value) ? [...value] : [];
                        if (checked) {
                          arr.push(opt.value);
                        } else {
                          const idx = arr.indexOf(opt.value);
                          if (idx > -1) arr.splice(idx, 1);
                        }
                        setConfigValues({ ...configValues, [fieldKey]: arr });
                      }}
                    />
                    <div>
                      <div className="font-medium">{opt.label}</div>
                      {opt.description && (
                        <div className="text-xs text-muted-foreground">{opt.description}</div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        );

      case 'slider':
      case 'number':
        const constraints = field.number_constraints || {};
        const numValue = typeof value === 'number' ? value : (field.default as number) ?? constraints.min ?? 0;
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-base">{field.ui?.label || fieldKey}</Label>
              {field.ui?.description && (
                <p className="text-sm text-muted-foreground mt-1">{field.ui.description}</p>
              )}
            </div>
            {field.type === 'slider' ? (
              <div className="space-y-4">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{constraints.min ?? 0}</span>
                  <span className="font-mono text-lg text-foreground">{numValue}</span>
                  <span>{constraints.max ?? 100}</span>
                </div>
                <Slider
                  value={[numValue]}
                  min={constraints.min ?? 0}
                  max={constraints.max ?? 100}
                  step={constraints.step ?? 0.01}
                  onValueChange={([v]) => setConfigValues({ ...configValues, [fieldKey]: v })}
                  className="w-full"
                />
              </div>
            ) : (
              <Input
                type="number"
                value={numValue}
                min={constraints.min}
                max={constraints.max}
                step={constraints.step}
                onChange={(e) =>
                  setConfigValues({ ...configValues, [fieldKey]: parseFloat(e.target.value) })
                }
                className="w-full"
              />
            )}
          </div>
        );

      case 'boolean':
        return (
          <div className="space-y-4">
            <Label className="text-base">{field.ui?.label || fieldKey}</Label>
            {field.ui?.description && (
              <p className="text-sm text-muted-foreground">{field.ui.description}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfigValues({ ...configValues, [fieldKey]: true })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  value === true
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <Check className={`h-5 w-5 mx-auto mb-2 ${value === true ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="font-medium">{t('deployWizard.boolean.yes')}</div>
              </button>
              <button
                type="button"
                onClick={() => setConfigValues({ ...configValues, [fieldKey]: false })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  value === false
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <div className={`h-5 w-5 mx-auto mb-2 border-2 rounded ${value === false ? 'border-primary' : 'border-muted-foreground'}`} />
                <div className="font-medium">{t('deployWizard.boolean.no')}</div>
              </button>
            </div>
          </div>
        );

      case 'text':
        return (
          <div className="space-y-4">
            <Label className="text-base">{field.ui?.label || fieldKey}</Label>
            {field.ui?.description && (
              <p className="text-sm text-muted-foreground">{field.ui.description}</p>
            )}
            <Input
              value={String(value ?? '')}
              placeholder={field.ui?.placeholder}
              onChange={(e) => setConfigValues({ ...configValues, [fieldKey]: e.target.value })}
            />
          </div>
        );

      case 'textarea':
        return (
          <div className="space-y-4">
            <Label className="text-base">{field.ui?.label || fieldKey}</Label>
            {field.ui?.description && (
              <p className="text-sm text-muted-foreground">{field.ui.description}</p>
            )}
            <Textarea
              value={String(value ?? '')}
              placeholder={field.ui?.placeholder}
              rows={5}
              onChange={(e) => setConfigValues({ ...configValues, [fieldKey]: e.target.value })}
            />
          </div>
        );

      default:
        return (
          <div className="space-y-4">
            <Label className="text-base">{field.ui?.label || fieldKey}</Label>
            <Input
              value={String(value ?? '')}
              onChange={(e) => setConfigValues({ ...configValues, [fieldKey]: e.target.value })}
            />
          </div>
        );
    }
  };

  // Model selection with full pricing table
  const renderModelSelection = (fieldKey: string, field: ConfigField) => {
    const isMulti = field.type === 'multi-select';
    const selectedValues = Array.isArray(configValues[fieldKey])
      ? configValues[fieldKey]
      : configValues[fieldKey]
      ? [configValues[fieldKey]]
      : [];
    const constraints = field.multi_select_constraints;

    if (loadingModels) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      );
    }

    // Group models by provider
    const groupedModels = models.reduce((acc, model) => {
      const provider = model.provider || 'other';
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(model);
      return acc;
    }, {} as Record<string, ModelRouterModel[]>);

    return (
      <div className="space-y-4">
        <div>
          <Label className="text-base">{field.ui?.label || t('deployWizard.modelSelection.title')}</Label>
          {field.ui?.description && (
            <p className="text-sm text-muted-foreground mt-1">{field.ui.description}</p>
          )}
          {isMulti && constraints && (
            <p className="text-xs text-muted-foreground mt-2">
              {t('deployWizard.modelSelection.selected', {
                count: selectedValues.length,
                min: constraints.min || 0,
                max: constraints.max || '∞',
              })}
            </p>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pb-2 border-b">
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
            <span>{t('deployWizard.modelSelection.legend.featured')}</span>
          </div>
          <div className="flex items-center gap-1">
            <Eye className="h-3 w-3 text-blue-500" />
            <span>{t('deployWizard.modelSelection.legend.vision')}</span>
          </div>
          <div className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            <span>{t('deployWizard.modelSelection.legend.price')}</span>
          </div>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-6">
            {Object.entries(groupedModels).map(([provider, providerModels]) => (
              <div key={provider}>
                <div className="sticky top-0 bg-background py-2 z-10">
                  <Badge variant="outline" className={getProviderColor(provider)}>
                    {provider.charAt(0).toUpperCase() + provider.slice(1)}
                  </Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>{t('deployWizard.modelSelection.table.model')}</TableHead>
                      <TableHead className="text-right">{t('deployWizard.modelSelection.table.input')}</TableHead>
                      <TableHead className="text-right">{t('deployWizard.modelSelection.table.output')}</TableHead>
                      <TableHead className="w-16 text-center">{t('deployWizard.modelSelection.table.features')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providerModels.map((model) => {
                      const isSelected = selectedValues.includes(model.id);
                      return (
                        <TableRow
                          key={model.id}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                          onClick={() => {
                            if (isMulti) {
                              const arr = [...selectedValues];
                              if (isSelected) {
                                const idx = arr.indexOf(model.id);
                                if (idx > -1) arr.splice(idx, 1);
                              } else {
                                if (!constraints?.max || arr.length < constraints.max) {
                                  arr.push(model.id);
                                }
                              }
                              setConfigValues({ ...configValues, [fieldKey]: arr });
                            } else {
                              setConfigValues({ ...configValues, [fieldKey]: model.id });
                            }
                          }}
                        >
                          <TableCell>
                            <Checkbox checked={isSelected} />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{model.name}</span>
                              <span className="text-xs text-muted-foreground font-mono">
                                {model.id}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {model.pricing ? formatPrice(model.pricing.input) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {model.pricing ? formatPrice(model.pricing.output) : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              {model.is_featured && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                    </TooltipTrigger>
                                    <TooltipContent>{t('deployWizard.tooltips.featured')}</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {model.supports_vision && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Eye className="h-4 w-4 text-blue-500" />
                                    </TooltipTrigger>
                                    <TooltipContent>{t('deployWizard.tooltips.vision')}</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Selected models summary */}
        {selectedValues.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-muted/50 border">
            <div className="text-sm font-medium mb-2">{t('deployWizard.modelSelection.selectedModels', { count: selectedValues.length })}</div>
            <div className="flex flex-wrap gap-2">
              {selectedValues.map((id: string) => {
                const model = models.find((m) => m.id === id);
                return (
                  <Badge key={id} variant="secondary" className="gap-1">
                    {model?.name || id}
                    <button
                      type="button"
                      className="ml-1 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        const arr = selectedValues.filter((v: string) => v !== id);
                        setConfigValues({ ...configValues, [fieldKey]: arr });
                      }}
                    >
                      ×
                    </button>
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render identity step
  const renderIdentityStep = () => (
    <div className="space-y-6">
      {/* Agent Name */}
      <div className="space-y-3">
        <Label htmlFor="agentName" className="text-base">
          {t('deployWizard.form.agentName.label')}
        </Label>
        <Input
          id="agentName"
          placeholder={t('deployWizard.form.agentName.placeholder')}
          value={agentName}
          onChange={(e) =>
            setAgentName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
          }
          maxLength={63}
          className={`text-lg ${nameError ? 'border-destructive' : ''}`}
        />
        {nameError ? (
          <p className="text-sm text-destructive">{nameError}</p>
        ) : agentName ? (
          <div className="flex items-center gap-2 text-sm text-primary bg-primary/5 p-3 rounded-lg border border-primary/20">
            <Globe className="h-4 w-4" />
            <span className="font-mono">{t('deployWizard.form.agentName.urlPreview', { name: agentName })}</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('deployWizard.form.agentName.hint')}
          </p>
        )}
      </div>

      {/* Access Level */}
      <div className="space-y-3">
        <Label className="text-base">{t('deployWizard.form.accessControl.label')}</Label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setAccessLevel('PRIVATE')}
            className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all ${
              accessLevel === 'PRIVATE'
                ? 'border-primary bg-primary/5'
                : 'border-muted hover:border-muted-foreground/30'
            }`}
          >
            <Lock
              className={`h-6 w-6 ${
                accessLevel === 'PRIVATE' ? 'text-primary' : 'text-muted-foreground'
              }`}
            />
            <div className="text-center">
              <div className="font-medium">{t('deployWizard.form.accessControl.private.title')}</div>
              <div className="text-xs text-muted-foreground">{t('deployWizard.form.accessControl.private.description')}</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setAccessLevel('PUBLIC')}
            className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-all ${
              accessLevel === 'PUBLIC'
                ? 'border-primary bg-primary/5'
                : 'border-muted hover:border-muted-foreground/30'
            }`}
          >
            <Globe
              className={`h-6 w-6 ${
                accessLevel === 'PUBLIC' ? 'text-primary' : 'text-muted-foreground'
              }`}
            />
            <div className="text-center">
              <div className="font-medium">{t('deployWizard.form.accessControl.public.title')}</div>
              <div className="text-xs text-muted-foreground">{t('deployWizard.form.accessControl.public.description')}</div>
            </div>
          </button>
        </div>
        {accessLevel === 'PUBLIC' && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <Info className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-yellow-700 dark:text-yellow-500">
              {t('deployWizard.form.accessControl.public.warning')}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  // Render review step
  const renderReviewStep = () => {
    // Calculate estimated cost if we have model pricing
    const selectedModelIds = configurable
      ? Object.entries(configurable)
          .filter(([, field]) => field.source === 'model-router')
          .flatMap(([key]) => {
            const val = configValues[key];
            return Array.isArray(val) ? val : val ? [val] : [];
          })
      : [];

    const selectedModels = models.filter((m) => selectedModelIds.includes(m.id));
    const avgInputPrice =
      selectedModels.length > 0
        ? selectedModels.reduce((sum, m) => sum + (m.pricing?.input || 0), 0) / selectedModels.length
        : 0;
    const avgOutputPrice =
      selectedModels.length > 0
        ? selectedModels.reduce((sum, m) => sum + (m.pricing?.output || 0), 0) / selectedModels.length
        : 0;

    return (
      <div className="space-y-6">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Rocket className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold">{t('deployWizard.review.readyTitle')}</h3>
          <p className="text-muted-foreground">{t('deployWizard.review.readyDescription')}</p>
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          {/* Agent Info */}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('deployWizard.review.agentName')}</span>
            <span className="font-mono font-medium">{agentName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('deployWizard.review.url')}</span>
            <span className="font-mono text-sm text-primary">{t('deployWizard.form.agentName.urlPreview', { name: agentName })}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('deployWizard.review.access')}</span>
            <Badge variant={accessLevel === 'PUBLIC' ? 'secondary' : 'outline'}>
              {accessLevel === 'PUBLIC' ? (
                <>
                  <Globe className="h-3 w-3 mr-1" /> {t('deployWizard.form.accessControl.public.title')}
                </>
              ) : (
                <>
                  <Lock className="h-3 w-3 mr-1" /> {t('deployWizard.form.accessControl.private.title')}
                </>
              )}
            </Badge>
          </div>

          {/* Config values */}
          {configurable &&
            Object.entries(configurable).map(([key, field]) => {
              const value = configValues[key];
              let displayValue = '-';

              if (Array.isArray(value)) {
                if (field.source === 'model-router') {
                  displayValue = value
                    .map((id) => models.find((m) => m.id === id)?.name || id)
                    .join(', ');
                } else {
                  displayValue = value.join(', ');
                }
              } else if (typeof value === 'boolean') {
                displayValue = value ? t('deployWizard.boolean.yes') : t('deployWizard.boolean.no');
              } else if (value !== undefined && value !== null) {
                if (field.source === 'model-router') {
                  displayValue = models.find((m) => m.id === value)?.name || String(value);
                } else {
                  displayValue = String(value);
                }
              }

              return (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{field.ui?.label || key}</span>
                  <span className="font-medium truncate max-w-[200px]" title={displayValue}>
                    {displayValue}
                  </span>
                </div>
              );
            })}
        </div>

        {/* Cost estimate */}
        {selectedModels.length > 0 && (avgInputPrice > 0 || avgOutputPrice > 0) && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-4 w-4 text-blue-500" />
              <span className="font-medium">{t('deployWizard.review.estimatedCost.title')}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">{t('deployWizard.review.estimatedCost.avgInput')}</div>
                <div className="font-mono">{formatPrice(avgInputPrice, t('deployWizard.pricing.free'))}{t('deployWizard.review.estimatedCost.perMillion')}</div>
              </div>
              <div>
                <div className="text-muted-foreground">{t('deployWizard.review.estimatedCost.avgOutput')}</div>
                <div className="font-mono">{formatPrice(avgOutputPrice, t('deployWizard.pricing.free'))}{t('deployWizard.review.estimatedCost.perMillion')}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Current step content
  const currentStepData = steps[currentStep];
  const isModelStep =
    currentStepData.fieldKey &&
    configurable?.[currentStepData.fieldKey]?.source === 'model-router';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={isModelStep ? 'max-w-4xl' : 'max-w-2xl'}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            {isValidImageUrl(template.icon_url) ? (
              <img
                src={template.icon_url}
                alt=""
                className="w-10 h-10 rounded-lg object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                <Box className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div>
              <DialogTitle>{t('deployWizard.title', { name: template.display_name })}</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                v{template.version} by {template.namespace}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 py-2 overflow-x-auto">
          {steps.map((step, idx) => (
            <React.Fragment key={step.id}>
              <button
                type="button"
                disabled={idx > currentStep}
                onClick={() => idx < currentStep && setCurrentStep(idx)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  idx === currentStep
                    ? 'bg-primary text-primary-foreground'
                    : idx < currentStep
                    ? 'bg-primary/20 text-primary hover:bg-primary/30 cursor-pointer'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {idx < currentStep ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span className="w-4 h-4 flex items-center justify-center rounded-full bg-current/10">
                    {idx + 1}
                  </span>
                )}
                {step.title}
              </button>
              {idx < steps.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        <div className="py-4 min-h-[300px]">
          {currentStepData.id === 'identity' && renderIdentityStep()}
          {currentStepData.id === 'review' && renderReviewStep()}
          {currentStepData.fieldKey &&
            configurable &&
            renderFieldStep(currentStepData.fieldKey, configurable[currentStepData.fieldKey])}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {currentStep > 0 && (
            <Button variant="outline" onClick={goBack} disabled={isDeploying}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('deployWizard.buttons.back')}
            </Button>
          )}
          <div className="flex-1" />
          {currentStep < steps.length - 1 ? (
            <Button onClick={goNext} disabled={!isCurrentStepValid()}>
              {t('deployWizard.buttons.next')}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleDeploy}
              disabled={!isCurrentStepValid() || isDeploying}
              className="gap-2"
            >
              {isDeploying ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t('deployWizard.buttons.deploying')}
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  {t('deployWizard.buttons.deploy')}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
