/**
 * LLM Utility Functions for MCP Session Manager
 * 
 * This module provides utility functions for initializing and managing
 * LLM instances across both playground and embedded chat systems.
 */

import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { ChatXAI } from '@langchain/xai';

import type { LLMConfig } from './config-types.js';

/**
 * Initialize chat model based on provider configuration
 */
export function initChatModel(config: {
  provider: 'openai' | 'anthropic' | 'google' | 'xai';
  model: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
}) {
  const { provider, model, temperature = 0, maxTokens, streaming = true } = config;

  if (provider === 'openai') {
    // gpt-4.1-nano doesn't support temperature parameter
    const modelConfig: any = {
      modelName: model,
      maxTokens,
      streaming,
      // Enable stream usage for token counting in streaming mode
      streamUsage: true,
    };
    
    // Only add temperature if not gpt-4.1-nano
    if (model !== 'gpt-4.1-nano') {
      modelConfig.temperature = temperature;
    }
    
    return new ChatOpenAI(modelConfig);
  } else if (provider === 'anthropic') {
    return new ChatAnthropic({
      modelName: model,
      temperature,
      maxTokens,
      streaming,
      // Enable stream usage for token counting in streaming mode
      streamUsage: true,
    } as any);
  } else if (provider === 'google') {
    return new ChatGoogleGenerativeAI({
      model: model,
      temperature,
      maxOutputTokens: maxTokens,
      streaming,
    }) as any;
  } else if (provider === 'xai') {
    return new ChatXAI({
      model: model,
      temperature,
      maxTokens,
      streaming,
      // Enable stream usage for token counting in streaming mode
      streamUsage: true,
    } as any);
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Map provider for langchain-mcp-tools compatibility
 */
export function mapProviderForLangchain(provider: string): 'anthropic' | 'openai' | 'google_genai' | 'google_gemini' | 'none' {
  if (provider === 'anthropic') {
    return 'anthropic';
  } else if (provider === 'openai') {
    return 'openai';
  } else if (provider === 'google') {
    return 'google_genai'; // Use proper Google provider for Gemini compatibility
  } else if (provider === 'xai') {
    return 'openai'; // Map XAI to openai format for compatibility
  }
  return 'none';
}

/**
 * Validate LLM configuration
 */
export function validateLLMConfig(config: Partial<LLMConfig>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.provider) {
    errors.push('LLM provider is required');
  }

  if (!config.model) {
    errors.push('LLM model is required');
  }

  const validProviders = ['openai', 'anthropic', 'google', 'xai'];
  if (config.provider && !validProviders.includes(config.provider)) {
    errors.push(`Invalid LLM provider: ${config.provider}`);
  }

  // Validate temperature range
  if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
    errors.push('Temperature must be between 0 and 2');
  }

  // Validate max tokens
  if (config.maxTokens !== undefined && config.maxTokens <= 0) {
    errors.push('Max tokens must be greater than 0');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get default model for provider
 */
export function getDefaultModel(provider: 'openai' | 'anthropic' | 'google' | 'xai'): string {
  switch (provider) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-3-5-haiku-20241022';
    case 'google':
      return 'gemini-2.0-flash';
    case 'xai':
      return 'grok-3-mini';
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Get available models for provider
 */
export function getAvailableModels(provider: 'openai' | 'anthropic' | 'google' | 'xai'): string[] {
  switch (provider) {
    case 'openai':
      return [
        'gpt-4o-mini',
        'gpt-4.1-nano',
        'gpt-4o'
      ];
    case 'anthropic':
      return [
        'claude-3-5-haiku-20241022',
        'claude-sonnet-4-20250514',
        'claude-opus-4-20250514'
      ];
    case 'google':
      return [
        'gemini-2.0-flash',
        'gemini-2.5-flash-preview',
        'gemini-2.5-pro'
      ];
    case 'xai':
      return [
        'grok-3-mini',
        'grok-4',
        'grok-4-vision'
      ];
    default:
      return [];
  }
}

/**
 * Estimate token count for a text (rough approximation)
 */
export function estimateTokenCount(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
}

/**
 * Check if model supports streaming
 */
export function supportsStreaming(provider: 'openai' | 'anthropic' | 'google' | 'xai', model: string): boolean {
  // Most modern models support streaming
  const nonStreamingModels: string[] = [
    // Add any models that don't support streaming here
  ];
  
  return !nonStreamingModels.includes(model);
}

/**
 * Check if model supports temperature parameter
 */
export function supportsTemperature(provider: 'openai' | 'anthropic' | 'google' | 'xai', model: string): boolean {
  // gpt-4.1-nano doesn't support temperature parameter
  if (provider === 'openai' && model === 'gpt-4.1-nano') {
    return false;
  }
  
  // All other models support temperature
  return true;
}

/**
 * Get model context window size
 */
export function getModelContextWindow(provider: 'openai' | 'anthropic' | 'google' | 'xai', model: string): number {
  const contextWindows: Record<string, number> = {
    // OpenAI models
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    'gpt-3.5-turbo': 16385,
    'gpt-4-turbo': 128000,
    
    // Anthropic models
    'claude-3-5-sonnet-20241022': 200000,
    'claude-3-haiku-20240307': 200000,
    'claude-3-opus-20240229': 200000,
    
    // Google models
    'gemini-1.5-flash': 1000000,
    'gemini-1.5-pro': 2000000,
    'gemini-1.0-pro': 32768,
    'gemini-2.5-flash-preview-05-20': 1000000,
    'gemini-2.5-pro-preview-06-05': 2000000,
    
    // X AI models
    'grok-3-mini': 131072,
    'grok-4': 131072,
    'grok-4-vision': 131072
  };

  return contextWindows[model] || 8192; // Default fallback
}

/**
 * Format LLM configuration for display
 */
export function formatLLMConfig(config: LLMConfig): string {
  return `${config.provider}/${config.model} (temp=${config.temperature || 0}, maxTokens=${config.maxTokens || 'default'})`;
}