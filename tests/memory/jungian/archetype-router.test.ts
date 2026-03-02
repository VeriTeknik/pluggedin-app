import { describe, expect, it } from 'vitest';

import { determineArchetypeWeights } from '@/lib/memory/jungian/archetype-router';
import type { ArchetypeContext, ArchetypeWeight } from '@/lib/memory/jungian/types';

function assertNormalized(w: ArchetypeWeight) {
  const sum = w.shadow + w.sage + w.hero + w.trickster;
  expect(sum).toBeCloseTo(1.0, 5);
  expect(w.shadow).toBeGreaterThanOrEqual(0);
  expect(w.sage).toBeGreaterThanOrEqual(0);
  expect(w.hero).toBeGreaterThanOrEqual(0);
  expect(w.trickster).toBeGreaterThanOrEqual(0);
}

describe('determineArchetypeWeights', () => {
  it('returns normalized weights that sum to 1.0 for default context', () => {
    const ctx: ArchetypeContext = {};
    const w = determineArchetypeWeights(ctx);
    assertNormalized(w);
  });

  it('defaults to Sage-dominant when no context signals are present', () => {
    const ctx: ArchetypeContext = {};
    const w = determineArchetypeWeights(ctx);
    assertNormalized(w);
    expect(w.sage).toBeGreaterThan(w.shadow);
    expect(w.sage).toBeGreaterThan(w.hero);
    expect(w.sage).toBeGreaterThan(w.trickster);
  });

  it('activates Trickster for consecutive failures', () => {
    const ctx: ArchetypeContext = { consecutiveFailures: 3 };
    const w = determineArchetypeWeights(ctx);
    assertNormalized(w);
    expect(w.trickster).toBeGreaterThan(w.shadow);
    expect(w.trickster).toBeGreaterThan(w.hero);
  });

  it('activates Shadow + Sage for single failure', () => {
    const ctx: ArchetypeContext = { outcome: 'failure' };
    const w = determineArchetypeWeights(ctx);
    assertNormalized(w);
    // Shadow and Sage should both be dominant
    expect(w.shadow + w.sage).toBeGreaterThan(0.7);
  });

  it('activates Shadow for error_pattern observation', () => {
    const ctx: ArchetypeContext = { observationType: 'error_pattern' };
    const w = determineArchetypeWeights(ctx);
    assertNormalized(w);
    expect(w.shadow).toBeGreaterThan(w.hero);
  });

  it('activates Hero for workflow_step observation', () => {
    const ctx: ArchetypeContext = { observationType: 'workflow_step' };
    const w = determineArchetypeWeights(ctx);
    assertNormalized(w);
    expect(w.hero).toBeGreaterThan(w.shadow);
    expect(w.hero).toBeGreaterThan(w.trickster);
  });

  it('activates Hero for tool_call observation', () => {
    const ctx: ArchetypeContext = { observationType: 'tool_call' };
    const w = determineArchetypeWeights(ctx);
    assertNormalized(w);
    expect(w.hero).toBeGreaterThan(w.shadow);
  });

  it('activates Sage + Hero for success outcome', () => {
    const ctx: ArchetypeContext = { outcome: 'success' };
    const w = determineArchetypeWeights(ctx);
    assertNormalized(w);
    expect(w.sage + w.hero).toBeGreaterThan(0.7);
  });

  it('prioritizes consecutive failures over single failure', () => {
    // consecutiveFailures=2 + outcome=failure → Trickster wins (else-if priority)
    const ctx: ArchetypeContext = { consecutiveFailures: 2, outcome: 'failure' };
    const w = determineArchetypeWeights(ctx);
    assertNormalized(w);
    expect(w.trickster).toBeGreaterThan(w.shadow);
  });

  it('does not activate Trickster for fewer than 2 consecutive failures', () => {
    const ctx: ArchetypeContext = { consecutiveFailures: 1, outcome: 'failure' };
    const w = determineArchetypeWeights(ctx);
    assertNormalized(w);
    // Should fall through to failure branch, not trickster
    expect(w.shadow).toBeGreaterThan(w.trickster);
  });

  it('always returns valid weights regardless of input', () => {
    const contexts: ArchetypeContext[] = [
      {},
      { outcome: 'success' },
      { outcome: 'failure' },
      { outcome: 'neutral' },
      { observationType: 'tool_call' },
      { observationType: 'success_pattern' },
      { observationType: 'failure_pattern' },
      { observationType: 'insight' },
      { consecutiveFailures: 0 },
      { consecutiveFailures: 100 },
      { toolName: 'some_tool', outcome: 'failure', consecutiveFailures: 5 },
    ];

    for (const ctx of contexts) {
      const w = determineArchetypeWeights(ctx);
      assertNormalized(w);
    }
  });
});
