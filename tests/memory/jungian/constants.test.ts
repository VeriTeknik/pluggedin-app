import { describe, expect, it } from 'vitest';

/**
 * Tests for the clampInt/clampFloat behavior in jungian/constants.ts.
 *
 * We can't directly test module-level constants (they're evaluated at import
 * time with process.env), but we can verify the clamping logic by re-importing
 * and checking that defaults fall within documented ranges.
 */

describe('jungian constants bounds', () => {
  it('all constants are within safe ranges with default env', async () => {
    // Dynamic import to get constants with current env
    const c = await import('@/lib/memory/jungian/constants');

    // Synchronicity
    expect(c.SYNC_RETENTION_DAYS).toBeGreaterThanOrEqual(1);
    expect(c.SYNC_RETENTION_DAYS).toBeLessThanOrEqual(365);
    expect(c.SYNC_COOCCURRENCE_WINDOW_DAYS).toBeGreaterThanOrEqual(1);
    expect(c.SYNC_COOCCURRENCE_WINDOW_DAYS).toBeLessThanOrEqual(365);
    expect(c.SYNC_TABLESAMPLE_PERCENT).toBeGreaterThanOrEqual(1);
    expect(c.SYNC_TABLESAMPLE_PERCENT).toBeLessThanOrEqual(100);
    expect(c.SYNC_MIN_EVENTS_THRESHOLD).toBeGreaterThanOrEqual(1);

    // Dream
    expect(c.DREAM_SIMILARITY_THRESHOLD).toBeGreaterThanOrEqual(0.1);
    expect(c.DREAM_SIMILARITY_THRESHOLD).toBeLessThanOrEqual(0.99);
    expect(c.DREAM_MIN_CLUSTER_SIZE).toBeGreaterThanOrEqual(2);
    expect(c.DREAM_COOLDOWN_DAYS).toBeGreaterThanOrEqual(1);

    // Archetype
    expect(c.ARCHETYPE_SHADOW_BOOST).toBeGreaterThanOrEqual(0.1);
    expect(c.ARCHETYPE_SAGE_BOOST).toBeGreaterThanOrEqual(0.1);
    expect(c.ARCHETYPE_MAX_PATTERNS_PER_TYPE).toBeGreaterThanOrEqual(1);

    // Individuation
    expect(c.INDIVIDUATION_CACHE_TTL_MINUTES).toBeGreaterThanOrEqual(1);
    expect(c.INDIVIDUATION_HISTORY_DAYS).toBeGreaterThanOrEqual(7);
  });

  it('TABLESAMPLE_PERCENT defaults to 1', async () => {
    const c = await import('@/lib/memory/jungian/constants');
    // With no env override, should be default value
    expect(c.SYNC_TABLESAMPLE_PERCENT).toBe(1);
  });

  it('DREAM_SIMILARITY_THRESHOLD defaults to 0.75', async () => {
    const c = await import('@/lib/memory/jungian/constants');
    expect(c.DREAM_SIMILARITY_THRESHOLD).toBe(0.75);
  });
});
