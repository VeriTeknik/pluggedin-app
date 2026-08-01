import { describe, expect, it } from 'vitest';
import { TTL, credentialsMatch, hashCredential, mintCredential } from '@/lib/oauth/provider/tokens';

describe('credential minting', () => {
  it('produces unguessable, URL-safe, unique credentials', () => {
    const a = mintCredential();
    const b = mintCredential();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('hashing', () => {
  it('is deterministic lowercase hex', () => {
    const credential = mintCredential();
    expect(hashCredential(credential)).toBe(hashCredential(credential));
    expect(hashCredential(credential)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never returns the credential itself', () => {
    const credential = mintCredential();
    expect(hashCredential(credential)).not.toContain(credential);
  });
});

describe('comparison', () => {
  it('matches a credential against its own hash', () => {
    const credential = mintCredential();
    expect(credentialsMatch(credential, hashCredential(credential))).toBe(true);
  });

  it('rejects a different credential', () => {
    expect(credentialsMatch(mintCredential(), hashCredential(mintCredential()))).toBe(false);
  });

  it('rejects a malformed stored hash without throwing', () => {
    // timingSafeEqual throws on length mismatch; the guard must absorb that.
    expect(credentialsMatch(mintCredential(), 'not-a-hash')).toBe(false);
    expect(credentialsMatch(mintCredential(), '')).toBe(false);
  });
});

describe('lifetimes', () => {
  it('matches the design: 60s code, 1h access, 30d refresh', () => {
    expect(TTL.authorizationCodeMs).toBe(60_000);
    expect(TTL.accessTokenMs).toBe(3_600_000);
    expect(TTL.refreshTokenMs).toBe(2_592_000_000);
  });

  it('leaves margin over Claude’s 5-minute proactive refresh window', () => {
    expect(TTL.accessTokenMs).toBeGreaterThan(5 * 60_000 * 2);
  });
});
