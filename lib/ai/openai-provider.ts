/**
 * OpenAI AI Provider
 *
 * Uses @langchain/openai for backward compatibility with existing setup.
 */

import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';

import type { AIProvider, ChatMessage, CompletionOptions } from './types';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai' as const;
  private apiKey: string;
  private embeddingModel: string;
  private embeddingDimensions: number;
  private completionModel: string;
  private embeddings: OpenAIEmbeddings | null = null;

  constructor(params: {
    apiKey: string;
    embeddingModel?: string;
    embeddingDimensions?: number;
    completionModel?: string;
  }) {
    this.apiKey = params.apiKey;
    this.embeddingModel = params.embeddingModel || 'text-embedding-3-small';
    this.embeddingDimensions = params.embeddingDimensions || 1536;
    this.completionModel = params.completionModel || 'gpt-4o-mini';
  }

  private getEmbeddings(): OpenAIEmbeddings {
    if (!this.embeddings) {
      this.embeddings = new OpenAIEmbeddings({
        openAIApiKey: this.apiKey,
        modelName: this.embeddingModel,
        dimensions: this.embeddingDimensions,
      });
    }
    return this.embeddings;
  }

  async embed(text: string): Promise<number[]> {
    return this.getEmbeddings().embedQuery(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.getEmbeddings().embedDocuments(texts);
  }

  async complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string> {
    const llm = new ChatOpenAI({
      openAIApiKey: this.apiKey,
      modelName: this.completionModel,
      temperature: options?.temperature ?? 0.1,
      maxTokens: options?.maxTokens,
      ...(options?.json ? { modelKwargs: { response_format: { type: 'json_object' } } } : {}),
    });

    const response = await llm.invoke(
      messages.map(m => ({ role: m.role, content: m.content }))
    );

    // Extract text from LangChain response
    const content = response.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(p => p.type === 'text')
        .map(p => (p as { type: 'text'; text: string }).text)
        .join('');
    }
    return String(content);
  }
}
