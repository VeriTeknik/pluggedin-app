import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as crypto from 'crypto';

// Memory extraction schema
const MemorySchema = z.object({
  factType: z.enum([
    'personal_info',
    'preference',
    'relationship',
    'work_info',
    'technical_detail',
    'event',
    'goal',
    'problem',
    'solution',
    'context',
    'other'
  ]).describe('The type of information being remembered'),
  
  content: z.string().describe('The specific fact or information to remember'),
  
  subject: z.string().optional().describe('Who or what this memory is about (e.g., "user", "project X", "John")'),
  
  importance: z.number().min(1).max(10).describe('How important is this information (1-10)'),
  
  confidence: z.number().min(0).max(1).describe('Confidence in the accuracy of this memory (0-1)'),
  
  temporality: z.enum(['permanent', 'temporary', 'seasonal', 'unknown']).describe('How long this information is likely to remain true'),
  
  entities: z.array(z.string()).optional().describe('Named entities mentioned (people, places, organizations)'),
  
  relatedTopics: z.array(z.string()).optional().describe('Topics or domains this memory relates to'),
  
  expiresAt: z.string().optional().describe('ISO date when this memory might no longer be relevant'),
  
  sourceContext: z.string().optional().describe('Brief context about where this information came from')
});

const MemoryExtractionSchema = z.object({
  memories: z.array(MemorySchema).describe('List of extracted memories from the conversation'),
  
  conversationSummary: z.string().optional().describe('Brief summary of what was discussed'),
  
  userIntent: z.string().optional().describe('What the user was trying to achieve'),
  
  nextActions: z.array(z.string()).optional().describe('Any follow-up actions mentioned or implied'),
  
  emotionalTone: z.enum(['positive', 'neutral', 'negative', 'mixed']).optional().describe('Overall emotional tone of the conversation')
});

export type ExtractedMemory = z.infer<typeof MemorySchema>;
export type MemoryExtractionResult = z.infer<typeof MemoryExtractionSchema>;

export interface ExtractionContext {
  userId: string;
  conversationId: string;
  language?: string;
  existingMemories?: Array<{
    content: string;
    hash: string;
  }>;
}

export class StructuredMemoryExtractor {
  private model: ChatOpenAI;
  
  constructor(apiKey?: string) {
    this.model = new ChatOpenAI({
      openAIApiKey: apiKey || process.env.OPENAI_API_KEY,
      modelName: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 2000,
    });
  }
  
