/**
 * Agent Configuration Types (ADL v0.2)
 *
 * Template-driven configuration system for dynamic agent configuration UI.
 * Templates declare configuration requirements in their `configurable` section,
 * and pluggedin-app generates dynamic forms based on these definitions.
 */

/**
 * Supported field types for agent configuration
 */
export type FieldType =
  | 'select'           // Single selection from options
  | 'multi-select'     // Multiple selection from options
  | 'number'           // Numeric input with optional min/max
  | 'slider'           // Slider input with range
  | 'boolean'          // Checkbox/toggle
  | 'text'             // Single-line text input
  | 'textarea'         // Multi-line text input
  | 'tags'             // Tag/chip input
  | 'key-value'        // Key-value pairs input
  | 'json';            // Raw JSON editor

/**
 * Source for field options
 */
export type FieldSource =
  | 'static'           // Options defined in template
  | 'model-router'     // Fetch from Model Router API
  | 'api';             // Custom API endpoint

/**
 * Option definition for select/multi-select fields
 */
export interface FieldOption {
  label: string;
  value: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
  tier_required?: 'free' | 'pro' | 'enterprise';
}

/**
 * UI presentation configuration for fields
 */
export interface FieldUI {
  label: string;
  description?: string;
  placeholder?: string;
  help_text?: string;
  show_provider_icons?: boolean;  // For model-router source
  compact?: boolean;               // Compact layout
  inline?: boolean;                // Inline layout
}

/**
 * Number field constraints
 */
export interface NumberConstraints {
  min?: number;
  max?: number;
  step?: number;
  unit?: string;  // Display unit (e.g., 'MB', '%', 'ms')
}

/**
 * String field constraints
 */
export interface StringConstraints {
  min_length?: number;
  max_length?: number;
  pattern?: string;  // Regex pattern
  format?: 'email' | 'url' | 'hostname' | 'ipv4' | 'ipv6';
}

/**
 * Multi-select constraints
 */
export interface MultiSelectConstraints {
  min?: number;  // Minimum selections required
  max?: number;  // Maximum selections allowed
}

/**
 * Base configuration field
 */
export interface ConfigField {
  type: FieldType;

  // Data source
  source?: FieldSource;
  api_endpoint?: string;  // For source: 'api'
  options?: FieldOption[];  // For source: 'static'

  // Constraints
  required?: boolean;
  default?: any;

  // Type-specific constraints
  number_constraints?: NumberConstraints;
  string_constraints?: StringConstraints;
  multi_select_constraints?: MultiSelectConstraints;

  // Environment variable mapping
  env_var?: string;  // Environment variable name to inject

  // UI configuration
  ui: FieldUI;

  // Tier restrictions
  tier_min?: 'free' | 'pro' | 'enterprise';  // Minimum tier required

  // Dependencies (show field only if condition met)
  depends_on?: {
    field: string;
    value: any;
  };
}

/**
 * Template configurable section
 */
export interface TemplateConfigurable {
  [fieldKey: string]: ConfigField;
}

/**
 * User's configuration values for a deployed agent
 */
export type ConfigValues = Record<string, any>;

/**
 * Model Router model definition (from /v1/models API)
 */
export interface ModelRouterModel {
  id: string;
  provider: string;
  name: string;
  context_window?: number;
  max_output_tokens?: number;
  pricing?: {
    input: number;
    output: number;
  };
}

/**
 * Validation result for configuration values
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors?: Record<string, string[]>;
}

/**
 * Environment variables generated from config values
 */
export type EnvironmentVariables = Record<string, string>;
