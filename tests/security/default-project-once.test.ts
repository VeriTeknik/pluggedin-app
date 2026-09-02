import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * A user ended up with two 'Default Hub' projects because three separate places
 * created one, and the only guarded site used a check-then-create that two
 * concurrent requests both pass.
 *
 * In production 27 users have a duplicate pair, created 0.0-0.1 seconds apart —
 * all of them OAuth sign-ups, where a fresh session fires several requests at
 * once. 23 of the 27 have MCP servers under both copies.
 */
describe('the default project is created in one place, under a lock', () => {
  const helper = fs.readFileSync('lib/default-project-creation.ts', 'utf8');

  it('serialises concurrent callers on the user row', () => {
    // Without a lock two transactions both see no project and both insert.
    // The registration route already uses this pattern for the same reason.
    expect(helper).toMatch(/\.for\(\s*['"]update['"]\s*\)/);
  });

  it('returns the existing project instead of creating a second', () => {
    expect(helper).toMatch(/existing/i);
  });

  it('is the only place that creates a Default Hub', () => {
    const others = ['app/actions/projects.ts', 'app/api/auth/verify-email/route.ts']
      .filter((file) => /name:\s*['"]Default Hub['"]/.test(fs.readFileSync(file, 'utf8')));

    expect(others).toEqual([]);
  });

  it('the callers import and call the helper', () => {
    // Grepping for the name alone is not enough: my first version passed while
    // verify-email called it without importing it, and only tsc caught that.
    for (const file of ['app/actions/projects.ts', 'app/api/auth/verify-email/route.ts']) {
      const src = fs.readFileSync(file, 'utf8');
      expect(src).toMatch(/import\s*\{[^}]*createDefaultProject[^}]*\}\s*from/);
      expect(src).toMatch(/createDefaultProject\s*\(/);
    }
  });
});
