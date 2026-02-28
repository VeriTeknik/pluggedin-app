/**
 * Memory System Constants
 *
 * Thresholds, token limits, decay schedules, and configuration defaults.
 */

import type { DecayStage } from './types';

// ============================================================================
// Token Budgets (per decay stage)
// ============================================================================

export const TOKEN_BUDGETS: Record<string, number> = {
  full: 500,
  compressed: 250,
  summary: 150,
  essence: 50,
  forgotten: 0,
};

// ============================================================================
// Decay Schedule (days until next compression)
// ============================================================================

export const DECAY_SCHEDULE_DAYS: Record<string, number> = {
  full: 7,        // 7 days at full → compress
  compressed: 30, // 30 days compressed → summarize
  summary: 90,    // 90 days summary → essence
  essence: 365,   // 365 days essence → forgotten
};

/** Next decay stage mapping */
export const NEXT_DECAY_STAGE: Record<string, DecayStage | null> = {
  full: 'compressed',
  compressed: 'summary',
  summary: 'essence',
  essence: 'forgotten',
  forgotten: null,
};

// ============================================================================
// Decay Multipliers
// ============================================================================

/** Memories reinforced > this count get 2x decay time */
export const REINFORCEMENT_SLOW_THRESHOLD = 5;
export const REINFORCEMENT_SLOW_MULTIPLIER = 2.0;

/** Memories accessed > this count get 3x decay time */
export const ACCESS_SLOW_THRESHOLD = 20;
export const ACCESS_SLOW_MULTIPLIER = 3.0;

/** Memories with success score below this get 0.5x decay time (faster forgetting) */
export const LOW_SUCCESS_THRESHOLD = 0.3;
export const LOW_SUCCESS_MULTIPLIER = 0.5;

// ============================================================================
// Analytics Agent
// ============================================================================

/** Minimum success score required for LONGTERM ring promotion */
export const LONGTERM_SUCCESS_GATE = 0.7;

/** Default batch size for analytics agent classification */
export const ANALYTICS_BATCH_SIZE = 50;

/** Classification confidence threshold for auto-promotion */
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.6;

// ============================================================================
// Focus Agent
// ============================================================================

/** Maximum items in the focus working set (7±2 → using 9) */
export const MAX_FOCUS_ITEMS = 9;

/** Minimum items to maintain in focus */
export const MIN_FOCUS_ITEMS = 5;

// ============================================================================
// Fresh Memory
// ============================================================================

/** Default TTL for fresh memory in hours (7 days) */
export const FRESH_MEMORY_TTL_HOURS = 168;

/** Maximum unclassified observations before triggering analytics */
export const UNCLASSIFIED_TRIGGER_THRESHOLD = 20;

// ============================================================================
// Gut Agent
// ============================================================================

/** Minimum unique profiles required for k-anonymity */
export const GUT_K_ANONYMITY_THRESHOLD = 3;

/** Maximum tokens for compressed gut pattern */
export const GUT_MAX_PATTERN_TOKENS = 100;

/** Minimum confidence for a gut pattern to be queryable */
export const GUT_MIN_CONFIDENCE = 0.3;

// ============================================================================
// Embedding
// ============================================================================

/** Default embedding model */
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/** Embedding dimensions for text-embedding-3-small */
export const EMBEDDING_DIMENSIONS = 1536;

/** Similarity threshold for "related" memories */
export const SIMILARITY_THRESHOLD = 0.7;

/** Default top-K results for vector search */
export const DEFAULT_TOP_K = 10;

// ============================================================================
// Z-Report
// ============================================================================

/** Maximum tokens for a Z-report summary */
export const Z_REPORT_MAX_TOKENS = 500;

/** Maximum key observations in a Z-report */
export const Z_REPORT_MAX_OBSERVATIONS = 10;

// ============================================================================
// Natural Selection
// ============================================================================

/** Maximum memories per ring type per profile before culling */
export const MAX_MEMORIES_PER_RING = 1000;

/** Minimum relevance score to survive natural selection */
export const MIN_RELEVANCE_SCORE = 0.1;

// ============================================================================
// Relevance Score Factors
// ============================================================================

/** Half-life for recency factor in days */
export const RECENCY_HALF_LIFE_DAYS = 30;

/** Weight of reinforcement in relevance calculation */
export const REINFORCEMENT_WEIGHT = 0.15;

/** Weight of success score in relevance calculation */
export const SUCCESS_WEIGHT = 0.25;

/** Weight of access frequency in relevance calculation */
export const ACCESS_WEIGHT = 0.1;

/** Base weight (initial relevance) */
export const BASE_WEIGHT = 0.5;
