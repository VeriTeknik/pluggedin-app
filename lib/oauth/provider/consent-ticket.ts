/**
 * Consent tickets — a signed, short-lived carrier for an already-validated
 * authorization request.
 *
 * Why this exists: the authorize page validates the request (client resolved,
 * redirect_uri registered against that client, PKCE present and S256). If the
 * consent server action then re-accepts those same values as parameters, all
 * of that validation is decorative — a server action is an HTTP endpoint, so an
 * attacker can call it directly with a redirect_uri pointing at their own host,
 * a code_challenge they control, or another client's uuid.
 *
 * So the validated request never leaves the server in mutable form. The browser
 * receives an opaque ticket; the action verifies its signature and reads the
 * request from inside it.
 *
 * Deliberately NOT covered by the ticket: which Hubs the user picked. That is a
 * genuine user choice made in the form, so it arrives as input and is checked
 * against the user's own projects at action time instead.
 */

import { createHmac, timingSafeEqual } from 'crypto';

import type { Scope } from './scopes';

/** Long enough for a login detour mid-flow, short enough to limit replay. */
const TICKET_TTL_MS = 600_000;

export interface ValidatedAuthorizeRequest {
  clientUuid: string;
  redirectUri: string;
  scopes: Scope[];
  codeChallenge: string;
  state: string | null;
}

interface Clock {
  now?: () => number;
}

type VerifyResult =
  | { ok: true; request: ValidatedAuthorizeRequest }
  | { ok: false; reason: string };

function signingKey(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is required to sign consent tickets');
  return secret;
}

function sign(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

export function issueConsentTicket(
  request: ValidatedAuthorizeRequest,
  clock: Clock = {}
): string {
  const now = clock.now ?? Date.now;
  const payload = Buffer.from(
    JSON.stringify({
      clientUuid: request.clientUuid,
      redirectUri: request.redirectUri,
      scopes: request.scopes,
      codeChallenge: request.codeChallenge,
      state: request.state,
      iat: now(),
    })
  ).toString('base64url');

  return `${payload}.${sign(payload)}`;
}

export function verifyConsentTicket(ticket: string, clock: Clock = {}): VerifyResult {
  const now = clock.now ?? Date.now;
  const parts = ticket.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'Malformed ticket' };

  const [payload, signature] = parts;

  const expected = Buffer.from(sign(payload), 'utf8');
  const presented = Buffer.from(signature, 'utf8');
  if (expected.length !== presented.length) return { ok: false, reason: 'Bad signature' };
  if (!timingSafeEqual(expected, presented)) return { ok: false, reason: 'Bad signature' };

  let decoded: Record<string, unknown>;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'Malformed payload' };
  }

  const issuedAt = decoded.iat;
  if (typeof issuedAt !== 'number' || now() - issuedAt > TICKET_TTL_MS) {
    return { ok: false, reason: 'Ticket expired' };
  }

  return {
    ok: true,
    request: {
      clientUuid: String(decoded.clientUuid),
      redirectUri: String(decoded.redirectUri),
      scopes: (decoded.scopes as Scope[]) ?? [],
      codeChallenge: String(decoded.codeChallenge),
      state: decoded.state === null ? null : String(decoded.state),
    },
  };
}
