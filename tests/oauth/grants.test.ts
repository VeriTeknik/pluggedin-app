import { describe, expect, it } from 'vitest';
import { classifyRefreshFailure } from '@/lib/oauth/grants';

const future = new Date(Date.now() + 60_000);
const past = new Date(Date.now() - 60_000);

describe('refresh token classification', () => {
  it('accepts a live, unrotated, unrevoked token', () => {
    expect(
      classifyRefreshFailure({ rotated_at: null, revoked_at: null, expires_at: future })
    ).toBe('ok');
  });

  it('flags an already-rotated token as REUSE, not merely invalid', () => {
    // This is the whole point. A rotated token being presented again means a
    // copy exists somewhere, and we cannot tell whether the presenter is the
    // attacker or the legitimate client — so the family must die.
    expect(
      classifyRefreshFailure({ rotated_at: past, revoked_at: null, expires_at: future })
    ).toBe('reuse');
  });

  it('detects reuse even when the token has also expired', () => {
    // Ordering matters: expiry must not mask a reuse signal, or an attacker
    // gets a free window by simply waiting.
    expect(
      classifyRefreshFailure({ rotated_at: past, revoked_at: null, expires_at: past })
    ).toBe('reuse');
  });

  it('detects reuse even when the token was also revoked', () => {
    expect(
      classifyRefreshFailure({ rotated_at: past, revoked_at: past, expires_at: future })
    ).toBe('reuse');
  });

  it('reports an explicitly revoked token as revoked', () => {
    expect(
      classifyRefreshFailure({ rotated_at: null, revoked_at: past, expires_at: future })
    ).toBe('revoked');
  });

  it('reports a plain expiry as expired', () => {
    expect(
      classifyRefreshFailure({ rotated_at: null, revoked_at: null, expires_at: past })
    ).toBe('expired');
  });
});
