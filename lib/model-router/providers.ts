/**
 * Model Router Providers
 *
 * Handles routing chat completion requests to the appropriate
 * AI provider (OpenAI, Anthropic, Google).
 */

import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatMessage,
  ModelProvider,
  MODEL_ALIASES,
  MODEL_PROVIDERS,
  MODEL_PRICING,
} from './types';

// Provider base URLs
const PROVIDER_URLS: Record<ModelProvider, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
};

/**
 * Resolve model alias to actual model ID
 */
export function resolveModelAlias(model: string): string {
  return MODEL_ALIASES[model.toLowerCase()] || model;
}

/**
 * Get provider for a model
 */
export function getProviderForModel(model: string): ModelProvider {
  const resolvedModel = resolveModelAlias(model);
  const provider = MODEL_PROVIDERS[resolvedModel];

  if (!provider) {
    // Try to infer from model name
    if (resolvedModel.startsWith('gpt-') || resolvedModel.startsWith('o1')) {
      return 'openai';
    }
    if (resolvedModel.startsWith('claude')) {
      return 'anthropic';
    }
    if (resolvedModel.startsWith('gemini')) {
      return 'google';
    }
    throw new Error(`Unknown model: ${model}`);
  }

  return provider;
}

/**
 * Get API key for provider from environment
 */
function getApiKey(provider: ModelProvider): string {
  const keys: Record<ModelProvider, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY,
  };

  const key = keys[provider];
  if (!key) {
    throw new Error(`API key not configured for provider: ${provider}`);
  }
  return key;
}

/**
 * Convert messages to Anthropic format
 */
function convertToAnthropicMessages(
  messages: ChatMessage[]
): { system?: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } {
  let systemPrompt: string | undefined;
  const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt = (systemPrompt || '') + (msg.content || '');
    } else if (msg.role === 'user' || msg.role === 'assistant') {
      anthropicMessages.push({
        role: msg.role,
        content: msg.content || '',
      });
    }
  }

  return { system: systemPrompt, messages: anthropicMessages };
}

/**
 * Convert messages to Google (Gemini) format
 */
