/**
 * Memory System Types
 *
 * Human cognition-inspired memory architecture:
 * Focus Agent → Fresh Memory → Analytics Agent → Memory Ring → Gut Agent
 */

// ============================================================================
// Enums (varchar values matching DB schema)
// ============================================================================

/** Memory session status */
export const MemorySessionStatus = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
} as const;
export type MemorySessionStatus = (typeof MemorySessionStatus)[keyof typeof MemorySessionStatus];

/** Observation types captured in fresh memory */
export const ObservationType = {
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
  USER_PREFERENCE: 'user_preference',
  ERROR_PATTERN: 'error_pattern',
  DECISION: 'decision',
  SUCCESS_PATTERN: 'success_pattern',
  FAILURE_PATTERN: 'failure_pattern',
  WORKFLOW_STEP: 'workflow_step',
  INSIGHT: 'insight',
  CONTEXT_SWITCH: 'context_switch',
} as const;
export type ObservationType = (typeof ObservationType)[keyof typeof ObservationType];

/** Memory ring types - the four concentric memory categories */
export const RingType = {
  PROCEDURES: 'procedures',
  PRACTICE: 'practice',
  LONGTERM: 'longterm',
  SHOCKS: 'shocks',
} as const;
export type RingType = (typeof RingType)[keyof typeof RingType];

/** Memory decay stages with token economics */
export const DecayStage = {
  FULL: 'full',           // ~500 tokens - original
  COMPRESSED: 'compressed', // ~250 tokens - first compression
  SUMMARY: 'summary',     // ~150 tokens - second compression
  ESSENCE: 'essence',     // ~50 tokens - final distillation
  FORGOTTEN: 'forgotten', // Marked for deletion
} as const;
export type DecayStage = (typeof DecayStage)[keyof typeof DecayStage];

/** Observation outcome tracking */
export const Outcome = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  NEUTRAL: 'neutral',
} as const;
export type Outcome = (typeof Outcome)[keyof typeof Outcome];

/** Gut pattern types */
export const PatternType = {
  TOOL_SEQUENCE: 'tool_sequence',
  ERROR_RECOVERY: 'error_recovery',
  WORKFLOW: 'workflow',
  PREFERENCE: 'preference',
  BEST_PRACTICE: 'best_practice',
  // CBP extended types
  ERROR_SOLUTION: 'error_solution',
  ANTI_PATTERN: 'anti_pattern',
  GOTCHA: 'gotcha',
  MIGRATION_NOTE: 'migration_note',
  COMPATIBILITY: 'compatibility',
  PERFORMANCE_TIP: 'performance_tip',
  SECURITY_WARNING: 'security_warning',
  // Jungian Intelligence Layer (v3.2.0)
  SYNCHRONICITY: 'synchronicity',
} as const;
export type PatternType = (typeof PatternType)[keyof typeof PatternType];

/** Feedback types for collective patterns */
export const FeedbackType = {
  HELPFUL: 'helpful',
  INACCURATE: 'inaccurate',
  OUTDATED: 'outdated',
  DANGEROUS: 'dangerous',
} as const;
export type FeedbackType = (typeof FeedbackType)[keyof typeof FeedbackType];

/** Feedback type values array for Zod enum validation */
export const FEEDBACK_TYPE_VALUES = Object.values(FeedbackType) as [string, ...string[]];

/** CBP injection trigger contexts */
export const InjectionContext = {
  PROACTIVE_WARNING: 'proactive_warning',
  POST_ERROR: 'post_error',
  CONTEXTUAL: 'contextual',
} as const;
export type InjectionContext = (typeof InjectionContext)[keyof typeof InjectionContext];

// ============================================================================
// Z-Report Types
// ============================================================================

/** Z-Report structure stored in memory_sessions.z_report JSONB */
export interface ZReport {
  summary: string;
  token_count: number;
  key_observations: string[];
  decisions_made: string[];
  tools_used: string[];
  success_rate: number;
  generated_at: string;
  generated_by_model?: string;
}

// ============================================================================
// Focus Agent Types
// ============================================================================

/** Focus item in the working set (7±2 items) */
export interface FocusItem {
  id: string;
  content: string;
  relevance_score: number;
  added_at: string;
}

// ============================================================================
// Service Parameter Types
// ============================================================================

export interface StartSessionParams {
  profileUuid: string;
  agentUuid?: string;
  contentSessionId: string;
}

export interface AddObservationParams {
  profileUuid: string;
  sessionUuid: string;
  agentUuid?: string;
  type: ObservationType;
  content: string;
  outcome?: Outcome;
  metadata?: {
    tool_name?: string;
    mcp_server?: string;
    error_code?: string;
    related_memory_uuids?: string[];
    context_hash?: string;
    [key: string]: unknown;
  };
}

export interface SearchMemoriesParams {
  profileUuid: string;
  query: string;
  ringTypes?: RingType[];
  agentUuid?: string;
  topK?: number;
  includeGut?: boolean;
  threshold?: number;
}

export interface ClassificationResult {
  observationUuid: string;
  ringType: RingType;
  confidence: number;
  reason: string;
  isShock?: boolean;
  shockSeverity?: number;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface MemoryResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface MemorySearchResult {
  uuid: string;
  ringType: RingType;
  content: string;
  similarity: number;
  decayStage: DecayStage;
  tokenCount: number;
  tags: string[];
  createdAt: string;
  lastAccessedAt?: string;
}

export interface MemoryTimelineEntry {
  uuid: string;
  ringType: RingType;
  content: string;
  contentCompressed?: string;
  similarity: number;
  sessionUuid?: string;
  sessionStartedAt?: string;
  sourceObservationCount: number;
  createdAt: string;
  decayStage: DecayStage;
  accessCount: number;
  relevanceScore: number;
}

export interface MemoryFullDetail {
  uuid: string;
  profileUuid: string;
  agentUuid?: string;
  ringType: RingType;
  contentFull?: string;
  contentCompressed?: string;
  contentSummary?: string;
  contentEssence?: string;
  currentDecayStage: DecayStage;
  currentTokenCount: number;
  accessCount: number;
  lastAccessedAt?: string;
  relevanceScore: number;
  successScore?: number;
  reinforcementCount: number;
  isShock: boolean;
  shockSeverity?: number;
  tags: string[];
  metadata: Record<string, unknown>;
  sourceSessionUuid?: string;
  sourceObservationUuids?: string[];
  nextDecayAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryStats {
  totalSessions: number;
  activeSessions: number;
  totalFreshMemories: number;
  unclassifiedCount: number;
  ringCounts: Record<RingType, number>;
  decayStageCounts: Record<DecayStage, number>;
  totalGutPatterns: number;
  oldestMemory?: string;
  newestMemory?: string;
}
