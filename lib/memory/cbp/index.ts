/**
 * Collective Best Practices (CBP) System
 *
 * Privacy-preserving collective intelligence:
 * - Anonymizer: PII strip + LLM generalization
 * - Promotion: Individual memory → collective pattern pipeline
 * - Injection: Proactive pattern delivery based on context
 */

export { stripPII, anonymize } from './anonymizer';
export { hashPattern, hashProfileUuid } from './hash-utils';
export {
  runPromotionPipeline,
  getPromotionStats,
  type PromotionStats,
} from './promotion-service';
export {
  injectProactiveWarning,
  injectPostErrorSuggestion,
  injectContextual,
  submitFeedback,
  type InjectedPattern,
} from './injection-engine';
