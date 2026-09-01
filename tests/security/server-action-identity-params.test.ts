import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every export in a `'use server'` file is a public HTTP endpoint, callable by
 * anyone who knows the action id. When such a function takes an identity —
 * `userId`, `profileUuid`, `projectUuid` — from its caller and nothing in it
 * consults the session, that identity is an assertion by the attacker rather
 * than a fact.
 *
 * That shape produced #202 (updateUserSocial, reserveUsername) and #207. This
 * test freezes the remaining set so it can only shrink.
 *
 * Granularity is per export, not per file. A file-level check treats one
 * guarded action as covering its unguarded neighbours, which is precisely the
 * regression this is meant to catch.
 */
const AUTH_REFERENCE =
  /requireAuthUserId|withAuth|withProjectAuth|withProfileAuth|withServerAuth|getAuthSession|createProfileAction|getServerSession|requireAdmin/;

const IDENTITY_PARAM = /\b(userId|user_id|profileUuid|profile_uuid|projectUuid|project_uuid)\b/;

/** Comments and string bodies are not executable; a mention in one proves nothing. */
function stripNonCode(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
  });
}

/**
 * Body of a declaration starting at `from`, by brace matching.
 *
 * The opening brace is not simply the next one: a return type like
 * `Promise<{ success: boolean }>` puts a brace before the body, and matching it
 * reports the type as the body — which made every guarded action in
 * app/actions/social.ts look unguarded. Skip past the parameter list, then take
 * the first brace that is not inside angle brackets.
 */
function bodyAt(src: string, from: number): string {
  let i = src.indexOf('(', from);
  if (i === -1) return src.slice(from, from + 400);

  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')' && --paren === 0) { i++; break; }
  }

  let angle = 0;
  let open = -1;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '<') angle++;
    else if (c === '>') angle = Math.max(0, angle - 1);
    else if (c === '{' && angle === 0) { open = i; break; }
  }
  if (open === -1) return src.slice(from, from + 400);

  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(from, j + 1);
  }
  return src.slice(from);
}

/**
 * Parameter list of the declaration at `from`, by balanced parentheses.
 *
 * The search is bounded to `limit`. Unbounded, a declaration with no
 * parentheses of its own — `export const f = async userId => ...` — picks up
 * the next parenthesis anywhere in the file and reports a different
 * declaration's parameters as its own.
 */
function paramsAt(src: string, from: number, limit = src.length): string {
  const open = src.indexOf('(', from);
  if (open === -1 || open >= limit) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open + 1, i);
  }
  return '';
}

/** End of the initializer starting at `from`: the `;` that closes it. */
function initializerEnd(src: string, from: number): number {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ';' && depth <= 0) return i;
  }
  return src.length;
}

/**
 * The arrow function an initializer resolves to, whether it is the initializer
 * itself or the callback handed to a wrapper.
 *
 * `export const x = withAnalytics(schema, async (profileUuid) => {…})` is a
 * server action whose guard, if any, lives in that callback. Reading the
 * wrapper call instead means reading whatever brace comes next in the file —
 * which is the next export, so an unguarded action inherits its neighbour's
 * guard.
 */
function arrowAt(src: string, from: number, end: number): { params: string; body: string } | null {
  const at = src.indexOf('=>', from);
  if (at === -1 || at >= end) return null;

  // Parameters: `(a, b)` immediately before the arrow, or a bare identifier.
  let i = at - 1;
  while (i >= from && /\s/.test(src[i])) i--;

  let params: string;
  if (src[i] === ')') {
    let depth = 0;
    let j = i;
    for (; j >= from; j--) {
      if (src[j] === ')') depth++;
      else if (src[j] === '(' && --depth === 0) break;
    }
    if (j < from) return null;
    params = src.slice(j + 1, i);
  } else {
    const wordEnd = i + 1;
    while (i >= from && /[\w$]/.test(src[i])) i--;
    params = src.slice(i + 1, wordEnd);
    if (!params) return null;
  }

  // Body: a braced block, or the expression up to the end of the initializer.
  let k = at + 2;
  while (k < end && /\s/.test(src[k])) k++;
  if (src[k] !== '{') return { params, body: src.slice(k, end) };

  let depth = 0;
  for (let j = k; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return { params, body: src.slice(k, j + 1) };
  }
  return { params, body: src.slice(k, end) };
}

type Action = { id: string; params: string; body: string; wrapper?: string };

