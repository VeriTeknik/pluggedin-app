/**
 * Model Router Types
 *
 * OpenAI-compatible chat completion request/response types
 * for the unified Model Router API.
 */

// Provider types
export type ModelProvider = 'openai' | 'anthropic' | 'google';

// Chat message role
export type ChatMessageRole = 'system' | 'user' | 'assistant' | 'function' | 'tool';

// Chat message structure
export interface ChatMessage {
  role: ChatMessageRole;
  content: string | null;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

// OpenAI-compatible request format
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  // Additional fields for routing
  provider?: ModelProvider; // Override automatic provider detection
}

// Response choice
export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter' | null;
}

// Streaming choice delta
export interface ChatCompletionChunkChoice {
  index: number;
  delta: Partial<ChatMessage>;
  finish_reason: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter' | null;
}

// Usage information
export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// OpenAI-compatible response format
export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
  system_fingerprint?: string;
}

// Streaming response chunk
export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
  system_fingerprint?: string;
}

// Model info for routing
export interface ModelInfo {
  id: string;
  provider: ModelProvider;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputPricePerMillion: number;  // USD per 1M tokens
  outputPricePerMillion: number; // USD per 1M tokens
}

// Provider configuration
export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  organizationId?: string;
}

// Error response
export interface ChatCompletionError {
  error: {
    message: string;
    type: string;
    code: string;
    param?: string;
  };
}

// Model alias mapping (user-friendly names to actual model IDs)
export const MODEL_ALIASES: Record<string, string> = {
  // OpenAI aliases
  'gpt-4': 'gpt-4o',
  'gpt-4-turbo': 'gpt-4-turbo-preview',
  'gpt-3.5': 'gpt-3.5-turbo',
  'chatgpt': 'gpt-4o',

  // Anthropic aliases
  'claude': 'claude-sonnet-4-20250514',
  'claude-3': 'claude-sonnet-4-20250514',
  'claude-3-sonnet': 'claude-sonnet-4-20250514',
  'claude-3-opus': 'claude-3-opus-20240229',
  'claude-3-haiku': 'claude-3-haiku-20240307',

  // Google aliases
  'gemini': 'gemini-2.0-flash',
  'gemini-pro': 'gemini-1.5-pro',
  'gemini-flash': 'gemini-2.0-flash',
};

// Model to provider mapping
export const MODEL_PROVIDERS: Record<string, ModelProvider> = {
  // OpenAI models
  'gpt-4o': 'openai',
  'gpt-4o-mini': 'openai',
  'gpt-4-turbo': 'openai',
  'gpt-4-turbo-preview': 'openai',
  'gpt-4': 'openai',
  'gpt-3.5-turbo': 'openai',
  'gpt-3.5-turbo-16k': 'openai',
  'o1': 'openai',
  'o1-mini': 'openai',
  'o1-preview': 'openai',

  // Anthropic models
  'claude-sonnet-4-20250514': 'anthropic',
  'claude-3-5-sonnet-20241022': 'anthropic',
  'claude-3-opus-20240229': 'anthropic',
  'claude-3-sonnet-20240229': 'anthropic',
  'claude-3-haiku-20240307': 'anthropic',

  // Google models
  'gemini-2.0-flash': 'google',
  'gemini-1.5-pro': 'google',
  'gemini-1.5-flash': 'google',
  'gemini-pro': 'google',
};

// Model pricing (USD per 1M tokens)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'o1': { input: 15.00, output: 60.00 },
  'o1-mini': { input: 3.00, output: 12.00 },

  // Anthropic
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },

  // Google
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
};
