import { compare } from 'bcrypt';

import { isAccountLocked, recordFailedLoginAttempt } from './auth-security';
import { rateLimiter } from './rate-limiter';

/**
 * Re-verification for credential changes.
 *
 * A session alone must not be enough to add, replace or remove a login
 * credential: a stolen session would otherwise become a permanent one, and
 * revocation on password change only runs every 15 minutes (lib/auth.ts).
 *
 * - An account with a password proves it with the current password.
 * - An OAuth-only account proves it with a fresh sign-in through a linked
 *   provider, made by THIS session: the JWT callback stamps authTime and
 *   authProvider when a session signs in (lib/auth.ts). accounts.last_used is
 *   not evidence — it records the account's latest sign-in on any device, so
 *   a stolen session could ride on the owner signing in elsewhere.
 */

/** How recent a provider sign-in must be to count as re-authentication. */
export const OAUTH_REAUTH_WINDOW_MS = 5 * 60 * 1000;

/** Same fixed delay the change-password route applies after a wrong password. */
const FAILED_VERIFICATION_DELAY_MS = 1000;

/**
 * Per-user budget for password re-verification: the same 10 per hour as
 * RateLimiters.sensitive on the REST routes, but keyed by user and shared by
 * every path that re-verifies (settings actions and REST routes alike).
 */
export const PASSWORD_REVERIFY_LIMIT = { max: 10, windowSeconds: 60 * 60 } as const;

export type PasswordReverification =
  | { ok: true }
  | { ok: false; reason: 'incorrect' | 'throttled' };

/** Users with a password check running on this instance. */
const inFlight = new Set<string>();

/**
 * Re-verify a signed-in user's current password.
 *
 * A session holder can call this as often as they like, so it is a password
 * oracle unless throttled, and each call costs a bcrypt compare. In order:
 * - one check per user at a time on this instance: a parallel burst is refused
 *   before it reaches bcrypt or the shared counter (whose read-then-write is
 *   not atomic);
 * - a locked account is refused, as at login;
 * - the per-user budget above is spent;
 * - a wrong password counts toward the login lockout (lib/auth-security), so
 *   guesses made here and at the login form share one limit.
 */
export async function verifyCurrentPassword(
  user: { id: string; email: string; password: string | null | undefined },
  candidate: string | null | undefined,
  client: { ipAddress?: string; userAgent?: string } = {}
): Promise<PasswordReverification> {
  if (!user.password || !candidate) return { ok: false, reason: 'incorrect' };
  if (inFlight.has(user.id)) return { ok: false, reason: 'throttled' };

  inFlight.add(user.id);
  try {
    if (await isAccountLocked(user.email)) return { ok: false, reason: 'throttled' };

    const budget = await rateLimiter.check(
      `password-reverify:${user.id}`,
      PASSWORD_REVERIFY_LIMIT.max,
      PASSWORD_REVERIFY_LIMIT.windowSeconds
    );
    if (!budget.success) return { ok: false, reason: 'throttled' };

    if (await compare(candidate, user.password)) return { ok: true };

    await recordFailedLoginAttempt(
      user.email,
      client.ipAddress ?? 'password-reverification',
      client.userAgent ?? 'password-reverification'
    );
    await new Promise((resolve) => setTimeout(resolve, FAILED_VERIFICATION_DELAY_MS));
    return { ok: false, reason: 'incorrect' };
  } finally {
    inFlight.delete(user.id);
  }
}

/** The sign-in stamp a session carries (see Session in lib/auth.ts). */
export interface SessionSignIn {
  authTime?: number | null;
  authProvider?: string | null;
}

/**
 * Whether the current session signed in within the window through one of the
 * account's linked providers. A session without a stamp (issued before it
 * existed) is not recent.
 */
export function hasRecentOAuthSignIn(
  session: SessionSignIn | null | undefined,
  linkedAccounts: ReadonlyArray<{ provider: string }>,
  now: number = Date.now()
): boolean {
  if (!signedInWithinWindow(session, now)) return false;
  return linkedAccounts.some((account) => account.provider === session.authProvider);
}

function signedInWithinWindow(
  session: SessionSignIn | null | undefined,
  now: number
): session is { authTime: number; authProvider: string } {
  const authTime = session?.authTime;
  if (typeof authTime !== 'number' || !Number.isFinite(authTime) || !session?.authProvider) return false;
  return authTime <= now && now - authTime <= OAUTH_REAUTH_WINDOW_MS;
}

/** What a session's re-authentication is judged against: the account as it is now. */
export interface ReauthAccount {
  linkedProviders: ReadonlyArray<string>;
  hasPassword: boolean;
  /** A password change after the sign-in revokes that session (lib/auth.ts), so it no longer counts. */
  passwordChangedAt?: Date | null;
}

/**
 * Whether THIS session proved, within the window, that it is the account
 * owner: it signed in through a provider that is linked to the account, or
 * with the account's password (the credentials provider).
 *
 * Used to allow linking a new provider (lib/auth.ts signIn callback). Only a
 * provider linked BEFORE the attempt counts, and the attempt cannot count for
 * itself: the callback runs before the link and refuses it without this.
 */
export function hasRecentReauthentication(
  session: SessionSignIn | null | undefined,
  account: ReauthAccount,
  now: number = Date.now()
): boolean {
  if (!signedInWithinWindow(session, now)) return false;
  if (account.passwordChangedAt && account.passwordChangedAt.getTime() > session.authTime) return false;
  if (session.authProvider === 'credentials') return account.hasPassword;
  return account.linkedProviders.includes(session.authProvider);
}

/** When the session's re-authentication stops counting, or null if it does not count now. */
export function reauthenticatedUntil(
  session: SessionSignIn | null | undefined,
  account: ReauthAccount,
  now: number = Date.now()
): number | null {
  if (!hasRecentReauthentication(session, account, now)) return null;
  return (session!.authTime as number) + OAUTH_REAUTH_WINDOW_MS;
}