function exportedActions(file: string, code: string): Action[] {
  const found: Action[] = [];

  for (const m of code.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(/g)) {
    const at = m.index ?? 0;
    found.push({ id: `${file}#${m[1]}`, params: paramsAt(code, at), body: bodyAt(code, at) });
  }

  // `export const x = async (...) => {}` and `export const x = wrapper(schema, fn)`
  for (const m of code.matchAll(/export\s+const\s+(\w+)\s*(?::[^=;]*)?=\s*/g)) {
    const start = (m.index ?? 0) + m[0].length;
    const end = initializerEnd(code, start);
    const id = `${file}#${m[1]}`;

    // `wrapper(schema, callback)` — the guard lives in the wrapper, while the
    // parameters and body worth reading live in the callback.
    const wrapper = /^([\w$]+)\s*\(/.exec(code.slice(start, end))?.[1];

    const arrow = arrowAt(code, start, end);
    if (arrow) {
      found.push({ id, params: arrow.params, body: arrow.body, wrapper });
    } else {
      found.push({ id, params: paramsAt(code, start, end), body: code.slice(start, end), wrapper });
    }
  }

  return found;
}

/**
 * Names of helpers defined in this file that themselves consult the session.
 * A guard reached through one of these — `canViewUserSocialGraph`,
 * `viewerOwnsProfile` — is still a guard, and treating it as absent would
 * report every function in app/actions/social.ts as unguarded.
 */
function localGuardNames(code: string): Set<string> {
  const decl =
    /(?:async\s+)?function\s+(\w+)\s*(?:<[^>()]*>)?\s*\(|const\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
  const bodies = new Map<string, string>();

  for (const m of code.matchAll(decl)) {
    const name = m[1] ?? m[2];
    if (name) bodies.set(name, bodyAt(code, m.index ?? 0));
  }

  // Fixed point, not one hop: in app/actions/social.ts the chain is
  // getFollowers -> canViewUserSocialGraph -> getCurrentUserId -> getAuthSession.
  const guards = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, body] of bodies) {
      if (guards.has(name)) continue;
      const reachesAuth =
        AUTH_REFERENCE.test(body) ||
        [...guards].some((g) => new RegExp(`\\b${g}\\s*\\(`).test(body));
      if (reachesAuth) {
        guards.add(name);
        grew = true;
      }
    }
  }

  return guards;
}

function isGuarded(action: Action, localGuards: Set<string>): boolean {
  // Built by a wrapper that authenticates: the wrapper is the guard, and the
  // identity the callback receives comes from it rather than from the caller.
  if (action.wrapper && localGuards.has(action.wrapper)) return true;

  if (AUTH_REFERENCE.test(action.body)) return true;
  for (const name of localGuards) {
    if (new RegExp(`\\b${name}\\s*\\(`).test(action.body)) return true;
  }
  return false;
}

