import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const registerSource = fs.readFileSync('app/api/auth/register/route.ts', 'utf8');

/** The body of the transaction callback starting at `from`, by brace matching. */
function transactionBodyAt(src: string, from: number): string {
  const open = src.indexOf('{', src.indexOf('=>', from));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

function transactionBodies(src: string): string[] {
  return [...src.matchAll(/db\.transaction\s*\(/g)].map((m) =>
    transactionBodyAt(src, m.index ?? 0)
  );
}

/**
 * A verification token has to be written in the same transaction as the user it
 * belongs to.
 *
 * Issued afterwards, a concurrent registration can replace and cascade-delete
 * that user in between: the foreign key then rejects the insert, and it does so
 * after the default project, the admin notification and the welcome email have
 * already run. Both registration paths — the ordinary insert and the
 * replacement of an unverified row — have to hold this.
 *
 * Source-level rather than behavioural, deliberately: the property is about
 * transaction boundaries, and driving that through a mocked Drizzle `tx` would
 * assert the shape of the mock rather than the boundary. So the check is that
 * every `insert(users)` and every `insert(verificationTokens)` lives inside a
 * transaction, and that no transaction creates a user without also issuing its
 * token.
 */
describe('a token is written with the user it belongs to', () => {
  const bodies = transactionBodies(registerSource);

  it('creates users only inside a transaction', () => {
    const insideTransactions = bodies.join('\n');
    const totalUserInserts = registerSource.match(/insert\(users\)/g) ?? [];
    const transactionalUserInserts = insideTransactions.match(/insert\(users\)/g) ?? [];

    expect(transactionalUserInserts.length).toBe(totalUserInserts.length);
    expect(totalUserInserts.length).toBeGreaterThan(0);
  });

  it('issues tokens only inside a transaction', () => {
    const insideTransactions = bodies.join('\n');
    const totalTokenInserts = registerSource.match(/insert\(verificationTokens\)/g) ?? [];
    const transactionalTokenInserts =
      insideTransactions.match(/insert\(verificationTokens\)/g) ?? [];

    expect(transactionalTokenInserts.length).toBe(totalTokenInserts.length);
    expect(totalTokenInserts.length).toBeGreaterThan(0);
  });

  it('never creates a user without issuing its token in the same transaction', () => {
    const creating = bodies.filter((body) => /insert\(users\)/.test(body));

    expect(creating.length).toBeGreaterThan(0);
    for (const body of creating) {
      expect(body).toMatch(/insert\(verificationTokens\)/);
      expect(body).toMatch(/user_id:\s*userId/);
    }
  });
});

/**
 * The token table is shared with NextAuth, whose email provider issues magic
 * links for addresses that may not have a user yet. Deleting by address takes
 * those with it and breaks a sign-in this route has nothing to do with.
 *
 * Nothing needs deleting anyway: the foreign key's ON DELETE CASCADE removes a
 * user's tokens along with the user.
 */
describe('registration does not delete tokens by address', () => {
  it('issues no delete against verification_tokens at all', () => {
    expect(registerSource).not.toMatch(/delete\(verificationTokens\)/);
  });

  it('relies on deleting the user instead', () => {
    expect(registerSource).toMatch(/delete\(users\)/);
  });
});
