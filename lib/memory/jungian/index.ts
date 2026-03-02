/**
 * Jungian Intelligence Layer — Public API
 *
 * Only re-exports public functions and types. Internal implementation
 * details (advisory lock keys, LLM prompts, tuning constants) are
 * available via direct submodule imports when needed.
 */

// Types
export type {
  Archetype,
  ArchetypeContext,
  ArchetypedInjection,
  ArchetypeWeight,
  DreamCluster,
  DreamProcessingResult,
  IndividuationScore,
  IndividuationSnapshot,
  SynchronicityDetectionResult,
  SynchronicityPattern,
  TemporalEventInput,
} from './types';

// Public constants (feature flags only)
export { SYNC_CRON_ENABLED } from './constants';

// Temporal events
export {
  recordTemporalEvents,
  recordTemporalEvent,
  cleanupTemporalEvents,
  getApproxTemporalEventCount,
} from './temporal-event-service';

// Synchronicity detection
export { detectSynchronicities } from './synchronicity-detector';

// Dream processing
export { processDreams } from './dream-processor';

// Archetype routing
export { injectWithArchetype, determineArchetypeWeights } from './archetype-router';

// Individuation metrics
export {
  getIndividuationScore,
  getIndividuationHistory,
  saveIndividuationSnapshot,
} from './individuation-service';
