/**
 * No server action may spread a client-supplied object into an UPDATE on the
 * `users` table.
 *
 * `updateUserSocial` did exactly that from 2025-04-12 until it was deleted:
 *
 *   const updateData = { ...data, updated_at: new Date() };
 *   await db.update(users).set(finalUpdateData).where(eq(users.id, userId));
 *
 * Its TypeScript signature listed four harmless fields, but types are erased at
 * run time and a server action's arguments arrive straight from the client. The
 * caller could send `is_admin: true` — the auth check only confirmed you were
 * updating *yourself*, so it was self-promotion to admin. `users` also holds
 * `password`, `two_fa_secret` and `email_verified`.
 *
 * The function is gone, so this test guards the shape rather than the instance:
 * it reads the source of every `'use server'` module and fails if an update of
 * `users` is fed an object built by spreading a parameter.
 *
 * Explicit field lists are the fix, and are what the surviving callers use —
 * `reserveUsername` set `{ username, updated_at }` and was never vulnerable.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function serverActionFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      serverActionFiles(full, acc);
    } else if (entry.endsWith('.ts')) {
      const src = readFileSync(full, 'utf8');
      if (/^['"]use server['"]/m.test(src)) acc.push(full);
    }
  }
  return acc;
}

/** `.set(x)` where x is, or is built from, a spread of something. */
function spreadFedUserUpdates(source: string): string[] {
  const hits: string[] = [];

  // Names assigned from an object literal containing a spread.
  const spreadNames = new Set<string>();
  for (const m of source.matchAll(/(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*\{\s*\.\.\./g)) {
    spreadNames.add(m[1]);
  }
  // …and names copied from one of those.
  for (const m of source.matchAll(/(?:const|let)\s+(\w+)\s*(?::[^=]+)?=\s*\{\s*\.\.\.(\w+)/g)) {
    if (spreadNames.has(m[2])) spreadNames.add(m[1]);
  }

  // Capture a window after `.set(` rather than a single token: an inline
  // `{ ...data }` puts a space between the brace and the spread, and a
  // token-shaped capture stops at that space and returns just `{`. That is the
  // form this guard exists to catch, so getting it wrong made the guard a
  // decoration — raised in review on PR #242.
  for (const m of source.matchAll(/\.update\(\s*users\s*\)[\s\S]{0,400}?\.set\(([\s\S]{0,60})/g)) {
    const window = m[1];

    if (/^\s*\{\s*\.\.\./.test(window)) {
      hits.push('inline spread into .set({ ...x })');
      continue;
    }

    const identifier = window.match(/^\s*([A-Za-z_$][\w$]*)/)?.[1];
    if (identifier && spreadNames.has(identifier)) {
      hits.push(`.set(${identifier}) where ${identifier} was built by spreading`);
    }
  }

  return hits;
}

describe('mass assignment into the users table', () => {
  const files = serverActionFiles('app');

  it('finds server-action modules to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('no server action spreads client input into an update of users', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const hit of spreadFedUserUpdates(readFileSync(file, 'utf8'))) {
        offenders.push(`${file}: ${hit}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it.each([
    ['inline, no space', 'db.update(users).set({...data, updated_at: new Date()}).where(x)'],
    ['inline, with space', 'db.update(users).set({ ...data, updated_at: new Date() }).where(x)'],
    ['inline, newline', 'db.update(users)\n  .set({\n    ...data,\n  })\n  .where(x)'],
  ])('detects an inline spread written %s', (_label, source) => {
    expect(spreadFedUserUpdates(source)).not.toEqual([]);
  });

  it('detects the shape it is meant to catch', () => {
    // The deleted code, reconstructed. Without this the test above could pass
    // by matching nothing at all.
    const vulnerable = `
      const updateData = { ...data, updated_at: new Date() };
      const finalUpdateData = { ...updateData };
      await db.update(users).set(finalUpdateData).where(eq(users.id, userId));
    `;

    expect(spreadFedUserUpdates(vulnerable)).not.toEqual([]);
  });

  it('does not flag an explicit field list', () => {
    const safe = `
      await db.update(users).set({ username, updated_at: new Date() }).where(eq(users.id, userId));
    `;

    expect(spreadFedUserUpdates(safe)).toEqual([]);
  });
});
