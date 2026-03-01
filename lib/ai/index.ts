/**
 * AI Provider Factory
 *
 * Central factory for obtaining AI provider instances.
 * Reads EMBEDDING_PROVIDER and MEMORY_LLM_PROVIDER from env.
 */

import { GeminiProvider } from './gemini-provider';
import { OpenAIProvider } from './openai-provider';
import type { AIProvider, ProviderName } from './types';

export type { AIProvider, ChatMessage, CompletionOptions, ProviderName } from './types';

// ============================================================================
// Singleton caches (one per provider+model combination)
// ============================================================================

let embeddingProvider: AIProvider | null = null;
let llmProviders: Map<string, AIProvider> = new Map();

/**
 * Get the embedding provider (singleton).
 * Configured by EMBEDDING_PROVIDER, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS.
 */
export function getEmbeddingProvider(): AIProvider {
  if (!embeddingProvider) {
    const provider = (process.env.EMBEDDING_PROVIDER || 'openai') as ProviderName;
    embeddingProvider = createProvider(provider, {
      embeddingModel: process.env.EMBEDDING_MODEL,
      embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS) || undefined,
    });
  }
  return embeddingProvider;
}

/**
 * Get an LLM provider for a specific model.
 * Configured by MEMORY_LLM_PROVIDER (defaults to EMBEDDING_PROVIDER or 'openai').
 */
export function getLLMProvider(model?: string): AIProvider {
  const provider = (process.env.MEMORY_LLM_PROVIDER || process.env.EMBEDDING_PROVIDER || 'openai') as ProviderName;
  const resolvedModel = model || getDefaultLLMModel(provider);
  const cacheKey = `${provider}:${resolvedModel}`;

  if (!llmProviders.has(cacheKey)) {
    llmProviders.set(cacheKey, createProvider(provider, { completionModel: resolvedModel }));
  }
  return llmProviders.get(cacheKey)!;
}

/**
 * Get embedding dimensions for the current configuration.
 */
export function getEmbeddingDimensions(): number {
  const provider = (process.env.EMBEDDING_PROVIDER || 'openai') as ProviderName;
  const model = process.env.EMBEDDING_MODEL || getDefaultEmbeddingModel(provider);
  const envDims = Number(process.env.EMBEDDING_DIMENSIONS);
  if (envDims > 0) return envDims;
  return getDefaultDimensions(provider, model);
}

// ============================================================================
// Internal helpers
// ============================================================================

function createProvider(
  provider: ProviderName,
  overrides: {
    embeddingModel?: string;
    embeddingDimensions?: number;
    completionModel?: string;
  } = {}
): AIProvider {
  switch (provider) {
    case 'gemini': {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY is required for Gemini provider');
      return new GeminiProvider({
        apiKey,
        embeddingModel: overrides.embeddingModel,
        completionModel: overrides.completionModel,
      });
    }
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY is required for OpenAI provider');
      return new OpenAIProvider({
        apiKey,
        embeddingModel: overrides.embeddingModel,
        embeddingDimensions: overrides.embeddingDimensions,
        completionModel: overrides.completionModel,
      });
    }
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

function getDefaultEmbeddingModel(provider: ProviderName): string {
  switch (provider) {
    case 'gemini': return 'gemini-embedding-001';
    case 'openai': return 'text-embedding-3-small';
  }
}

function getDefaultLLMModel(provider: ProviderName): string {
  switch (provider) {
    case 'gemini': return 'gemini-2.5-flash-lite';
    case 'openai': return 'gpt-4o-mini';
  }
}

function getDefaultDimensions(provider: ProviderName, model: string): number {
  const MODEL_DIMENSIONS: Record<string, number> = {
    // OpenAI
    'text-embedding-3-small': 1536,
    'text-embedding-3-large': 3072,
    'text-embedding-ada-002': 1536,
    // Gemini
    'gemini-embedding-001': 768,
    'text-embedding-004': 768,
  };
  return MODEL_DIMENSIONS[model] ?? (provider === 'gemini' ? 768 : 1536);
}
