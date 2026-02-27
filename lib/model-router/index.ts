/**
 * Model Router
 *
 * Unified LLM API gateway for routing chat completion requests
 * to multiple AI providers (OpenAI, Anthropic, Google).
 *
 * Features:
 * - OpenAI-compatible API format
 * - Automatic provider routing based on model name
 * - Model aliases for convenience
 * - Streaming support
 * - Cost calculation
 *
 * @example
 * ```typescript
 * import { routeChatCompletion } from '@/lib/model-router';
 *
 * const response = await routeChatCompletion({
 *   model: 'claude', // Alias for claude-sonnet-4-20250514
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 */

export {
  routeChatCompletion,
  routeChatCompletionStreaming,
  calculateCost,
  calculateCostAsync,
  getAvailableModels,
  getAvailableModelsAsync,
  getProviderForModel,
  getProviderForModelAsync,
  resolveModelAlias,
  resolveModelAliasAsync,
} from './providers';

export {
  type ChatCompletionRequest,
  type ChatCompletionResponse,
  type ChatCompletionChunk,
  type ChatMessage,
  type ModelProvider,
  type ChatCompletionUsage,
  MODEL_ALIASES,
  MODEL_PROVIDERS,
  MODEL_PRICING,
} from './types';
