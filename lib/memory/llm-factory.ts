/**
 * LLM Factory - Centralized LLM instantiation for memory services
 *
 * Uses the AI provider abstraction layer (lib/ai/) to support
 * multiple backends (OpenAI, Gemini, etc.).
 *
 * Returns a thin wrapper with the same `.invoke()` contract that
 * all memory consumers expect, so no caller changes needed.
 */

import { getLLMProvider } from '@/lib/ai';
import type { ChatMessage } from '@/lib/ai';

export type MemoryLLMRole = 'classification' | 'compression' | 'pattern' | 'zreport' | 'anonymizer';

const ROLE_DEFAULTS: Record<MemoryLLMRole, {
  envKey: string;
  temperature: number;
  maxTokens?: number;
}> = {
  classification: {
    envKey: 'MEMORY_CLASSIFICATION_MODEL',
    temperature: 0.1,
    maxTokens: 200,
  },
  compression: {
    envKey: 'MEMORY_COMPRESSION_MODEL',
    temperature: 0.1,
  },
  pattern: {
    envKey: 'MEMORY_PATTERN_MODEL',
    temperature: 0.1,
    maxTokens: 300,
  },
  zreport: {
    envKey: 'MEMORY_ZREPORT_MODEL',
    temperature: 0.2,
    maxTokens: 500,
  },
  anonymizer: {
    envKey: 'MEMORY_ANONYMIZER_MODEL',
    temperature: 0.1,
    maxTokens: 400,
  },
};

/** Response type matching what consumers expect (compatible with extractResponseText) */
interface LLMResponse {
  content: string;
}

/** Thin wrapper that exposes the `.invoke()` contract consumers expect */
interface MemoryLLM {
  invoke(messages: Array<{ role: string; content: string }>): Promise<LLMResponse>;
}

/**
 * Create an LLM instance for the given memory role.
 * Returns an object with `.invoke()` that delegates to the provider abstraction.
 *
 * Optional `overrides` allow callers to override role defaults (e.g. maxTokens).
 */
export function createMemoryLLM(
  role: MemoryLLMRole,
  overrides?: { maxTokens?: number }
): MemoryLLM {
  const config = ROLE_DEFAULTS[role];
  const model = process.env[config.envKey] || undefined;
  const provider = getLLMProvider(model);
  const maxTokens = overrides?.maxTokens ?? config.maxTokens;

  return {
    async invoke(messages: Array<{ role: string; content: string }>): Promise<LLMResponse> {
      const chatMessages: ChatMessage[] = messages.map(m => ({
        role: m.role as ChatMessage['role'],
        content: m.content,
      }));

      const text = await provider.complete(chatMessages, {
        temperature: config.temperature,
        maxTokens,
      });

      return { content: text };
    },
  };
}
