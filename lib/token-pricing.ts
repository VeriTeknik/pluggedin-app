/**
 * Token pricing utility for tracking LLM costs
 * Prices are in cents per million tokens
 */

// Pricing in cents per million tokens (input/output)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI models
  'gpt-4o': { input: 200, output: 800 }, // $2.00/$8.00
  'gpt-4o-mini': { input: 40, output: 160 }, // $0.40/$1.60
  'gpt-4.1-nano': { input: 10, output: 40 }, // $0.10/$0.40
  'o3': { input: 200, output: 800 }, // $2.00/$8.00
  'o3-pro': { input: 2000, output: 8000 }, // $20.00/$80.00
  'o4-mini': { input: 110, output: 440 }, // $1.10/$4.40
  'o3-mini-high': { input: 110, output: 440 }, // $1.10/$4.40 (high reasoning mode)
  
  // Anthropic models
  'claude-opus-4-20250514': { input: 1500, output: 7500 }, // $15.00/$75.00
  'claude-sonnet-4-20250514': { input: 300, output: 1500 }, // $3.00/$15.00
  'claude-3-5-haiku-20241022': { input: 25, output: 125 }, // $0.25/$1.25
  
  // Google models
  'gemini-2.5-pro': { input: 125, output: 1000 }, // $1.25/$10.00
  'gemini-2.0-flash': { input: 10, output: 40 }, // $0.10/$0.40
  'gemini-2.5-flash-preview': { input: 15, output: 60 }, // $0.15/$0.60
  
  // xAI models
  'grok-4': { input: 300, output: 1500 }, // $3.00/$15.00
  'grok-3-mini': { input: 30, output: 50 }, // $0.30/$0.50
  'grok-4-vision': { input: 500, output: 2000 }, // $5.00/$20.00 (estimated)
  
  // Default fallback
  'default': { input: 100, output: 400 } // Conservative estimate
};

/**
 * Calculate cost in cents for token usage
 */
export function calculateTokenCost(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): {
  promptCost: number;
  completionCost: number;
  totalCost: number;
} {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.default;
  
  // Calculate costs (convert from per million to actual token count)
  const promptCost = Math.ceil((promptTokens * pricing.input) / 1_000_000);
  const completionCost = Math.ceil((completionTokens * pricing.output) / 1_000_000);
  const totalCost = promptCost + completionCost;
  
  return {
    promptCost,
    completionCost,
    totalCost
  };
}

/**
 * Format cost from cents to dollar string
 */
export function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(4)}`;
}

/**
 * Get human-readable model name
 */
export function getModelDisplayName(model: string): string {
  const displayNames: Record<string, string> = {
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'gpt-4.1-nano': 'GPT-4.1 Nano',
    'o3': 'o3',
    'o3-pro': 'o3 Pro',
    'o4-mini': 'o4 Mini',
    'claude-opus-4-20250514': 'Claude 4 Opus',
    'claude-sonnet-4-20250514': 'Claude 4 Sonnet',
    'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.0-flash': 'Gemini 2.0 Flash',
    'gemini-2.5-flash-preview': 'Gemini 2.5 Flash',
    'grok-4': 'Grok 4',
    'grok-3-mini': 'Grok 3 Mini',
    'grok-4-vision': 'Grok 4 Vision',
  };
  
  return displayNames[model] || model;
}