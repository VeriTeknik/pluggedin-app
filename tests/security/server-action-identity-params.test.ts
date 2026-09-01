import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every export in a `'use server'` file is a public HTTP endpoint, callable by
 * anyone who knows the action id. When such a function takes an identity —
 * `userId`, `profileUuid`, `projectUuid` — from its caller and the file never
 * consults the session, that identity is an assertion by the attacker rather
 * than a fact.
 *
 * That exact shape produced #202 (updateUserSocial, reserveUsername) and #207,
 * and a sweep found 13 more files with the same signature. This test freezes
 * that set: a new file joining it fails, and a file leaving it must be removed
 * from the list, so the list can only shrink.
 */
const AUTH_REFERENCE =
  /requireAuthUserId|withAuth|withProjectAuth|withProfileAuth|withServerAuth|getAuthSession|createProfileAction|getServerSession/;

const IDENTITY_PARAM = /\b(userId|user_id|profileUuid|profile_uuid|projectUuid|project_uuid)\b/;

/**
 * Known debt, as of 2026-09-01. Each of these takes a caller-supplied identity
 * with no session check anywhere in the file. Shrink this list; do not grow it.
 */
const KNOWN_UNGUARDED = [
  'app/actions/analytics.ts',
  'app/actions/custom-instructions.ts',
  'app/actions/custom-mcp-servers.ts',
  'app/actions/library.ts',
  'app/actions/log-retention.ts',
  'app/actions/mcp-playground.ts',
  'app/actions/mcp-server-logger.ts',
  'app/actions/mcp-server-metrics.ts',
  'app/actions/mcp-server-user-rating.ts',
  'app/actions/notifications.ts',
  'app/actions/playground-settings.ts',
  'app/actions/progressive-mcp-initialization.ts',
  'app/actions/reviews.ts',
].sort();

function unguardedIdentityActions(): string[] {
  const dir = 'app/actions';
  const offenders: string[] = [];

  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.ts')) continue;
    const file = path.join(dir, name);
    const src = fs.readFileSync(file, 'utf8');

    if (!src.trimStart().startsWith("'use server'")) continue;
    if (AUTH_REFERENCE.test(src)) continue;

    const takesIdentity = [...src.matchAll(/^export (?:async )?function \w+\s*\(([^)]*)\)/gm)].some(
      (m) => IDENTITY_PARAM.test(m[1])
    );

    if (takesIdentity) offenders.push(file);
  }

  return offenders.sort();
}

describe('server actions taking a caller-supplied identity', () => {
  it('matches the known-unguarded list exactly', () => {
    // Grew? A new action trusts an identity from its caller — guard it instead.
    // Shrank? Good: delete the fixed file from KNOWN_UNGUARDED.
    expect(unguardedIdentityActions()).toEqual(KNOWN_UNGUARDED);
  });

  it('has no entry that is already fixed', () => {
    const current = new Set(unguardedIdentityActions());
    const stale = KNOWN_UNGUARDED.filter((f) => !current.has(f));

    expect(stale, 'these are guarded now and should leave the list').toEqual([]);
  });

  it('recognises a guarded file as guarded', () => {
    // app/actions/social.ts is the file #202 fixed; if the detector stopped
    // seeing its auth helpers, every assertion above would silently pass.
    const src = fs.readFileSync('app/actions/social.ts', 'utf8');

    expect(AUTH_REFERENCE.test(src)).toBe(true);
  });

  it('recognises an identity parameter', () => {
    expect(IDENTITY_PARAM.test('userId: string, docUuid: string')).toBe(true);
    expect(IDENTITY_PARAM.test('query: string, limit: number')).toBe(false);
  });
});
