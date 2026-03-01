/**
 * LLM Factory - Centralized LLM instantiation for memory services
 *
 * Instead of each service hardcoding `new ChatOpenAI(...)`, all LLM
 * usage goes through this factory. This makes it easy to swap providers,
 * add observability, or route through the model router in the future.
 */

import { ChatOpenAI } from '@langchain/openai';

export type MemoryLLMRole = 'classification' | 'compression' | 'pattern' | 'zreport' | 'anonymizer';

const ROLE_DEFAULTS: Record<MemoryLLMRole, {
  envKey: string;
  fallbackModel: string;
  temperature: number;
  maxTokens?: number;
}> = {
  classification: {
    envKey: 'MEMORY_CLASSIFICATION_MODEL',
    fallbackModel: 'gpt-4o-mini',
    temperature: 0.1,
    maxTokens: 200,
  },
  compression: {
    envKey: 'MEMORY_COMPRESSION_MODEL',
    fallbackModel: 'gpt-4o-mini',
    temperature: 0.1,
  },
  pattern: {
    envKey: 'MEMORY_PATTERN_MODEL',
    fallbackModel: 'gpt-4o-mini',
    temperature: 0.1,
    maxTokens: 300,
  },
  zreport: {
    envKey: 'MEMORY_ZREPORT_MODEL',
    fallbackModel: 'gpt-4o-mini',
    temperature: 0.2,
    maxTokens: 500,
  },
  anonymizer: {
    envKey: 'MEMORY_ANONYMIZER_MODEL',
    fallbackModel: 'gpt-4o-mini',
    temperature: 0.1,
    maxTokens: 400,
  },
};

/**
 * Create a ChatOpenAI instance for the given memory role.
 */
export function createMemoryLLM(role: MemoryLLMRole): ChatOpenAI {
  const config = ROLE_DEFAULTS[role];
  return new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: process.env[config.envKey] || config.fallbackModel,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });
}
