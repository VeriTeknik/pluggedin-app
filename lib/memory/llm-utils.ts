import type { AIMessageChunk } from '@langchain/core/messages';

/**
 * Extract the text content from an LLM response message.
 */
export function extractResponseText(response: AIMessageChunk): string {
  return typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);
}

/**
 * Parse a JSON object from LLM response text that may contain markdown code blocks.
 */
export function parseJsonFromResponse<T = Record<string, unknown>>(text: string): T {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse JSON from LLM response');
  }
  return JSON.parse(jsonMatch[0]) as T;
}
