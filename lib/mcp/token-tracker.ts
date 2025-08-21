/**
 * Token tracking wrapper for LLM models
 * This module provides a wrapper that intercepts and tracks token usage
 * from LLM calls, even when used within agent frameworks.
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage } from '@langchain/core/messages';

interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

// Global storage for token usage per session
const sessionTokenUsage = new Map<string, TokenUsage>();

/**
 * Wrap an LLM model to track token usage
 */
export function wrapLLMWithTokenTracking(
  llm: BaseChatModel,
  sessionId: string
): BaseChatModel {
  // Store original invoke method
  const originalInvoke = llm.invoke.bind(llm);
  const originalStream = llm.stream ? llm.stream.bind(llm) : undefined;
  
  // Override invoke method
  llm.invoke = async function(
    messages: BaseMessage[],
    options?: any
  ): Promise<any> {
    const result = await originalInvoke(messages, options);
    
    // Try to extract token usage from result
    if (result && typeof result === 'object') {
      const usage = extractTokenUsage(result);
      if (usage) {
        updateSessionTokenUsage(sessionId, usage);
      }
    }
    
    return result;
  };
  
  // Override stream method if it exists
  if (originalStream) {
    llm.stream = async function(
      messages: BaseMessage[],
      options?: any
    ) {
      const originalStreamResult = await originalStream.call(llm, messages, options);
      let collectedUsage: TokenUsage | null = null;
      
      // Create a wrapper that tracks tokens while streaming
      const wrappedStream = {
        [Symbol.asyncIterator]: async function*() {
          for await (const chunk of originalStreamResult) {
            // Try to extract usage from chunks
            if (chunk && typeof chunk === 'object') {
              const usage = extractTokenUsage(chunk);
              if (usage) {
                collectedUsage = usage;
              }
            }
            yield chunk;
          }
          
          // Update usage after streaming completes
          if (collectedUsage) {
            updateSessionTokenUsage(sessionId, collectedUsage);
          }
        }
      };
      
      // Return the wrapped stream with all necessary properties
      return Object.assign(wrappedStream, originalStreamResult);
    };
  }
  
  return llm;
}

/**
 * Extract token usage from various response formats
 */
function extractTokenUsage(data: any): TokenUsage | null {
  // Check common locations for token usage
  const usage = 
    data.usage_metadata ||
    data.response_metadata?.usage ||
    data.response_metadata?.tokenUsage ||
    data.usage ||
    data.llmOutput?.usage ||
    data.llmOutput?.tokenUsage ||
    data.additional_kwargs?.usage ||
    null;
  
  if (!usage) return null;
  
  return {
    promptTokens: usage.prompt_tokens || usage.promptTokens || usage.input_tokens,
    completionTokens: usage.completion_tokens || usage.completionTokens || usage.output_tokens,
    totalTokens: usage.total_tokens || usage.totalTokens
  };
}

/**
 * Update session token usage
 */
function updateSessionTokenUsage(sessionId: string, usage: TokenUsage) {
  const existing = sessionTokenUsage.get(sessionId) || {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  };
  
  sessionTokenUsage.set(sessionId, {
    promptTokens: (existing.promptTokens || 0) + (usage.promptTokens || 0),
    completionTokens: (existing.completionTokens || 0) + (usage.completionTokens || 0),
    totalTokens: (existing.totalTokens || 0) + (usage.totalTokens || 0)
  });
}

/**
 * Get token usage for a session
 */
export function getSessionTokenUsage(sessionId: string): TokenUsage | null {
  return sessionTokenUsage.get(sessionId) || null;
}

/**
 * Clear token usage for a session
 */
export function clearSessionTokenUsage(sessionId: string) {
  sessionTokenUsage.delete(sessionId);
}

/**
 * Get all session token usage
 */
export function getAllSessionTokenUsage(): Map<string, TokenUsage> {
  return new Map(sessionTokenUsage);
}