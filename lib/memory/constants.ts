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
// Similarity
// ============================================================================

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

// ============================================================================
// LLM Content Limits
// ============================================================================

/** Maximum content length sent to classification LLM to limit prompt injection surface */
export const MAX_CLASSIFICATION_CONTENT_LENGTH = 2000;

/** Maximum content length sent to pattern extraction LLM */
export const MAX_PATTERN_CONTENT_LENGTH = 2000;

// ============================================================================
// Similarity Thresholds
// ============================================================================

/** Similarity threshold for near-duplicate memory detection during promotion */
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.9;

/** Similarity threshold for gut pattern queries */
export const GUT_QUERY_SIMILARITY_THRESHOLD = 0.5;

// ============================================================================
// Batch Limits
// ============================================================================

/** Batch limit for decay processing */
export const DECAY_BATCH_LIMIT = 100;

/** Batch limit for gut aggregation */
export const GUT_AGGREGATION_BATCH_LIMIT = 100;

/** Default stale session threshold in hours */
export const STALE_SESSION_THRESHOLD_HOURS = 24;

// ============================================================================
// Collective Best Practices (CBP)
// ============================================================================

/** Minimum reinforcement count before a memory is eligible for CBP promotion.
 *  Also used by gut-agent for its eligibility filter. */
export const CBP_MIN_REINFORCEMENT = 2;

/** Minimum success score for CBP eligibility.
 *  Also used by gut-agent for its eligibility filter. */
export const CBP_MIN_SUCCESS_SCORE = 0.5;

/** Batch limit for CBP promotion pipeline (involves LLM calls per memory) */
export const CBP_PROMOTION_BATCH_LIMIT = 50;

/** Default success score when memory has no explicit score */
export const CBP_DEFAULT_SUCCESS_SCORE = 0.5;

/** Initial confidence for newly created patterns */
export const CBP_INITIAL_CONFIDENCE = 0.3;

/** Cosine similarity threshold for deduplication (≥ 0.90 = same pattern) */
export const CBP_DEDUP_SIMILARITY_THRESHOLD = 0.90;

/** Minimum feedback rating average for a pattern to remain active */
export const CBP_MIN_FEEDBACK_RATING = 2.0;

/** Number of negative feedbacks before a pattern is reviewed */
export const CBP_NEGATIVE_FEEDBACK_THRESHOLD = 3;

/** Maximum patterns returned per injection query */
export const CBP_MAX_INJECTION_RESULTS = 3;

/** Similarity threshold for injection engine context matching */
export const CBP_INJECTION_SIMILARITY_THRESHOLD = 0.65;

/** Maximum content length for anonymizer input */
export const CBP_MAX_ANONYMIZER_INPUT_LENGTH = 2000;

/** Neutral rating baseline for confidence adjustment (1-5 scale midpoint) */
export const CBP_NEUTRAL_RATING = 3.0;

/** Per-feedback confidence adjustment magnitude */
export const CBP_CONFIDENCE_ADJUSTMENT_FACTOR = 0.05;

/** Per-reinforcement confidence increment (when a pattern is re-observed) */
export const CBP_REINFORCEMENT_CONFIDENCE_INCREMENT = 0.05;

// ============================================================================
// Advisory Lock Keys (Postgres pg_advisory_lock)
// ============================================================================

/** Advisory lock key for CBP promotion pipeline (must be globally unique) */
export const CBP_PIPELINE_ADVISORY_LOCK_KEY = 738201;

/** Advisory lock key for gut aggregation pipeline (must be globally unique) */
export const GUT_AGGREGATION_ADVISORY_LOCK_KEY = 738202;
