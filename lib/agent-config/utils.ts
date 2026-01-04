/**
 * Agent Configuration Utilities (ADL v0.2)
 *
 * Utilities for parsing, validating, and converting agent configuration.
 */

import type {
  ConfigField,
  TemplateConfigurable,
  ConfigValues,
  ConfigValidationResult,
  EnvironmentVariables,
  ModelRouterModel,
  FieldOption,
} from './types';

/**
 * Parse template's configurable section
 */
export function parseConfigurable(
  configurable: unknown
): TemplateConfigurable | null {
  if (!configurable || typeof configurable !== 'object') {
    return null;
  }

  return configurable as TemplateConfigurable;
}

/**
 * Validate configuration values against template schema
 */
export function validateConfigValues(
  configurable: TemplateConfigurable,
  configValues: ConfigValues
): ConfigValidationResult {
  const errors: Record<string, string[]> = {};

  for (const [fieldKey, field] of Object.entries(configurable)) {
    const value = configValues[fieldKey];
    const fieldErrors: string[] = [];

    // Required check
    if (field.required && (value === undefined || value === null || value === '')) {
      fieldErrors.push(`${field.ui.label} is required`);
    }

    // Skip further validation if value is not provided and not required
    if (value === undefined || value === null) {
      if (fieldErrors.length > 0) {
        errors[fieldKey] = fieldErrors;
      }
      continue;
    }

    // Type-specific validation
    switch (field.type) {
      case 'number':
      case 'slider': {
        const numValue = typeof value === 'number' ? value : Number(value);
        if (isNaN(numValue)) {
          fieldErrors.push(`${field.ui.label} must be a valid number`);
        } else if (field.number_constraints) {
          const { min, max } = field.number_constraints;
          if (min !== undefined && numValue < min) {
            fieldErrors.push(`${field.ui.label} must be at least ${min}`);
          }
          if (max !== undefined && numValue > max) {
            fieldErrors.push(`${field.ui.label} must be at most ${max}`);
          }
        }
        break;
      }

      case 'select': {
        if (typeof value !== 'string') {
          fieldErrors.push(`${field.ui.label} must be a string`);
        } else if (field.source === 'static' && field.options) {
          const validValues = field.options.map((opt) => opt.value);
          if (!validValues.includes(value)) {
            fieldErrors.push(`${field.ui.label} must be one of: ${validValues.join(', ')}`);
          }
        }
        break;
      }

      case 'multi-select': {
        if (!Array.isArray(value)) {
          fieldErrors.push(`${field.ui.label} must be an array`);
        } else {
          if (field.multi_select_constraints) {
            const { min, max } = field.multi_select_constraints;
            if (min !== undefined && value.length < min) {
              fieldErrors.push(`${field.ui.label} must have at least ${min} selection(s)`);
            }
            if (max !== undefined && value.length > max) {
              fieldErrors.push(`${field.ui.label} must have at most ${max} selection(s)`);
            }
          }
          if (field.source === 'static' && field.options) {
            const validValues = field.options.map((opt) => opt.value);
            const invalidValues = value.filter((v) => !validValues.includes(v));
            if (invalidValues.length > 0) {
              fieldErrors.push(
                `${field.ui.label} contains invalid values: ${invalidValues.join(', ')}`
              );
            }
          }
        }
        break;
      }

      case 'boolean': {
        if (typeof value !== 'boolean') {
          fieldErrors.push(`${field.ui.label} must be a boolean`);
        }
        break;
      }

      case 'text': {
        if (typeof value !== 'string') {
          fieldErrors.push(`${field.ui.label} must be a string`);
        } else if (field.string_constraints) {
          const { min_length, max_length, pattern } = field.string_constraints;
          if (min_length !== undefined && value.length < min_length) {
            fieldErrors.push(`${field.ui.label} must be at least ${min_length} characters`);
          }
          if (max_length !== undefined && value.length > max_length) {
            fieldErrors.push(`${field.ui.label} must be at most ${max_length} characters`);
          }
          if (pattern) {
            const regex = new RegExp(pattern);
            if (!regex.test(value)) {
              fieldErrors.push(`${field.ui.label} format is invalid`);
            }
          }
        }
        break;
      }

      case 'textarea': {
        if (typeof value !== 'string') {
          fieldErrors.push(`${field.ui.label} must be a string`);
        } else if (field.string_constraints) {
          const { min_length, max_length } = field.string_constraints;
          if (min_length !== undefined && value.length < min_length) {
            fieldErrors.push(`${field.ui.label} must be at least ${min_length} characters`);
          }
          if (max_length !== undefined && value.length > max_length) {
            fieldErrors.push(`${field.ui.label} must be at most ${max_length} characters`);
          }
        }
        break;
      }

      case 'tags': {
        if (!Array.isArray(value)) {
          fieldErrors.push(`${field.ui.label} must be an array`);
        }
        break;
      }

      case 'key-value': {
        if (typeof value !== 'object' || Array.isArray(value)) {
          fieldErrors.push(`${field.ui.label} must be an object`);
        }
        break;
      }

      case 'json': {
        if (typeof value !== 'object') {
          fieldErrors.push(`${field.ui.label} must be a valid JSON object`);
        }
        break;
      }
    }

    if (fieldErrors.length > 0) {
      errors[fieldKey] = fieldErrors;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  };
}

/**
 * Convert configuration values to environment variables
 *
 * @param configurable - Template's configurable section
 * @param configValues - User's configuration values
 * @returns Environment variables object
 */
export function configToEnvVars(
  configurable: TemplateConfigurable,
  configValues: ConfigValues
): EnvironmentVariables {
  const envVars: EnvironmentVariables = {};

  for (const [fieldKey, field] of Object.entries(configurable)) {
    const value = configValues[fieldKey];

    // Skip if no env_var mapping or no value
    if (!field.env_var || value === undefined || value === null) {
      continue;
    }

    // Convert value to string based on type
    let envValue: string;

    switch (field.type) {
      case 'multi-select':
      case 'tags': {
        // Join array values with comma
        envValue = Array.isArray(value) ? value.join(',') : String(value);
        break;
      }

      case 'boolean': {
        // Convert boolean to string
        envValue = value ? 'true' : 'false';
        break;
      }

      case 'key-value':
      case 'json': {
        // Stringify objects
        envValue = JSON.stringify(value);
        break;
      }

      default: {
        // Convert to string
        envValue = String(value);
        break;
      }
    }

    envVars[field.env_var] = envValue;
  }

  return envVars;
}

/**
 * Fetch available models from Model Router service
 *
 * @param modelRouterBaseUrl - Base URL of the model router service
 * @param token - JWT token for authentication
 * @returns Array of available models
 */
export async function fetchModelRouterModels(
  modelRouterBaseUrl: string,
  token?: string
): Promise<ModelRouterModel[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${modelRouterBaseUrl}/v1/models`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Convert Model Router models to field options
 *
 * @param models - Array of Model Router models
 * @returns Array of field options (featured models sorted first)
 */
export function modelsToFieldOptions(models: ModelRouterModel[]): FieldOption[] {
  // Sort featured models first, then by name
  const sortedModels = [...models].sort((a, b) => {
    // Featured models first
    if (a.is_featured && !b.is_featured) return -1;
    if (!a.is_featured && b.is_featured) return 1;
    // Then by name
    return (a.name || a.id).localeCompare(b.name || b.id);
  });

  return sortedModels.map((model) => ({
    label: model.name || model.id,
    value: model.id,
    description: model.provider
      ? `Provider: ${model.provider} • Context: ${model.context_window?.toLocaleString() || 'N/A'}`
      : undefined,
    icon: model.provider?.toLowerCase(),
    is_featured: model.is_featured,
    supports_vision: model.supports_vision,
  }));
}

/**
 * Get default configuration values from template
 *
 * @param configurable - Template's configurable section
 * @returns Default configuration values
 */
export function getDefaultConfigValues(
  configurable: TemplateConfigurable
): ConfigValues {
  const defaults: ConfigValues = {};

  for (const [fieldKey, field] of Object.entries(configurable)) {
    if (field.default !== undefined) {
      defaults[fieldKey] = field.default;
    }
  }

  return defaults;
}

/**
 * Merge user configuration values with defaults
 *
 * @param configurable - Template's configurable section
 * @param configValues - User's configuration values
 * @returns Merged configuration values
 */
export function mergeConfigValues(
  configurable: TemplateConfigurable,
  configValues: ConfigValues
): ConfigValues {
  const defaults = getDefaultConfigValues(configurable);
  return { ...defaults, ...configValues };
}