function unguardedIdentityActions(): string[] {
  const offenders: string[] = [];

  for (const file of walk('app/actions')) {
    const raw = fs.readFileSync(file, 'utf8');
    const head = raw.trimStart().slice(0, 20);
    if (!/^['"]use server['"]/.test(head)) continue;

    const code = stripNonCode(raw);
    const localGuards = localGuardNames(code);

    for (const action of exportedActions(file, code)) {
      if (!IDENTITY_PARAM.test(action.params)) continue;
      if (isGuarded(action, localGuards)) continue;
      offenders.push(action.id);
    }
  }

  return [...new Set(offenders)].sort();
}

/**
 * Known debt as of 2026-09-02, one entry per exported action. Shrink this list;
 * do not grow it. Regenerate with the test's own output when closing a file.
 */
const BASELINE_PATH = 'tests/security/unguarded-actions.json';

const KNOWN_UNGUARDED: string[] = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

describe('server actions taking a caller-supplied identity', () => {
  it('matches the known-unguarded list exactly', () => {
    const actual = unguardedIdentityActions();

    // Regenerating by hand invites transcription errors, and the list only ever
    // shrinks legitimately. UPDATE_UNGUARDED_BASELINE=1 rewrites it from the
    // detector; the diff is then reviewed like any other change.
    if (process.env.UPDATE_UNGUARDED_BASELINE) {
      fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(actual, null, 2)}\n`);
    }

    expect(actual).toEqual([...KNOWN_UNGUARDED].sort());
  });

  it('treats a comment-only auth mention as unguarded', () => {
    const code = stripNonCode(`
      'use server';
      // getAuthSession is not called here
      export async function leak(profileUuid: string) { return profileUuid; }
    `);

    expect(AUTH_REFERENCE.test(code)).toBe(false);
  });

  it('sees exported arrow actions, not only function declarations', () => {
    const code = `export const doThing = async (profileUuid: string) => { return 1; };`;
    const actions = exportedActions('f.ts', code);

    expect(actions.map((a) => a.id)).toContain('f.ts#doThing');
    expect(IDENTITY_PARAM.test(actions[0].params)).toBe(true);
  });

  it('judges each export separately, not the file as a whole', () => {
    const code = `
      export async function guarded(profileUuid: string) { await requireAuthUserId(); }
      export async function open(profileUuid: string) { return profileUuid; }
    `;
    const unguarded = exportedActions('f.ts', code).filter(
      (a) => IDENTITY_PARAM.test(a.params) && !AUTH_REFERENCE.test(a.body)
    );

    expect(unguarded.map((a) => a.id)).toEqual(['f.ts#open']);
  });

  it('sees a single-parameter arrow action, which needs no parentheses', () => {
    // `async userId => ...` is valid and takes an identity. If the parser only
    // looks for `(`, it walks past this declaration into the next one and the
    // action never reaches the baseline at all.
    const code = `
      export const leak = async userId => { return userId; };
      export function helper() { return 1; }
    `;
    const leak = exportedActions('f.ts', code).find((a) => a.id === 'f.ts#leak');

    expect(leak).toBeDefined();
    expect(IDENTITY_PARAM.test(leak!.params)).toBe(true);
    expect(AUTH_REFERENCE.test(leak!.body)).toBe(false);
  });

  it('reads a wrapped action from its own callback, not a later export', () => {
    // `export const x = wrapper(schema, fn)` — the body has to come from `fn`.
    // Taking the next `{` in the file instead lands in whatever is declared
    // below, so an unguarded action inherits its neighbour's guard.
    const code = `
      export const wrapped = withAnalytics(schema, async (profileUuid: string) => {
        return profileUuid;
      });
      export async function guardedLater(x: string) {
        await requireAuthUserId();
        return x;
      }
    `;
    const wrapped = exportedActions('f.ts', code).find((a) => a.id === 'f.ts#wrapped');

    expect(wrapped).toBeDefined();
    expect(IDENTITY_PARAM.test(wrapped!.params)).toBe(true);
    expect(AUTH_REFERENCE.test(wrapped!.body)).toBe(false);
  });

  it('still sees the guard when the wrapped callback has one', () => {
    const code = `
      export const wrapped = withAnalytics(schema, async (profileUuid: string) => {
        await requireAuthUserId();
        return profileUuid;
      });
      export async function open(userId: string) { return userId; }
    `;
    const wrapped = exportedActions('f.ts', code).find((a) => a.id === 'f.ts#wrapped');

    expect(AUTH_REFERENCE.test(wrapped!.body)).toBe(true);
  });

  it('counts an authenticating wrapper as the callback\'s guard', () => {
    // app/actions/memory.ts#createProfileAction authenticates and then derives
    // the profile from the session, so its callback's `profileUuid` is not
    // caller-supplied at all. Reading only the callback body would report every
    // action built this way as unguarded.
    const code = `
      function createProfileAction(schema, handler) {
        return async (input) => {
          const userId = await requireAuthUserId();
          return handler(schema.parse(input), await getActiveProfileUuid(userId));
        };
      }
      export const scoreAction = createProfileAction(Schema, async (_p, profileUuid) => {
        return score(profileUuid);
      });
    `;
    const guards = localGuardNames(code);
    const action = exportedActions('f.ts', code).find((a) => a.id === 'f.ts#scoreAction');

    expect(IDENTITY_PARAM.test(action!.params)).toBe(true);
    expect(isGuarded(action!, guards)).toBe(true);
  });

  it('accepts either quoting of the directive', () => {
    expect(/^['"]use server['"]/.test(`'use server';`)).toBe(true);
    expect(/^['"]use server['"]/.test(`"use server";`)).toBe(true);
  });

  it('follows one level of indirection into a local guard helper', () => {
    const code = `
      async function viewerOwnsProfile(p: string) { await getAuthSession(); return true; }
      export async function readThing(profileUuid: string) {
        if (!(await viewerOwnsProfile(profileUuid))) return null;
        return 1;
      }
    `;
    const guards = localGuardNames(code);
    const action = exportedActions('f.ts', code).find((a) => a.id.endsWith('#readThing'))!;

    expect(guards.has('viewerOwnsProfile')).toBe(true);
    expect(isGuarded(action, guards)).toBe(true);
  });

  it('follows a chain of local helpers to the session, not just one hop', () => {
    const code = `
      async function getCurrentUserId() { const s = await getAuthSession(); return s?.user?.id; }
      async function canView(u: string) { return (await getCurrentUserId()) === u; }
      export async function readThing(userId: string) { if (!(await canView(userId))) return null; return 1; }
    `;
    const guards = localGuardNames(code);
    const action = exportedActions('f.ts', code).find((a) => a.id.endsWith('#readThing'))!;

    expect(guards.has('canView')).toBe(true);
    expect(isGuarded(action, guards)).toBe(true);
  });

  it('takes the function body, not a braced return type', () => {
    const code = `export async function f(userId: string): Promise<{ ok: boolean }> { await requireAuthUserId(); return { ok: true }; }`;
    const action = exportedActions('f.ts', code)[0];

    expect(action.body).toContain('requireAuthUserId');
  });

  it('reads a whole parameter list, including nested parentheses', () => {
    const code = 'export async function h(cb: (x: number) => void, profileUuid: string) {}';
    const action = exportedActions('f.ts', code)[0];

    // A regex stopping at the first `)` would truncate at the callback type and
    // miss the identity parameter that follows it.
    expect(action.params).toContain('profileUuid');
    expect(IDENTITY_PARAM.test(action.params)).toBe(true);
  });

  it('recognises an identity parameter', () => {
    expect(IDENTITY_PARAM.test('userId: string, docUuid: string')).toBe(true);
    expect(IDENTITY_PARAM.test('query: string, limit: number')).toBe(false);
  });
});
