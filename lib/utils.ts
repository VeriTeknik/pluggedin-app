import { type ClassValue,clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get the appropriate badge classes for different AI model providers
 * @param model - The model name or identifier
 * @returns CSS classes for the model badge
 */
export function getModelBadgeClass(model?: string): string {
  if (!model) return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300';
  
  const lower = model.toLowerCase();
  
  // OpenAI models (GPT series)
  if (lower.includes('openai') || lower.includes('gpt')) {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  }
  
  // Anthropic models (Claude series)
  if (lower.includes('anthropic') || lower.includes('claude')) {
    return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
  }
  
  // Google models (Gemini series)
  if (lower.includes('google') || lower.includes('gemini')) {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
  }
  
  // Default fallback for unknown models
  return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300';
}