function convertToGoogleMessages(
  messages: ChatMessage[]
): { systemInstruction?: { parts: { text: string }[] }; contents: Array<{ role: string; parts: { text: string }[] }> } {
  let systemInstruction: { parts: { text: string }[] } | undefined;
  const contents: Array<{ role: string; parts: { text: string }[] }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = { parts: [{ text: msg.content || '' }] };
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content || '' }],
      });
    }
  }

  return { systemInstruction, contents };
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  request: ChatCompletionRequest,
  apiKey: string
): Promise<ChatCompletionResponse> {
  const response = await fetch(`${PROVIDER_URLS.openai}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: resolveModelAlias(request.model),
      messages: request.messages,
      temperature: request.temperature,
      top_p: request.top_p,
      n: request.n,
      stream: false,
      stop: request.stop,
      max_tokens: request.max_tokens,
      presence_penalty: request.presence_penalty,
      frequency_penalty: request.frequency_penalty,
      user: request.user,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Call OpenAI API with streaming
 */
async function* callOpenAIStreaming(
  request: ChatCompletionRequest,
  apiKey: string
): AsyncGenerator<ChatCompletionChunk> {
  const response = await fetch(`${PROVIDER_URLS.openai}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: resolveModelAlias(request.model),
      messages: request.messages,
      temperature: request.temperature,
      top_p: request.top_p,
      n: request.n,
      stream: true,
      stop: request.stop,
      max_tokens: request.max_tokens,
      presence_penalty: request.presence_penalty,
      frequency_penalty: request.frequency_penalty,
      user: request.user,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;
        try {
          yield JSON.parse(data) as ChatCompletionChunk;
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

/**
 * Call Anthropic API
 */
async function callAnthropic(
  request: ChatCompletionRequest,
  apiKey: string
): Promise<ChatCompletionResponse> {
  const { system, messages } = convertToAnthropicMessages(request.messages);
  const resolvedModel = resolveModelAlias(request.model);

  const response = await fetch(`${PROVIDER_URLS.anthropic}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: resolvedModel,
      system,
      messages,
      max_tokens: request.max_tokens || 4096,
      temperature: request.temperature,
      top_p: request.top_p,
      stop_sequences: Array.isArray(request.stop) ? request.stop : request.stop ? [request.stop] : undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
  }

  const anthropicResponse = await response.json();

  // Convert Anthropic response to OpenAI format
  return {
    id: anthropicResponse.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: anthropicResponse.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: anthropicResponse.content[0]?.text || '',
        },
        finish_reason: anthropicResponse.stop_reason === 'end_turn' ? 'stop' : anthropicResponse.stop_reason,
      },
    ],
    usage: {
      prompt_tokens: anthropicResponse.usage?.input_tokens || 0,
      completion_tokens: anthropicResponse.usage?.output_tokens || 0,
      total_tokens: (anthropicResponse.usage?.input_tokens || 0) + (anthropicResponse.usage?.output_tokens || 0),
    },
  };
}

/**
 * Call Anthropic API with streaming
 */
async function* callAnthropicStreaming(
  request: ChatCompletionRequest,
  apiKey: string
): AsyncGenerator<ChatCompletionChunk> {
  const { system, messages } = convertToAnthropicMessages(request.messages);
  const resolvedModel = resolveModelAlias(request.model);

  const response = await fetch(`${PROVIDER_URLS.anthropic}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: resolvedModel,
      system,
      messages,
      max_tokens: request.max_tokens || 4096,
      temperature: request.temperature,
      top_p: request.top_p,
      stop_sequences: Array.isArray(request.stop) ? request.stop : request.stop ? [request.stop] : undefined,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let messageId = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6);
        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.text) {
            yield {
              id: messageId,
              object: 'chat.completion.chunk',
              created,
              model: resolvedModel,
              choices: [
                {
                  index: 0,
                  delta: { content: event.delta.text },
                  finish_reason: null,
                },
              ],
            };
          } else if (event.type === 'message_stop') {
            yield {
              id: messageId,
              object: 'chat.completion.chunk',
              created,
              model: resolvedModel,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: 'stop',
                },
              ],
            };
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

/**
 * Call Google (Gemini) API
 */
async function callGoogle(
  request: ChatCompletionRequest,
  apiKey: string
): Promise<ChatCompletionResponse> {
  const { systemInstruction, contents } = convertToGoogleMessages(request.messages);
  const resolvedModel = resolveModelAlias(request.model);

  const url = `${PROVIDER_URLS.google}/models/${resolvedModel}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction,
      contents,
      generationConfig: {
        temperature: request.temperature,
        topP: request.top_p,
        maxOutputTokens: request.max_tokens,
        stopSequences: Array.isArray(request.stop) ? request.stop : request.stop ? [request.stop] : undefined,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `Google API error: ${response.status}`);
  }

  const googleResponse = await response.json();
  const candidate = googleResponse.candidates?.[0];

  // Convert Google response to OpenAI format
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: resolvedModel,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: candidate?.content?.parts?.[0]?.text || '',
        },
        finish_reason: candidate?.finishReason === 'STOP' ? 'stop' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: googleResponse.usageMetadata?.promptTokenCount || 0,
      completion_tokens: googleResponse.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: googleResponse.usageMetadata?.totalTokenCount || 0,
    },
  };
}

/**
 * Call Google (Gemini) API with streaming
 */
async function* callGoogleStreaming(
  request: ChatCompletionRequest,
  apiKey: string
): AsyncGenerator<ChatCompletionChunk> {
  const { systemInstruction, contents } = convertToGoogleMessages(request.messages);
  const resolvedModel = resolveModelAlias(request.model);

  const url = `${PROVIDER_URLS.google}/models/${resolvedModel}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction,
      contents,
      generationConfig: {
        temperature: request.temperature,
        topP: request.top_p,
        maxOutputTokens: request.max_tokens,
        stopSequences: Array.isArray(request.stop) ? request.stop : request.stop ? [request.stop] : undefined,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `Google API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  const messageId = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6);
        try {
          const event = JSON.parse(data);
          const text = event.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            yield {
              id: messageId,
              object: 'chat.completion.chunk',
              created,
              model: resolvedModel,
              choices: [
                {
                  index: 0,
                  delta: { content: text },
                  finish_reason: null,
                },
              ],
            };
          }
          if (event.candidates?.[0]?.finishReason) {
            yield {
              id: messageId,
              object: 'chat.completion.chunk',
              created,
              model: resolvedModel,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: 'stop',
                },
              ],
            };
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

/**
 * Route chat completion request to appropriate provider
 */
export async function routeChatCompletion(
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  const provider = request.provider || getProviderForModel(request.model);
  const apiKey = getApiKey(provider);

  switch (provider) {
    case 'openai':
      return callOpenAI(request, apiKey);
    case 'anthropic':
      return callAnthropic(request, apiKey);
    case 'google':
      return callGoogle(request, apiKey);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Route chat completion request with streaming
 */
export async function* routeChatCompletionStreaming(
  request: ChatCompletionRequest
): AsyncGenerator<ChatCompletionChunk> {
  const provider = request.provider || getProviderForModel(request.model);
  const apiKey = getApiKey(provider);

  switch (provider) {
    case 'openai':
      yield* callOpenAIStreaming(request, apiKey);
      break;
    case 'anthropic':
      yield* callAnthropicStreaming(request, apiKey);
      break;
    case 'google':
      yield* callGoogleStreaming(request, apiKey);
      break;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Calculate cost for a chat completion
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const resolvedModel = resolveModelAlias(model);
  const pricing = MODEL_PRICING[resolvedModel];

  if (!pricing) {
    return 0; // Unknown model, can't calculate cost
  }

  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Get available models
 */
export function getAvailableModels(): Array<{ id: string; provider: ModelProvider }> {
  return Object.entries(MODEL_PROVIDERS).map(([id, provider]) => ({ id, provider }));
}
