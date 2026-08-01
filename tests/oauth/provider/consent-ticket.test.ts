import { createHmac } from 'crypto';

import { beforeEach, describe, expect, it } from 'vitest';

import type { ValidatedAuthorizeRequest } from '@/lib/oauth/provider/consent-ticket';
import { issueConsentTicket, verifyConsentTicket } from '@/lib/oauth/provider/consent-ticket';

// Typed as the real request rather than inferred: `as const` made scopes a
// readonly tuple, which is not what issueConsentTicket accepts.
const USER_ID = 'user-1';

const REQUEST: ValidatedAuthorizeRequest = {
  clientUuid: '11111111-1111-1111-1111-111111111111',
  redirectUri: 'https://claude.ai/api/mcp/auth_callback',
  scopes: ['library:read', 'offline_access'],
  codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  state: 'xyz',
};

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = 'test-secret-value-for-signing-tickets';
});

describe('consent tickets', () => {
  it('round-trips the validated request', () => {
    const ticket = issueConsentTicket(REQUEST, USER_ID);
    const result = verifyConsentTicket(ticket);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.clientUuid).toBe(REQUEST.clientUuid);
      expect(result.request.redirectUri).toBe(REQUEST.redirectUri);
      expect(result.request.scopes).toEqual(REQUEST.scopes);
      expect(result.request.codeChallenge).toBe(REQUEST.codeChallenge);
      expect(result.request.state).toBe('xyz');
    }
  });

  it('rejects a ticket whose payload was edited', () => {
    // The whole point: an attacker swapping redirect_uri or code_challenge must
    // invalidate the signature rather than be accepted.
    const ticket = issueConsentTicket(REQUEST, USER_ID);
    const [payload, signature] = ticket.split('.');
    const tampered = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), redirectUri: 'https://evil.example/steal' })
    ).toString('base64url');

    expect(verifyConsentTicket(`${tampered}.${signature}`).ok).toBe(false);
  });

  it('rejects a ticket signed with a different secret', () => {
    const ticket = issueConsentTicket(REQUEST, USER_ID);
    process.env.NEXTAUTH_SECRET = 'a-completely-different-secret-value';
    expect(verifyConsentTicket(ticket).ok).toBe(false);
  });

  it('rejects an expired ticket', () => {
    const ticket = issueConsentTicket(REQUEST, USER_ID, { now: () => 0 });
    // 11 minutes later, past the 10-minute window.
    expect(verifyConsentTicket(ticket, { now: () => 660_000 }).ok).toBe(false);
  });

  it('accepts a ticket inside the window', () => {
    const ticket = issueConsentTicket(REQUEST, USER_ID, { now: () => 0 });
    expect(verifyConsentTicket(ticket, { now: () => 60_000 }).ok).toBe(true);
  });

  it('rejects malformed input without throwing', () => {
    expect(verifyConsentTicket('').ok).toBe(false);
    expect(verifyConsentTicket('not-a-ticket').ok).toBe(false);
    expect(verifyConsentTicket('a.b.c').ok).toBe(false);
    expect(verifyConsentTicket('!!!.???').ok).toBe(false);
  });

  it('preserves a null state rather than dropping it', () => {
    const ticket = issueConsentTicket({ ...REQUEST, state: null }, USER_ID);
    const result = verifyConsentTicket(ticket);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.request.state).toBeNull();
  });

  it('names the user it was issued to', () => {
    const result = verifyConsentTicket(issueConsentTicket(REQUEST, USER_ID));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.userId).toBe(USER_ID);
  });

  it('refuses a ticket with no user bound to it', () => {
    // A payload predating the binding has no owner to compare a session
    // against. Accepting it would make the ticket bearer-only again, which is
    // exactly what the binding removes.
    const legacy = Buffer.from(
      JSON.stringify({ ...REQUEST, iat: Date.now() })
    ).toString('base64url');
    const signature = createHmac('sha256', process.env.NEXTAUTH_SECRET as string)
      .update(legacy)
      .digest('base64url');

    const result = verifyConsentTicket(`${legacy}.${signature}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('Ticket is not bound to a user');
  });
});
