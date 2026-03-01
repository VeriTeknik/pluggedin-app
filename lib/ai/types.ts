/**
 * AI Provider Abstraction Layer - Types
 *
 * Unified interface for LLM and embedding providers.
 * Supports OpenAI, Gemini, and future providers (Ollama, etc.).
 */

/** Chat message for LLM completion */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Options for LLM completion */
export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  /** Force JSON output (provider handles via native JSON mode or prompting) */
  json?: boolean;
}

/** Unified AI provider interface */
export interface AIProvider {
  readonly name: string;

  /** Generate a text embedding vector */
  embed(text: string): Promise<number[]>;

  /** Generate embeddings for multiple texts (batch) */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** Run a chat completion and return the response text */
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string>;
}

/** Supported provider names */
export type ProviderName = 'openai' | 'gemini';

/** Configuration for the embedding provider */
export interface EmbeddingConfig {
  provider: ProviderName;
  model: string;
  dimensions: number;
  apiKey: string;
}

/** Configuration for the LLM provider */
export interface LLMConfig {
  provider: ProviderName;
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
}