  /**
   * Extract memories from a conversation using structured output
   */
  async extractMemories(
    messages: Array<{ role: string; content: string }>,
    context: ExtractionContext
  ): Promise<MemoryExtractionResult> {
    try {
      // Build the extraction prompt
      const systemPrompt = this.buildSystemPrompt(context);
      const conversationText = this.formatConversation(messages);
      
      // Use function calling for structured extraction
      const response = await this.model.invoke([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: conversationText }
      ], {
        functions: [{
          name: 'extract_memories',
          description: 'Extract important memories and information from the conversation',
          parameters: zodToJsonSchema(MemoryExtractionSchema) as any
        }],
        function_call: { name: 'extract_memories' }
      });
      
      // Parse the function call response
      const functionCall = response.additional_kwargs?.function_call;
      if (!functionCall?.arguments) {
        console.warn('No function call in response');
        return { memories: [] };
      }
      
      const extractedData = JSON.parse(functionCall.arguments) as MemoryExtractionResult;
      
      // Add hashes and filter duplicates if existing memories provided
      if (context.existingMemories && context.existingMemories.length > 0) {
        const existingHashes = new Set(context.existingMemories.map(m => m.hash));
        
        extractedData.memories = extractedData.memories.filter(memory => {
          const hash = this.generateMemoryHash(memory.content);
          return !existingHashes.has(hash);
        });
      }
      
      // Add metadata to each memory
      extractedData.memories = extractedData.memories.map(memory => ({
        ...memory,
        hash: this.generateMemoryHash(memory.content),
        extractedAt: new Date().toISOString(),
        userId: context.userId,
        conversationId: context.conversationId
      })) as any;
      
      return extractedData;
      
    } catch (error) {
      console.error('Failed to extract memories:', error);
      return { memories: [] };
    }
  }
  
  /**
   * Extract a single important memory from a specific message
   */
  async extractSingleMemory(
    message: string,
    context: ExtractionContext
  ): Promise<ExtractedMemory | null> {
    try {
      const prompt = `Extract the most important fact or information from this message. If there's nothing worth remembering, return null.

Message: "${message}"

Consider:
- Is this information about the user, their preferences, or their situation?
- Is this technical information that might be referenced later?
- Is this a commitment, plan, or goal?
- Is this a problem that needs solving?`;
      
      const response = await this.model.invoke([
        { role: 'system', content: 'You are a memory extraction system. Extract only valuable, specific information.' },
        { role: 'user', content: prompt }
      ], {
        functions: [{
          name: 'extract_memory',
          description: 'Extract a single important memory from the message',
          parameters: zodToJsonSchema(MemorySchema) as any
        }],
        function_call: { name: 'extract_memory' }
      });
      
      const functionCall = response.additional_kwargs?.function_call;
      if (!functionCall?.arguments) {
        return null;
      }
      
      const memory = JSON.parse(functionCall.arguments) as ExtractedMemory;
      
      // Validate importance threshold
      if (memory.importance < 3) {
        return null; // Skip low-importance memories
      }
      
      return {
        ...memory,
        hash: this.generateMemoryHash(memory.content),
        extractedAt: new Date().toISOString(),
        userId: context.userId,
        conversationId: context.conversationId
      } as any;
      
    } catch (error) {
      console.error('Failed to extract single memory:', error);
      return null;
    }
  }
  
  /**
   * Calculate salience score for a memory
   */
  calculateSalience(memory: ExtractedMemory): number {
    let score = 0;
    
    // Importance (0-10 -> 0-0.4)
    score += (memory.importance / 10) * 0.4;
    
    // Confidence (0-1 -> 0-0.2)
    score += memory.confidence * 0.2;
    
    // Temporality bonus (0-0.2)
    const temporalityScores = {
      permanent: 0.2,
      seasonal: 0.1,
      temporary: 0.05,
      unknown: 0
    };
    score += temporalityScores[memory.temporality];
    
    // Entity bonus (0-0.1)
    if (memory.entities && memory.entities.length > 0) {
      score += Math.min(memory.entities.length * 0.02, 0.1);
    }
    
    // Fact type bonus (0-0.1)
    const factTypeScores = {
      personal_info: 0.1,
      preference: 0.08,
      goal: 0.08,
      problem: 0.07,
      work_info: 0.06,
      relationship: 0.06,
      technical_detail: 0.05,
      solution: 0.05,
      event: 0.03,
      context: 0.02,
      other: 0
    };
    score += factTypeScores[memory.factType];
    
    return Math.min(score, 1); // Cap at 1.0
  }
  
  private buildSystemPrompt(context: ExtractionContext): string {
    const languageInstruction = context.language 
      ? `The conversation is in ${context.language}. Extract memories in the same language.`
      : 'Extract memories in the language used in the conversation.';
    
    return `You are an intelligent memory extraction system for a conversational AI assistant.
Your task is to identify and extract important information that should be remembered for future conversations.

${languageInstruction}

Focus on extracting:
1. Personal information about users (name, role, preferences, situation)
2. Technical details, configurations, or specifications mentioned
3. Goals, plans, or commitments made
4. Problems or challenges discussed
5. Relationships and connections between people or concepts
6. Preferences and opinions expressed
7. Important events or deadlines mentioned

Guidelines:
- Only extract concrete, specific facts (not vague statements)
- Assign realistic importance scores (most things are 3-7, reserve 8-10 for critical info)
- Be confident only when information is clearly stated
- Identify the subject of each memory (who or what it's about)
- Extract entities (names, organizations, places) when mentioned
- Consider how long information will remain relevant
- Don't extract memories about the AI assistant itself unless specifically requested

Quality over quantity: Extract only information that would be valuable to remember in future conversations.`;
  }
  
  private formatConversation(messages: Array<{ role: string; content: string }>): string {
    return messages
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');
  }
  
  private generateMemoryHash(content: string): string {
    return crypto
      .createHash('sha256')
      .update(content.toLowerCase().trim())
      .digest('hex')
      .substring(0, 16);
  }
  
  /**
   * Rank memories by salience for context injection
   */
  rankMemories(memories: ExtractedMemory[]): ExtractedMemory[] {
    return memories
      .map(memory => ({
        ...memory,
        salience: this.calculateSalience(memory)
      }))
      .sort((a, b) => (b as any).salience - (a as any).salience);
  }
  
  /**
   * Filter memories based on relevance to current context
   */
  filterRelevantMemories(
    memories: ExtractedMemory[],
    currentTopic: string,
    maxMemories: number = 10
  ): ExtractedMemory[] {
    // This is a simple implementation - could be enhanced with embeddings
    const topicWords = currentTopic.toLowerCase().split(/\s+/);
    
    const scoredMemories = memories.map(memory => {
      let relevanceScore = 0;
      
      // Check content relevance
      const contentLower = memory.content.toLowerCase();
      topicWords.forEach(word => {
        if (contentLower.includes(word)) {
          relevanceScore += 1;
        }
      });
      
      // Check topic relevance
      if (memory.relatedTopics) {
        memory.relatedTopics.forEach(topic => {
          if (topicWords.some(word => topic.toLowerCase().includes(word))) {
            relevanceScore += 2;
          }
        });
      }
      
      // Check entity relevance
      if (memory.entities) {
        memory.entities.forEach(entity => {
          if (topicWords.some(word => entity.toLowerCase().includes(word))) {
            relevanceScore += 1.5;
          }
        });
      }
      
      return {
        memory,
        relevanceScore,
        salience: this.calculateSalience(memory)
      };
    });
    
    // Sort by combined score (relevance + salience)
    return scoredMemories
      .sort((a, b) => {
        const scoreA = a.relevanceScore * 0.6 + a.salience * 0.4;
        const scoreB = b.relevanceScore * 0.6 + b.salience * 0.4;
        return scoreB - scoreA;
      })
      .slice(0, maxMemories)
      .map(item => item.memory);
  }
}