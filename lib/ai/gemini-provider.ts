/**
 * Gemini AI Provider
 *
 * Uses @google/genai SDK for embeddings and chat completions.
 */

import { GoogleGenAI } from '@google/genai';

import type { AIProvider, ChatMessage, CompletionOptions } from './types';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini' as const;
  private ai: GoogleGenAI;
  private embeddingModel: string;
  private embeddingDimensions: number;
  private completionModel: string;

  constructor(params: {
    apiKey: string;
    embeddingModel?: string;
    embeddingDimensions?: number;
    completionModel?: string;
  }) {
    this.ai = new GoogleGenAI({ apiKey: params.apiKey });
    this.embeddingModel = params.embeddingModel || 'gemini-embedding-001';
    this.embeddingDimensions = params.embeddingDimensions || 768;
    this.completionModel = params.completionModel || 'gemini-2.5-flash-lite';
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.ai.models.embedContent({
      model: this.embeddingModel,
      contents: text,
      config: {
        outputDimensionality: this.embeddingDimensions,
      },
    });
    return response.embeddings?.[0]?.values ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Gemini SDK doesn't have a native batch embed in the JS SDK,
    // so we parallelize individual calls
    const results = await Promise.all(texts.map(t => this.embed(t)));
    return results;
  }

  async complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string> {
    // Separate system instruction from conversation messages
    const systemParts = messages.filter(m => m.role === 'system');
    const conversationParts = messages.filter(m => m.role !== 'system');

    const systemInstruction = systemParts.length > 0
      ? systemParts.map(m => m.content).join('\n\n')
      : undefined;

    // Build contents from non-system messages
    const contents = conversationParts.map(m => ({
      role: m.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }],
    }));

    const response = await this.ai.models.generateContent({
      model: this.completionModel,
      contents,
      config: {
        systemInstruction,
        temperature: options?.temperature,
        maxOutputTokens: options?.maxTokens,
        ...(options?.json ? { responseMimeType: 'application/json' } : {}),
      },
    });

    return response.text ?? '';
  }
}
