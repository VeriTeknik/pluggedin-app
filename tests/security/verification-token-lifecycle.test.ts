import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const registerSource = fs.readFileSync('app/api/auth/register/route.ts', 'utf8');

/**
 * verification_tokens is keyed on (identifier, token) where identifier is the
 * raw email — there is no reference to a users.id. So a token issued for one
 * user row verifies whatever row currently holds that email.
 *
 * Registration exploits exactly that: when an email already has an unverified,
 * non-OAuth row, the route deletes it and inserts a new user, with a new id and
 * the *new caller's* password, under the same address. Every token outstanding
 * for that email stays valid for 24 hours and now points at the replacement.
 *
 * A source-level check rather than a behavioural one: the route runs the delete
 * inside the same transaction as the replacement, and reproducing that through
 * a mocked Drizzle transaction would assert the shape of the mock rather than
 * the behaviour. The invariant worth freezing is that the delete is there and
 * is bound to the transaction.
 */
describe('replacing an unverified user invalidates its outstanding tokens', () => {
  it('deletes verification tokens inside the replacement transaction', () => {
    const transaction = registerSource.slice(
      registerSource.indexOf('const result = await db.transaction'),
      registerSource.indexOf('return { success: true, userId };')
    );

    // Tolerant of formatting: the call may be broken across lines.
    expect(transaction).toMatch(/tx\s*\.\s*delete\(verificationTokens\)/);
  });

  it('deletes them before the replacement user is inserted', () => {
    const transaction = registerSource.slice(
      registerSource.indexOf('const result = await db.transaction'),
      registerSource.indexOf('return { success: true, userId };')
    );

    // Ordering matters only for clarity here, but a delete placed after the
    // insert would also drop a token issued by a racing request.
    expect(transaction.search(/tx\s*\.\s*delete\(verificationTokens\)/)).toBeLessThan(
      transaction.search(/tx\s*\.\s*insert\(users\)/)
    );
  });

  it('clears stale tokens for the address before issuing a new one', () => {
    // Covers the ordinary path too: re-registering, or any earlier request that
    // left a token behind, must not leave two live tokens for one address.
    const issue = registerSource.slice(
      registerSource.indexOf('// Store the verification token'),
      registerSource.indexOf('// Send the verification email')
    );

    expect(issue).toMatch(/delete\(verificationTokens\)/);
  });
});
