/**
 * Archetype Router — Context-Aware Pattern Delivery
 *
 * Wraps the existing injection engine with Jungian archetype filtering.
 * Deterministic context → archetype mapping (no LLM).
 * Four archetypes: Shadow, Sage, Hero, Trickster.
 *
 * Backward compatible: existing injection API unchanged.
 */

import {
  injectContextual,
  injectPostErrorSuggestion,
  injectProactiveWarning,
  type InjectedPattern,
} from '../cbp/injection-engine';
import { CBP_MAX_INJECTION_RESULTS } from '../constants';

import {
  ARCHETYPE_ENABLED,
  ARCHETYPE_MAX_PATTERNS_PER_TYPE,
  ARCHETYPE_SAGE_BOOST,
  ARCHETYPE_SHADOW_BOOST,
} from './constants';
import type { MemoryResult } from '../types';
import type {
  Archetype,
  ArchetypeContext,
  ArchetypedInjection,
  ArchetypeWeight,
} from './types';
import { ARCHETYPE_LABELS, ARCHETYPE_PATTERN_TYPES } from './types';

// ============================================================================
// Weight Calculation (Deterministic, No LLM)
// ============================================================================

function normalize(weights: ArchetypeWeight): ArchetypeWeight {
  const total = weights.shadow + weights.sage + weights.hero + weights.trickster;
  if (total === 0) return { shadow: 0.25, sage: 0.25, hero: 0.25, trickster: 0.25 };
  return {
    shadow: weights.shadow / total,
    sage: weights.sage / total,
    hero: weights.hero / total,
    trickster: weights.trickster / total,
  };
}

/**
 * Determine archetype weights from context.
 * Public for testing and for the weights API endpoint.
 */
export function determineArchetypeWeights(
  ctx: ArchetypeContext
): ArchetypeWeight {
  // Default: Sage-weighted (knowledge sharing is the norm)
  const weights: ArchetypeWeight = {
    shadow: 0.1,
    sage: 0.5,
    hero: 0.3,
    trickster: 0.1,
  };

  // Error/failure → Shadow + Sage dominant
  if (
    ctx.outcome === 'failure' ||
    ctx.observationType === 'error_pattern' ||
    ctx.observationType === 'failure_pattern'
  ) {
    weights.shadow = 0.4 * ARCHETYPE_SHADOW_BOOST;
    weights.sage = 0.4 * ARCHETYPE_SAGE_BOOST;
    weights.hero = 0.1;
    weights.trickster = 0.1;
  }

  // Workflow/tool → Hero dominant
  if (
    ctx.observationType === 'workflow_step' ||
    ctx.observationType === 'tool_call'
  ) {
    weights.hero = 0.5;
    weights.sage = 0.3;
    weights.shadow = 0.1;
    weights.trickster = 0.1;
  }

  // Success → Sage + Hero
  if (
    ctx.outcome === 'success' ||
    ctx.observationType === 'success_pattern'
  ) {
    weights.sage = 0.4;
    weights.hero = 0.4;
    weights.shadow = 0.1;
    weights.trickster = 0.1;
  }

  // 2+ consecutive failures → Trickster (creative solutions needed)
  if ((ctx.consecutiveFailures ?? 0) >= 2) {
    weights.trickster = 0.4;
    weights.sage = 0.3;
    weights.shadow = 0.2;
    weights.hero = 0.1;
  }

  return normalize(weights);
}

// ============================================================================
// Archetype Injection (Public API)
// ============================================================================

/**
 * Inject patterns with archetype-aware filtering and scoring.
 * Falls back to standard injection if archetype routing is disabled.
 */
export async function injectWithArchetype(
  ctx: ArchetypeContext & { query?: string }
): Promise<MemoryResult<ArchetypedInjection[]>> {
  if (!ARCHETYPE_ENABLED) {
    // Fallback: standard injection without archetype enrichment
    const result = ctx.query
      ? await injectContextual(ctx.query)
      : ctx.outcome === 'failure' && ctx.errorMessage
        ? await injectPostErrorSuggestion(ctx.errorMessage, ctx.toolName)
        : ctx.toolName
          ? await injectProactiveWarning(ctx.toolName)
          : { success: true, data: [] as InjectedPattern[] };

    if (!result.success) return { success: false, error: result.error };

    return {
      success: true,
      data: (result.data ?? []).map((p) => ({
        ...p,
        archetype: 'sage' as Archetype,
        archetypeLabel: ARCHETYPE_LABELS.sage,
        archetypeWeight: 1.0,
      })),
    };
  }

  try {
    const weights = determineArchetypeWeights(ctx);

    // Build query for injection engine
    const query = ctx.query
      ?? ctx.errorMessage
      ?? (ctx.toolName ? `using ${ctx.toolName}` : 'general context');

    // Fetch patterns from injection engine
    let patterns: InjectedPattern[];

    if (ctx.outcome === 'failure' && ctx.errorMessage) {
      const result = await injectPostErrorSuggestion(
        ctx.errorMessage,
        ctx.toolName
      );
      patterns = result.success ? result.data ?? [] : [];
    } else if (ctx.toolName && !ctx.query) {
      const result = await injectProactiveWarning(ctx.toolName);
      patterns = result.success ? result.data ?? [] : [];
    } else {
      const result = await injectContextual(query);
      patterns = result.success ? result.data ?? [] : [];
    }

    // Classify patterns into archetypes and score
    const archetypedPatterns: ArchetypedInjection[] = [];

    for (const pattern of patterns) {
      const archetype = classifyPatternArchetype(pattern.patternType);
      const weight = weights[archetype];

      archetypedPatterns.push({
        ...pattern,
        archetype,
        archetypeLabel: ARCHETYPE_LABELS[archetype],
        archetypeWeight: weight,
      });
    }

    // Sort by weighted score (archetype weight * confidence * similarity)
    archetypedPatterns.sort((a, b) => {
      const scoreA = a.archetypeWeight * a.confidence * a.similarity;
      const scoreB = b.archetypeWeight * b.confidence * b.similarity;
      return scoreB - scoreA;
    });

    // Enforce per-archetype limits
    const result = enforceArchetypeLimits(archetypedPatterns);

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Archetype injection failed',
    };
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Classify a pattern type to its primary archetype.
 */
function classifyPatternArchetype(patternType: string): Archetype {
  for (const [archetype, types] of Object.entries(ARCHETYPE_PATTERN_TYPES)) {
    if ((types as string[]).includes(patternType)) {
      return archetype as Archetype;
    }
  }
  return 'sage'; // Default archetype
}

/**
 * Enforce max patterns per archetype, then global limit.
 */
function enforceArchetypeLimits(
  patterns: ArchetypedInjection[]
): ArchetypedInjection[] {
  const byArchetype = new Map<Archetype, ArchetypedInjection[]>();

  for (const p of patterns) {
    if (!byArchetype.has(p.archetype)) {
      byArchetype.set(p.archetype, []);
    }
    const list = byArchetype.get(p.archetype)!;
    if (list.length < ARCHETYPE_MAX_PATTERNS_PER_TYPE) {
      list.push(p);
    }
  }

  // Flatten and sort by score, then enforce global limit
  const all = [...byArchetype.values()]
    .flat()
    .sort((a, b) => {
      const scoreA = a.archetypeWeight * a.confidence * a.similarity;
      const scoreB = b.archetypeWeight * b.confidence * b.similarity;
      return scoreB - scoreA;
    });

  return all.slice(0, CBP_MAX_INJECTION_RESULTS);
}
