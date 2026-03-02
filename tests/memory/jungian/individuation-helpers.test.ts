import { describe, expect, it } from 'vitest';

import {
  getMaturityLevel,
  generateTip,
} from '@/lib/memory/jungian/individuation-service';
import type { IndividuationScore } from '@/lib/memory/jungian/types';

// ============================================================================
// getMaturityLevel
// ============================================================================

describe('getMaturityLevel', () => {
  it('returns "nascent" for 0-20', () => {
    expect(getMaturityLevel(0)).toBe('nascent');
    expect(getMaturityLevel(10)).toBe('nascent');
    expect(getMaturityLevel(20)).toBe('nascent');
  });

  it('returns "developing" for 21-40', () => {
    expect(getMaturityLevel(21)).toBe('developing');
    expect(getMaturityLevel(30)).toBe('developing');
    expect(getMaturityLevel(40)).toBe('developing');
  });

  it('returns "established" for 41-60', () => {
    expect(getMaturityLevel(41)).toBe('established');
    expect(getMaturityLevel(50)).toBe('established');
    expect(getMaturityLevel(60)).toBe('established');
  });

  it('returns "mature" for 61-80', () => {
    expect(getMaturityLevel(61)).toBe('mature');
    expect(getMaturityLevel(70)).toBe('mature');
    expect(getMaturityLevel(80)).toBe('mature');
  });

  it('returns "individuated" for 81-100', () => {
    expect(getMaturityLevel(81)).toBe('individuated');
    expect(getMaturityLevel(90)).toBe('individuated');
    expect(getMaturityLevel(100)).toBe('individuated');
  });

  it('handles exact boundary values', () => {
    expect(getMaturityLevel(20)).toBe('nascent');
    expect(getMaturityLevel(21)).toBe('developing');
    expect(getMaturityLevel(40)).toBe('developing');
    expect(getMaturityLevel(41)).toBe('established');
    expect(getMaturityLevel(60)).toBe('established');
    expect(getMaturityLevel(61)).toBe('mature');
    expect(getMaturityLevel(80)).toBe('mature');
    expect(getMaturityLevel(81)).toBe('individuated');
  });
});

// ============================================================================
// generateTip
// ============================================================================

function makeScore(overrides: Partial<IndividuationScore> = {}): IndividuationScore {
  return {
    total: 50,
    memoryDepth: 15,
    learningVelocity: 15,
    collectiveContribution: 10,
    selfAwareness: 10,
    maturityLevel: 'established',
    ...overrides,
  };
}

describe('generateTip', () => {
  it('returns Memory Depth tip when it is the weakest component', () => {
    const score = makeScore({ memoryDepth: 0 });
    expect(generateTip(score)).toContain('different tool types');
  });

  it('returns Learning Velocity tip when it is the weakest component', () => {
    const score = makeScore({ learningVelocity: 0 });
    expect(generateTip(score)).toContain('observations');
  });

  it('returns Collective Contribution tip when it is the weakest component', () => {
    const score = makeScore({ collectiveContribution: 0 });
    expect(generateTip(score)).toContain('collective patterns');
  });

  it('returns Self-Awareness tip when it is the weakest component', () => {
    const score = makeScore({ selfAwareness: 0 });
    expect(generateTip(score)).toContain('Search your memories');
  });

  it('returns a non-empty string for balanced scores', () => {
    const score = makeScore({
      memoryDepth: 15,
      learningVelocity: 15,
      collectiveContribution: 15,
      selfAwareness: 15,
    });
    const tip = generateTip(score);
    expect(tip.length).toBeGreaterThan(0);
  });

  it('breaks ties consistently (sort stability)', () => {
    const score = makeScore({
      memoryDepth: 0,
      learningVelocity: 0,
      collectiveContribution: 0,
      selfAwareness: 0,
    });
    // All equal — sort should still return a valid tip
    const tip = generateTip(score);
    expect(typeof tip).toBe('string');
    expect(tip.length).toBeGreaterThan(0);
  });
});
