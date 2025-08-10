/**
 * Shared types for the conversation memory system
 */

export type MemoryKind = 
  | 'profile'      // User identity info (name, email, etc.)
  | 'preference'   // User preferences and settings
  | 'fact'         // General facts stated
  | 'decision'     // Decisions made
  | 'outcome'      // Task results and outcomes
  | 'id'           // IDs, tickets, reference numbers
  | 'snippet';     // Code snippets or configurations

export type ConsentState = 'implicit' | 'explicit' | 'denied';

export type MemorySource = 'user' | 'assistant_tool' | 'system';

/**
 * Core memory item structure
 * Represents a single piece of remembered information
 */
export interface MemoryItem {
  id?: string;
  conversationId?: string;
  ownerId?: string;
  kind: MemoryKind;
  key?: string;              // Canonical key (e.g., 'user_email')
  value: any;                // The actual memory content (normalized)
  languageCode?: string;     // ISO 639-1 language code
  salience?: number;         // Importance score (0-4 or normalized 0-1)
  noveltyHash?: string;      // SHA-256 hash for deduplication
  embedding?: number[];      // Vector embedding for semantic search
  pii?: boolean;             // Contains personally identifiable information
  consent?: ConsentState;    // Consent status for PII
  source: MemorySource;      // Where this memory came from
  sourceRef?: string;        // Message ID or tool run ID
  createdAt?: Date | string;
  lastUsedAt?: Date | string;
  ttlDays?: number;          // Time to live in days
}

/**
 * Salience scoring components
 * Each component is scored 0-1
 */
export interface SalienceComponents {
  importance: number;   // How critical is this information?
  usefulness: number;   // How likely to be referenced again?
  longevity: number;    // How long will this remain relevant?
  novelty: number;      // How new/unique is this information?
}

/**
 * Memory extraction result from the structured extractor
 */
export interface ExtractionResult {
  valuable: boolean;
  memories: MemoryItem[];
  reasons?: string;
  confidence?: number;
}

/**
 * Compact memory context for injection into prompts
 */
export interface MemoryContext {
  summary: string;           // ≤250 token summary
  keyValues: Record<string, any>;  // Important KV pairs
  recentMemories: MemoryItem[];    // Top-K recent memories
}

/**
 * Configuration for the memory system
 */
export interface MemoryConfig {
  // Gate configuration
  gateMode: 'llm' | 'embedding';
  anthropicApiKey?: string;
  embeddingEndpoint?: string;
  
  // Extraction configuration
  extractorModel?: string;
  maxExtractionTokens?: number;
  
  // Storage configuration
  minSalience?: number;      // Minimum salience to store (default 2.2)
  dedupeThreshold?: number;  // Similarity threshold for deduplication (default 0.92)
  
  // Context configuration
  maxSummaryTokens?: number; // Max tokens for summary (default 250)
  topKMemories?: number;     // Number of memories to inject (default 5)
  
  // TTL configuration
  conversationTTL?: number;  // Days to keep conversation memories (default 365)
  userTTL?: number;          // Days to keep user memories (default 730)
}

/**
 * Memory storage interface
 * Implementations handle database operations
 */
export interface MemoryStore {
  // Write operations
  save(memory: MemoryItem): Promise<string>;
  saveBatch(memories: MemoryItem[]): Promise<string[]>;
  
  // Read operations
  get(id: string): Promise<MemoryItem | null>;
  getByKey(ownerId: string, key: string): Promise<MemoryItem | null>;
  getConversationMemories(conversationId: string, limit?: number): Promise<MemoryItem[]>;
  getUserMemories(ownerId: string, limit?: number): Promise<MemoryItem[]>;
  
  // Update operations
  update(id: string, updates: Partial<MemoryItem>): Promise<void>;
  updateLastUsed(id: string): Promise<void>;
  
  // Delete operations
  delete(id: string): Promise<void>;
  deleteExpired(): Promise<number>;
  
  // Search operations
  findSimilar(embedding: number[], threshold?: number): Promise<MemoryItem[]>;
  checkDuplicate(noveltyHash: string, conversationId?: string): Promise<boolean>;
}

/**
 * Default configuration values
 */
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  gateMode: 'llm',
  extractorModel: 'claude-3-5-haiku-latest',
  maxExtractionTokens: 300,
  minSalience: 2.2,
  dedupeThreshold: 0.92,
  maxSummaryTokens: 250,
  topKMemories: 5,
  conversationTTL: 365,
  userTTL: 730
};

/**
 * Helper to calculate total salience score
 */
export function calculateSalience(components: SalienceComponents): number {
  return components.importance + 
         components.usefulness + 
         components.longevity + 
         components.novelty;
}

/**
 * Helper to apply time decay to salience scores
 */
export function applyTimeDecay(
  salience: number, 
  ageInDays: number, 
  lambda: number = 0.01
): number {
  return salience * Math.exp(-lambda * ageInDays);
}

/**
 * Helper to determine memory kind from content
 */
export function inferMemoryKind(key?: string, value?: any): MemoryKind {
  if (!key && !value) return 'fact';
  
  const keyLower = key?.toLowerCase() || '';
  
  // Check key patterns
  if (keyLower.includes('email') || keyLower.includes('name') || keyLower.includes('phone')) {
    return 'profile';
  }
  if (keyLower.includes('preference') || keyLower.includes('setting') || keyLower.includes('config')) {
    return 'preference';
  }
  if (keyLower.includes('decision') || keyLower.includes('choice')) {
    return 'decision';
  }
  if (keyLower.includes('result') || keyLower.includes('outcome')) {
    return 'outcome';
  }
  if (keyLower.includes('id') || keyLower.includes('ticket') || keyLower.includes('reference')) {
    return 'id';
  }
  if (keyLower.includes('code') || keyLower.includes('snippet')) {
    return 'snippet';
  }
  
  // Check value patterns
  if (typeof value === 'object' && value !== null) {
    if ('email' in value || 'name' in value || 'phone' in value) {
      return 'profile';
    }
    if ('id' in value || 'uuid' in value || 'ticket' in value) {
      return 'id';
    }
  }
  
  return 'fact';
}