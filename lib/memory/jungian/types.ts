/**
 * Jungian Intelligence Layer - Type Definitions
 *
 * v3.2.0 "Jungian Intelligence Layer" — four psychology-inspired subsystems:
 *
 * 1. Archetypes     — Pattern classification through Jungian archetypes
 * 2. Synchronicity  — Meaningful coincidence detection across user interactions
 * 3. Dream Processing — Memory consolidation and compression into clusters
 * 4. Individuation  — Agent maturity scoring over time
 */

import type { InjectedPattern } from '../cbp/injection-engine';
import type { ObservationType, Outcome, PatternType, RingType } from '../types';

// ============================================================================
// Archetypes
// ============================================================================

/**
 * The four Jungian archetypes used to classify and label memory patterns.
 *
 * - shadow:   The hidden or unconscious negative side — anti-patterns, warnings
 * - sage:     The wise guide — best practices, solutions, performance tips
 * - hero:     The active doer — workflows, tool sequences, migrations
 * - trickster: The unexpected disruptor — gotchas, edge cases, compatibility traps
 */
export type Archetype = 'shadow' | 'sage' | 'hero' | 'trickster';

/**
 * Numerical weight assigned to each archetype for a given context.
 * All values are in [0, 1]; they need not sum to 1.
 */
export interface ArchetypeWeight {
  shadow: number;
  sage: number;
  hero: number;
  trickster: number;
}

/**
 * Context passed into the archetype-selection algorithm.
 * All fields are optional; callers supply whatever is available.
 */
export interface ArchetypeContext {
  /** The type of observation being classified */
  observationType?: ObservationType;
  /** Whether the observation had a positive, negative, or neutral outcome */
  outcome?: Outcome;
  /** Name of the MCP tool involved, if any */
  toolName?: string;
  /** Error message text if an error occurred */
  errorMessage?: string;
  /** Number of consecutive failures preceding this observation */
  consecutiveFailures?: number;
}

/**
 * An `InjectedPattern` enriched with its Jungian archetype metadata.
 */
export interface ArchetypedInjection extends InjectedPattern {
  /** The primary archetype assigned to this pattern */
  archetype: Archetype;
  /** Human-readable label for the archetype (e.g. "Shadow") */
  archetypeLabel: string;
  /** Weight of this archetype in the current context (0.0-1.0) */
  archetypeWeight: number;
}

/**
 * Maps each archetype to the `PatternType` values it is associated with.
 *
 * Used during injection to filter or rank patterns by archetype affinity.
 */
export const ARCHETYPE_PATTERN_TYPES: Record<Archetype, PatternType[]> = {
  shadow: ['anti_pattern', 'security_warning', 'gotcha'],
  sage: ['best_practice', 'error_solution', 'performance_tip', 'migration_note'],
  hero: ['workflow', 'tool_sequence', 'migration_note'],
  trickster: ['gotcha', 'compatibility', 'error_recovery'],
};

/**
 * Display labels for each archetype, suitable for UI rendering.
 */
export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  shadow: 'Shadow Warning',
  sage: 'Sage Advice',
  hero: 'Hero Path',
  trickster: 'Trickster Insight',
};

// ============================================================================
// Synchronicity
// ============================================================================

/**
 * The three categories of synchronistic analysis performed by the detector.
 *
 * - co_occurrence:       Two tools that frequently appear together
 * - failure_correlation: Tools that tend to fail together (shared root cause)
 * - emergent_workflow:   Three tools that form a recurrent sequential workflow
 */
export type SynchronicityAnalysisType =
  | 'co_occurrence'
  | 'failure_correlation'
  | 'emergent_workflow';

/**
 * A detected synchronistic pattern between tools across multiple user profiles.
 *
 * Fields are typed as optional where they apply only to certain `analysisType`
 * values to avoid carrying undefined fields for unrelated types.
 */
export interface SynchronicityPattern {
  /** Category of the detected synchronistic relationship */
  analysisType: SynchronicityAnalysisType;
  /** Primary tool involved in the pattern */
  toolName: string;
  /** Secondary tool (present for co_occurrence and failure_correlation) */
  relatedTool?: string;
  /** Third tool in an emergent three-step workflow */
  thirdTool?: string;
  /** Number of distinct anonymised profiles that exhibit this pattern */
  uniqueProfiles: number;
  /** Fraction of occurrences that resulted in a failure (failure_correlation) */
  failureRate?: number;
  /** Day-of-week dimension used when temporal clustering is applied (0 = Sun) */
  dayOfWeek?: number;
  /** Hour-of-day dimension used when temporal clustering is applied (0–23) */
  hourOfDay?: number;
  /** Raw total event count across all matching profiles */
  total?: number;
}

