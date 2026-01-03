'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import type {
  TemplateConfigurable,
  ConfigValues,
  ConfigField,
  FieldOption,
} from '@/lib/agent-config';
import {
  validateConfigValues,
  modelsToFieldOptions,
  getDefaultConfigValues,
} from '@/lib/agent-config';

interface AgentConfigFormProps {
  configurable: TemplateConfigurable;
  initialValues?: ConfigValues;
  onChange?: (values: ConfigValues, isValid: boolean) => void;
  className?: string;
}

export function AgentConfigForm({
  configurable,
  initialValues,
  onChange,
  className,
}: AgentConfigFormProps) {
  const [configValues, setConfigValues] = useState<ConfigValues>(() => {
    const defaults = getDefaultConfigValues(configurable);
    return { ...defaults, ...initialValues };
  });

  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [loadingOptions, setLoadingOptions] = useState<Record<string, boolean>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, FieldOption[]>>({});

  // Load dynamic options (e.g., from model-router)
  useEffect(() => {
    const loadDynamicOptions = async () => {
      for (const [fieldKey, field] of Object.entries(configurable)) {
        if (field.source === 'model-router') {
          setLoadingOptions((prev) => ({ ...prev, [fieldKey]: true }));

          try {
            // Use proxy endpoint to avoid CORS issues
            const response = await fetch('/api/model-router/models');
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            const models = data.data || [];
            const options = modelsToFieldOptions(models);
            setDynamicOptions((prev) => ({ ...prev, [fieldKey]: options }));
          } catch (error) {
            console.error(`Failed to load options for ${fieldKey}:`, error);
          } finally {
            setLoadingOptions((prev) => ({ ...prev, [fieldKey]: false }));
          }
        }
      }
    };

    loadDynamicOptions();
  }, [configurable]);

  // Validate and notify parent of changes
  useEffect(() => {
    const validation = validateConfigValues(configurable, configValues);
    setErrors(validation.errors || {});
    onChange?.(configValues, validation.valid);
  }, [configValues, configurable, onChange]);

  const handleValueChange = (fieldKey: string, value: any) => {
    setConfigValues((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const renderField = (fieldKey: string, field: ConfigField) => {
    const value = configValues[fieldKey];
    const fieldErrors = errors[fieldKey];
    const isLoading = loadingOptions[fieldKey];

    // Get options (either static or dynamic)
    const options = field.source === 'static' ? field.options : dynamicOptions[fieldKey];

    // Check dependencies
    if (field.depends_on) {
      const dependentValue = configValues[field.depends_on.field];
      if (dependentValue !== field.depends_on.value) {
        return null; // Hide field if dependency not met
      }
    }

    return (
      <div key={fieldKey} className="space-y-2">
        <Label htmlFor={fieldKey}>
          {field.ui.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>

        {field.ui.description && (
          <p className="text-sm text-muted-foreground">{field.ui.description}</p>
        )}

        {/* Render different field types */}
        {renderFieldInput(fieldKey, field, value, options, isLoading)}

        {field.ui.help_text && (
          <p className="text-xs text-muted-foreground">{field.ui.help_text}</p>
        )}

        {fieldErrors && fieldErrors.length > 0 && (
          <div className="text-sm text-red-500">
            {fieldErrors.map((error, idx) => (
              <div key={idx}>{error}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderFieldInput = (
    fieldKey: string,
    field: ConfigField,
    value: any,
    options?: FieldOption[],
    isLoading?: boolean
  ) => {
    if (isLoading) {
      return (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading options...</span>
        </div>
      );
    }

    switch (field.type) {
      case 'select': {
        return (
          <Select
            value={value}
            onValueChange={(newValue) => handleValueChange(fieldKey, newValue)}
          >
            <SelectTrigger id={fieldKey}>
              <SelectValue placeholder={field.ui.placeholder || 'Select an option'} />
            </SelectTrigger>
            <SelectContent>
              {options?.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                >
                  {option.label}
                  {option.description && (
                    <span className="text-xs text-muted-foreground ml-2">
                      {option.description}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      case 'multi-select': {
        const selectedValues = Array.isArray(value) ? value : [];

        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedValues.map((val: string) => {
                const option = options?.find((opt) => opt.value === val);
                return (
                  <Badge key={val} variant="secondary" className="gap-1">
                    {option?.label || val}
                    <button
                      type="button"
                      onClick={() => {
                        const newValues = selectedValues.filter((v) => v !== val);
                        handleValueChange(fieldKey, newValues);
                      }}
                      className="ml-1 hover:text-red-500"
                    >
                      ×
                    </button>
                  </Badge>
                );
              })}
            </div>

            <Select
              value=""
              onValueChange={(newValue) => {
                if (!selectedValues.includes(newValue)) {
                  handleValueChange(fieldKey, [...selectedValues, newValue]);
                }
              }}
            >
              <SelectTrigger id={fieldKey}>
                <SelectValue placeholder={field.ui.placeholder || 'Select options'} />
              </SelectTrigger>
              <SelectContent>
                {options?.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled || selectedValues.includes(option.value)}
                  >
                    {option.label}
                    {option.description && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {option.description}
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {field.multi_select_constraints && (
              <p className="text-xs text-muted-foreground">
                Select {field.multi_select_constraints.min || 0} to{' '}
                {field.multi_select_constraints.max || 'unlimited'} options
              </p>
            )}
          </div>
        );
      }

      case 'number': {
        return (
          <Input
            id={fieldKey}
            type="number"
            value={value || ''}
            onChange={(e) => handleValueChange(fieldKey, Number(e.target.value))}
            min={field.number_constraints?.min}
            max={field.number_constraints?.max}
            step={field.number_constraints?.step}
            placeholder={field.ui.placeholder}
          />
        );
      }

      case 'slider': {
        const min = field.number_constraints?.min || 0;
        const max = field.number_constraints?.max || 100;
        const step = field.number_constraints?.step || 1;

        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{value || min}</span>
              {field.number_constraints?.unit && (
                <span className="text-sm text-muted-foreground">
                  {field.number_constraints.unit}
                </span>
              )}
            </div>
            <Slider
              id={fieldKey}
              value={[value || min]}
              onValueChange={(values) => handleValueChange(fieldKey, values[0])}
              min={min}
              max={max}
              step={step}
            />
          </div>
        );
      }

      case 'boolean': {
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={fieldKey}
              checked={value || false}
              onCheckedChange={(checked) => handleValueChange(fieldKey, checked)}
            />
            <label htmlFor={fieldKey} className="text-sm cursor-pointer">
              {field.ui.placeholder || 'Enable'}
            </label>
          </div>
        );
      }

      case 'text': {
        return (
          <Input
            id={fieldKey}
            type="text"
            value={value || ''}
            onChange={(e) => handleValueChange(fieldKey, e.target.value)}
            placeholder={field.ui.placeholder}
            maxLength={field.string_constraints?.max_length}
          />
        );
      }

      case 'textarea': {
        return (
          <Textarea
            id={fieldKey}
            value={value || ''}
            onChange={(e) => handleValueChange(fieldKey, e.target.value)}
            placeholder={field.ui.placeholder}
            maxLength={field.string_constraints?.max_length}
            rows={4}
          />
        );
      }

      case 'tags': {
        const tags = Array.isArray(value) ? value : [];
        const [inputValue, setInputValue] = useState('');

        return (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag: string, idx: number) => (
                <Badge key={idx} variant="secondary" className="gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => {
                      const newTags = tags.filter((_, i) => i !== idx);
                      handleValueChange(fieldKey, newTags);
                    }}
                    className="ml-1 hover:text-red-500"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (inputValue.trim() && !tags.includes(inputValue.trim())) {
                      handleValueChange(fieldKey, [...tags, inputValue.trim()]);
                      setInputValue('');
                    }
                  }
                }}
                placeholder={field.ui.placeholder || 'Type and press Enter'}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (inputValue.trim() && !tags.includes(inputValue.trim())) {
                    handleValueChange(fieldKey, [...tags, inputValue.trim()]);
                    setInputValue('');
                  }
                }}
              >
                Add
              </Button>
            </div>
          </div>
        );
      }

      default: {
        return (
          <Input
            id={fieldKey}
            type="text"
            value={value || ''}
            onChange={(e) => handleValueChange(fieldKey, e.target.value)}
            placeholder={field.ui.placeholder}
          />
        );
      }
    }
  };

  return (
    <div className={className}>
      <div className="space-y-6">
        {Object.entries(configurable).map(([fieldKey, field]) =>
          renderField(fieldKey, field)
        )}
      </div>
    </div>
  );
}
