/**
 * Token estimation utilities for different LLM providers
 * Provides approximate token counts when actual usage is not available
 */

/**
 * Estimate token count for text (rough approximation)
 * This is a fallback when we can't get actual token counts
 */
export function estimateTokens(text: string, provider: string = 'openai'): number {
  if (!text) return 0;
  
  // Different providers have different tokenization approaches
  // These are rough approximations based on common patterns
  
  let charsPerToken: number;
  
  switch (provider) {
    case 'anthropic':
      // Claude models typically use ~3-4 chars per token
      charsPerToken = 3.5;
      break;
    case 'openai':
      // GPT models typically use ~4 chars per token
      charsPerToken = 4;
      break;
    case 'google':
      // Gemini models are similar to GPT
      charsPerToken = 4;
      break;
    case 'xai':
      // Grok models are similar to GPT
      charsPerToken = 4;
      break;
    default:
      charsPerToken = 4;
  }
  
  // Basic estimation
  const estimatedTokens = Math.ceil(text.length / charsPerToken);
  
  // Adjust for common patterns that affect tokenization
  const adjustments = {
    // Code blocks typically have more tokens
    codeBlocks: (text.match(/```[\s\S]*?```/g) || []).length * 10,
    // URLs are often split into many tokens
    urls: (text.match(/https?:\/\/[^\s]+/g) || []).length * 5,
    // Numbers and special characters often become individual tokens
    specialChars: (text.match(/[0-9\$\%\#\@\!\?\*\+\=\-\_\|\\\/<>]/g) || []).length * 0.5,
    // Newlines and formatting
    newlines: (text.match(/\n/g) || []).length * 0.5
  };
  
  const totalAdjustment = Object.values(adjustments).reduce((sum, val) => sum + val, 0);
  
  return Math.ceil(estimatedTokens + totalAdjustment);
}

/**
 * Estimate tokens for a conversation
 */
export function estimateConversationTokens(
  messages: Array<{ role: string; content: string }>,
  provider: string = 'openai'
): { promptTokens: number; completionTokens: number; totalTokens: number } {
  let promptTokens = 0;
  let completionTokens = 0;
  
  // System messages and user messages count as prompt tokens
  // Assistant messages count as completion tokens
  for (const message of messages) {
    const tokens = estimateTokens(message.content, provider);
    
    if (message.role === 'assistant' || message.role === 'ai') {
      completionTokens += tokens;
    } else {
      promptTokens += tokens;
    }
    
    // Add overhead for message metadata (role, etc.)
    promptTokens += 4; // Approximate overhead per message
  }
  
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens
  };
}

/**
 * Create a fallback token usage object with estimates
 */
export function createEstimatedUsage(
  query: string,
  response: string,
  provider: string = 'openai'
): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated: boolean;
} {
  const promptTokens = estimateTokens(query, provider) + 10; // Add system prompt overhead
  const completionTokens = estimateTokens(response, provider);
  
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    estimated: true
  };
}