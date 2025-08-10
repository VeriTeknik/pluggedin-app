/**
 * Tier-2 Memory Gate
 * Decides whether a conversation turn contains new, valuable information worth remembering
 * Supports both LLM-based and embedding-based gating strategies
 */

import Anthropic from '@anthropic-ai/sdk';

export type GateMode = 'llm' | 'embedding';

export interface GateDecision {
  remember: boolean;
  reason?: string;
  confidence?: number;
}

export interface GateContext {
  conversationSummary: string; // ≤250 tokens
  userMessage: string;         // Last user message
  assistantMessage?: string;    // Last assistant response
  existingMemories?: string[];  // Recent memory keys to avoid duplicates
}

/**
 * Configuration for the memory gate
 */
export interface GateConfig {
  mode: GateMode;
  anthropicApiKey?: string;
  embeddingEndpoint?: string;
  llmModel?: string;
  maxSummaryTokens?: number;
  minConfidence?: number;
}

const DEFAULT_CONFIG: Partial<GateConfig> = {
  mode: 'llm',
  llmModel: 'claude-3-5-haiku-latest',
  maxSummaryTokens: 250,
  minConfidence: 0.7
};

/**
 * Mini-LLM Gate using Anthropic's Haiku model
 * Fast, cheap binary classification for memory decisions
 */
export async function llmGate(
  context: GateContext,
  config: GateConfig
): Promise<GateDecision> {
  if (!config.anthropicApiKey) {
    throw new Error('Anthropic API key required for LLM gate');
  }
  
  const anthropic = new Anthropic({ 
    apiKey: config.anthropicApiKey 
  });
  
  // System prompt optimized for binary classification
  const systemPrompt = `You are a strict memory filter for a conversation system.
Your job is to decide if the latest exchange contains NEW, VALUABLE information worth remembering.

Memory types that should be remembered:
- User identity (name, email, phone, location)
- Stable preferences and settings
- Important decisions made
- Task outcomes and results
- IDs, ticket numbers, reference codes
- File paths, URLs, API endpoints
- Scheduled events or deadlines

Do NOT remember:
- Small talk or greetings
- Questions without answers
- Temporary states or in-progress work
- Information already in existing memories
- Generic confirmations or acknowledgments

Output JSON only: {"remember": true|false, "reason": "brief explanation"}`;

  // Build the user prompt with context
  let userPrompt = '';
  
  if (context.conversationSummary) {
    userPrompt += `Context: ${context.conversationSummary}\n\n`;
  }
  
  if (context.existingMemories && context.existingMemories.length > 0) {
    userPrompt += `Already remembered: ${context.existingMemories.slice(0, 5).join(', ')}\n\n`;
  }
  
  userPrompt += `User: ${context.userMessage.slice(0, 500)}\n`;
  
  if (context.assistantMessage) {
    userPrompt += `Assistant: ${context.assistantMessage.slice(0, 500)}`;
  }
  
  try {
    const response = await anthropic.messages.create({
      model: config.llmModel || DEFAULT_CONFIG.llmModel!,
      max_tokens: 120,
      temperature: 0,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    });
    
    const content = response.content[0];
    if (content.type === 'text') {
      try {
        const decision = JSON.parse(content.text);
        return {
          remember: Boolean(decision.remember),
          reason: decision.reason || undefined,
          confidence: decision.remember ? 0.9 : 0.1
        };
      } catch (parseError) {
        console.error('Failed to parse LLM response:', content.text);
        return { remember: false, reason: 'Parse error', confidence: 0 };
      }
    }
    
    return { remember: false, reason: 'No text response', confidence: 0 };
    
  } catch (error) {
    console.error('LLM gate error:', error);
    // Fallback to not remembering on error
    return { 
      remember: false, 
      reason: error instanceof Error ? error.message : 'Unknown error',
      confidence: 0 
    };
  }
}

/**
 * Embedding-based gate using prototype matching
 * No LLM calls, uses cosine similarity to prototype patterns
 */