/**
 * Minimal event record supplied to the synchronicity detector.
 * The detector aggregates these across profiles to find meaningful patterns.
 */
export interface TemporalEventInput {
  /** Anonymised hash of the profile — never a raw UUID */
  profileHash: string;
  /** MCP tool name that was invoked */
  toolName: string;
  /** Observation type recorded for this event */
  eventType: string;
  /** Outcome of the tool invocation */
  outcome?: Outcome;
  /** Hash of any additional context (e.g. error message hash) */
  contextHash?: string;
}

// ============================================================================
// Dream Processing
// ============================================================================

/**
 * A cluster of semantically similar memory ring entries discovered during
 * the dream-processing (overnight consolidation) pass.
 */
export interface DreamCluster {
  /** Opaque cluster identifier assigned by the clustering algorithm */
  id: string;
  /** Profile this cluster belongs to */
  profileUuid: string;
  /** UUIDs of the memory ring entries that belong to this cluster */
  memberUuids: string[];
  /** Mean embedding vector of all cluster members */
  centroidEmbedding: number[];
  /** Mean pairwise cosine similarity within the cluster */
  avgSimilarity: number;
  /** The ring type that the majority of members belong to */
  dominantRingType: RingType;
  /** Sum of token counts across all cluster members (before consolidation) */
  totalTokens: number;
}

/**
 * Result of consolidating a single dream cluster into a new memory entry.
 */
export interface DreamConsolidationResult {
  /** ID of the cluster that was consolidated */
  clusterId: string;
  /** UUID of the newly created consolidated memory ring entry */
  resultMemoryUuid: string;
  /** Number of source memories merged into the result */
  sourceCount: number;
  /** Estimated tokens saved by the consolidation */
  tokenSavings: number;
  /** Average cosine similarity of the original cluster (before consolidation) */
  clusterSimilarity: number;
}

// ============================================================================
// Individuation
// ============================================================================

/**
 * Maturity levels for the individuation scoring system.
 *
 * Maps to the Jungian concept of psychic development — from raw potential
 * ("nascent") through integration and self-realisation ("individuated").
 */
export type MaturityLevel =
  | 'nascent'
  | 'developing'
  | 'established'
  | 'mature'
  | 'individuated';

/**
 * Decomposed individuation score for a profile.
 *
 * Each component is in [0, 100]; `total` is a weighted composite.
 */
export interface IndividuationScore {
  /** Weighted composite score (0–100) */
  total: number;
  /** Reflects the volume and age-distribution of long-term memories */
  memoryDepth: number;
  /** Rate of new pattern acquisition over recent time windows */
  learningVelocity: number;
  /** Contribution to collective gut patterns (CBP) */
  collectiveContribution: number;
  /** Accuracy of self-predictions vs. actual outcomes */
  selfAwareness: number;
  /** Qualitative label derived from `total` */
  maturityLevel: MaturityLevel;
}

/**
 * A point-in-time snapshot of an individuation score, associated with a
 * specific profile and calendar date for trend tracking.
 */
export interface IndividuationSnapshot extends IndividuationScore {
  /** The profile this snapshot belongs to */
  profileUuid: string;
  /** ISO-8601 date string (YYYY-MM-DD) when this snapshot was taken */
  snapshotDate: string;
}

/**
 * API response shape returned to callers of the individuation endpoint.
 */
export interface IndividuationResponse {
  /** Overall individuation score (0–100) */
  total: number;
  /** Maturity level label */
  level: MaturityLevel;
  /** Trend direction compared with the previous week */
  weeklyTrend: 'accelerating' | 'stable' | 'decelerating';
  /** Actionable human-readable tip for improving the score */
  tip: string;
  /** Breakdown of the four component scores */
  components: {
    memoryDepth: number;
    learningVelocity: number;
    collectiveContribution: number;
    selfAwareness: number;
  };
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Summary returned after running the synchronicity detection pipeline.
 */
export interface SynchronicityDetectionResult {
  /** Co-occurrence pairs detected */
  coOccurrences: SynchronicityPattern[];
  /** Tool pairs that tend to fail together */
  failureCorrelations: SynchronicityPattern[];
  /** Three-step emergent workflows discovered */
  emergentWorkflows: SynchronicityPattern[];
  /** Total number of gut patterns created from the detected synchronicities */
  patternsCreated: number;
}

/**
 * Summary returned after running the dream-processing (memory consolidation)
 * pipeline for a profile.
 */
export interface DreamProcessingResult {
  /** Number of semantic clusters found during the pass */
  clustersFound: number;
  /** Number of clusters successfully consolidated into new memories */
  consolidated: number;
  /** Aggregate token savings across all consolidated clusters */
  totalTokenSavings: number;
  /** Number of non-fatal errors encountered during the pass */
  errors: number;
}
