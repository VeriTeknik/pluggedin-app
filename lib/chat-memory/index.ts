/**
 * Conversation Memory System
 * 
 * A multilingual, intelligent memory system for persisting valuable
 * conversational facts across chat sessions.
 * 
 * Architecture:
 * 1. Tier-1 Artifact Detection - Language-agnostic pattern matching
 * 2. Tier-2 Memory Gate - LLM or embedding-based filtering
 * 3. Structured Extraction - Tool/JSON mode extraction
 * 4. Memory Store - Database persistence with deduplication
 * 5. Context Builder - Compact memory injection for prompts
 */

// Export all types
export * from './types';

// Export artifact detector
export {
  detectArtifacts,
  detectToolArtifacts,
  containsPII,
  getMostValuableArtifact,
  type ArtifactType,
  type DetectedArtifact,
  type ArtifactDetectionResult
} from './artifact-detector';

// Export memory gate
export {
  memoryGate,
  llmGate,
  embeddingGate,
  shouldSkipGate,
  cosineSimilarity,
  type GateMode,
  type GateDecision,
  type GateContext,
  type GateConfig
} from './memory-gate';

// Re-export commonly used functions
export { detectArtifacts as detectMemoryArtifacts } from './artifact-detector';
export { memoryGate as checkMemoryGate } from './memory-gate';

/**
 * Main memory extraction pipeline
 * Combines artifact detection, gating, and extraction
 */
export async function extractMemories(
  userMessage: string,
  assistantMessage?: string,
  options?: {
    conversationSummary?: string;
    existingMemories?: string[];
    isToolOutput?: boolean;
    anthropicApiKey?: string;
    gateMode?: 'llm' | 'embedding';
  }
): Promise<{
  shouldRemember: boolean;
  artifacts: any;
  gateDecision?: any;
  reason?: string;
}> {
  // Import dependencies
  const { detectArtifacts, detectToolArtifacts } = await import('./artifact-detector');
  const { memoryGate, shouldSkipGate } = await import('./memory-gate');
  
  // Step 1: Detect artifacts
  const text = userMessage + ' ' + (assistantMessage || '');
  const artifactResult = options?.isToolOutput 
    ? detectToolArtifacts(assistantMessage || userMessage)
    : detectArtifacts(text);
  
  // Step 2: Check if we should skip the gate
  if (shouldSkipGate(artifactResult.hasArtifacts, options?.isToolOutput || false)) {
    return {
      shouldRemember: true,
      artifacts: artifactResult.artifacts,
      reason: 'Contains artifacts or tool output'
    };
  }
  
  // Step 3: Run through the gate
  const gateDecision = await memoryGate(
    {
      conversationSummary: options?.conversationSummary || '',
      userMessage,
      assistantMessage,
      existingMemories: options?.existingMemories
    },
    {
      mode: options?.gateMode || 'embedding',
      anthropicApiKey: options?.anthropicApiKey
    }
  );
  
  return {
    shouldRemember: gateDecision.remember,
    artifacts: artifactResult.artifacts,
    gateDecision,
    reason: gateDecision.reason
  };
}

/**
 * Example usage of the memory system
 */
export const MEMORY_SYSTEM_EXAMPLE = `
// Extract memories from a conversation turn
const result = await extractMemories(
  "My email is john@example.com", 
  "I've saved your email as john@example.com",
  {
    conversationSummary: "User is setting up their profile",
    existingMemories: ["user_name: John"],
    gateMode: 'embedding'
  }
);

if (result.shouldRemember) {
  console.log('Found memories:', result.artifacts);
  // Save to database...
}
`;