export async function embeddingGate(
  context: GateContext,
  config: GateConfig
): Promise<GateDecision> {
  // Prototype patterns that indicate memorable content
  // These are in English but embeddings handle multilingual matching
  const MEMORY_PROTOTYPES = [
    "my name is",
    "my email is",
    "my phone number is",
    "i prefer to use",
    "please use this by default",
    "we have decided to",
    "the final decision is",
    "task completed successfully",
    "here is the result",
    "the ticket number is",
    "the reference code is",
    "schedule this for",
    "the deadline is",
    "my address is",
    "i am located in",
    "my language preference is",
    "connect to this service",
    "use this API endpoint",
    "the file is saved at",
    "the database host is"
  ];
  
  // Combine user and assistant messages for embedding
  const text = context.userMessage + ' ' + (context.assistantMessage || '');
  
  if (!config.embeddingEndpoint) {
    // If no embedding endpoint, fall back to simple keyword matching
    const lowerText = text.toLowerCase();
    
    // Check for strong indicators
    const strongIndicators = [
      '@', // Email
      'http', // URL
      'ticket', 'reference', 'code', 'number',
      'decided', 'decision', 'completed', 'result',
      'name is', 'email is', 'phone',
      'deadline', 'schedule',
      'port', 'host', 'database', 'endpoint', // Technical config
      'configured', 'setting', 'preference' // Settings
    ];
    
    const hasStrongIndicator = strongIndicators.some(indicator => 
      lowerText.includes(indicator)
    );
    
    if (hasStrongIndicator) {
      // Check it's not already in existing memories
      if (context.existingMemories && context.existingMemories.length > 0) {
        const memoryText = context.existingMemories.join(' ').toLowerCase();
        
        // Extract key information from the message
        const keyInfo: string[] = [];
        
        // Extract email if present
        const emailMatch = lowerText.match(/[\w._%+-]+@[\w.-]+\.[a-z]{2,}/);
        if (emailMatch) keyInfo.push(emailMatch[0]);
        
        // Extract name patterns
        const nameMatch = lowerText.match(/(?:my )?name is (\w+)/);
        if (nameMatch) keyInfo.push(nameMatch[1]);
        
        // Check if key info already exists in memories
        if (keyInfo.length > 0) {
          const isDuplicate = keyInfo.every(info => memoryText.includes(info));
          if (isDuplicate) {
            return {
              remember: false,
              reason: 'Likely duplicate of existing memory',
              confidence: 0.3
            };
          }
        }
      }
      
      return {
        remember: true,
        reason: 'Contains memory indicators',
        confidence: 0.75
      };
    }
    
    return {
      remember: false,
      reason: 'No memory indicators found',
      confidence: 0.2
    };
  }
  
  // TODO: Implement actual embedding-based similarity when endpoint is available
  // This would:
  // 1. Get embedding for the current text
  // 2. Get embeddings for prototypes (cached)
  // 3. Calculate cosine similarity
  // 4. Return true if similarity > threshold (e.g., 0.78)
  
  return {
    remember: false,
    reason: 'Embedding endpoint not implemented',
    confidence: 0
  };
}

/**
 * Main gate function that routes to appropriate implementation
 */
export async function memoryGate(
  context: GateContext,
  config?: Partial<GateConfig>
): Promise<GateDecision> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config } as GateConfig;
  
  // Quick validation
  if (!context.userMessage) {
    return { remember: false, reason: 'No user message', confidence: 0 };
  }
  
  // Very short messages rarely contain memorable info
  if (context.userMessage.length < 10) {
    return { remember: false, reason: 'Message too short', confidence: 0.1 };
  }
  
  // Route to appropriate gate implementation
  if (fullConfig.mode === 'llm') {
    return llmGate(context, fullConfig);
  } else {
    return embeddingGate(context, fullConfig);
  }
}

/**
 * Helper to compute cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}

/**
 * Check if we should skip gating based on artifacts
 * Tool outputs and structured data bypass the gate
 */
export function shouldSkipGate(hasArtifacts: boolean, isToolOutput: boolean): boolean {
  // Always process tool outputs - they often contain important IDs/results
  if (isToolOutput) {
    return true;
  }
  
  // If Tier-1 found artifacts (emails, URLs, IDs), skip gate and extract
  if (hasArtifacts) {
    return true;
  }
  
  return false;
}