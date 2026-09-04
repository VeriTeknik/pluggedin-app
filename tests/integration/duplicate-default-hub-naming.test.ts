import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';

import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * drizzle/0104: give the duplicate "Default Hub" a name of its own.
 *
 * A race in default-project creation left 27 users with two Hubs both called
 * "Default Hub". The race is closed (#225); this migration is the data left
 * behind, and it renames rather than merges — nothing moves and nothing is
 * deleted, because mcp_servers.slug is the tool-name prefix and merging the
 * duplicated sample servers would have to rewrite slugs.
 *
 * Requires a database. Set INTEGRATION_DATABASE_URL to a throwaway one:
 *
 *   docker exec <pg> psql -U pluggedin -d postgres -c 'CREATE DATABASE hub_it;'
 *   DATABASE_URL=postgresql://…/hub_it DATABASE_SSL=false pnpm db:migrate
 *   INTEGRATION_DATABASE_URL=postgresql://…/hub_it pnpm test tests/integration/duplicate-default-hub-naming.test.ts
 *
 * Without it the suite skips rather than fails, matching
 * tests/integration/workspace-promotion.test.ts.
 */

const { INTEGRATION_DATABASE_URL } = vi.hoisted(() => {
  const url = process.env.INTEGRATION_DATABASE_URL;
  if (url) {
    process.env.DATABASE_URL = url;
    process.env.DATABASE_SSL = 'false';
  }
  return { INTEGRATION_DATABASE_URL: url };
});

const describeIfDb = INTEGRATION_DATABASE_URL ? describe : describe.skip;

describeIfDb('drizzle/0104 duplicate Default Hub naming', () => {
  let db: typeof import('@/db').db;
  let migration: string;

  beforeAll(async () => {
    ({ db } = await import('@/db'));
    migration = await readFile(
      join(process.cwd(), 'drizzle', '0104_name_duplicate_default_hubs.sql'),
      'utf8'
    );
  });

  /** The migration reads the whole table, so leftovers become later inputs. */
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM projects WHERE user_id LIKE 'hubtest-%'`);
    await db.execute(sql`DELETE FROM users WHERE id LIKE 'hubtest-%'`);
  });

  async function makeUser(): Promise<string> {
    const id = `hubtest-${randomUUID()}`;
    await db.execute(
      sql`INSERT INTO users (id, email) VALUES (${id}, ${`${id}@example.invalid`})`
    );
    return id;
  }

  async function makeHub(userId: string, name: string, createdAt: string): Promise<string> {
    const uuid = randomUUID();
    await db.execute(
      sql`INSERT INTO projects (uuid, name, user_id, created_at)
          VALUES (${uuid}, ${name}, ${userId}, ${createdAt}::timestamptz)`
    );
    return uuid;
  }

  async function namesFor(userId: string): Promise<string[]> {
    const rows = await db.execute(
      sql`SELECT name FROM projects WHERE user_id = ${userId} ORDER BY created_at, uuid`
    );
    return (rows.rows as Array<{ name: string }>).map((r) => r.name);
  }

  const run = () => db.execute(sql.raw(migration));

  it('renames the later duplicate and leaves the earlier one alone', async () => {
    const user = await makeUser();
    await makeHub(user, 'Default Hub', '2026-01-01T10:00:00Z');
    await makeHub(user, 'Default Hub', '2026-01-01T10:00:05Z');

    await run();

    expect(await namesFor(user)).toEqual(['Default Hub', 'Default Hub 2']);
  });

  it('leaves a user with a single Default Hub untouched', async () => {
    const user = await makeUser();
    await makeHub(user, 'Default Hub', '2026-01-01T10:00:00Z');

    await run();

    expect(await namesFor(user)).toEqual(['Default Hub']);
  });

  it('does not collide with a name the user already has', async () => {
    const user = await makeUser();
    await makeHub(user, 'Default Hub', '2026-01-01T10:00:00Z');
    await makeHub(user, 'Default Hub', '2026-01-01T10:00:05Z');
    await makeHub(user, 'Default Hub 2', '2026-01-01T10:00:09Z');

    await run();

    expect(await namesFor(user)).toEqual(['Default Hub', 'Default Hub 3', 'Default Hub 2']);
  });

  it('numbers three duplicates in order rather than reusing one suffix', async () => {
    const user = await makeUser();
    await makeHub(user, 'Default Hub', '2026-01-01T10:00:00Z');
    await makeHub(user, 'Default Hub', '2026-01-01T10:00:05Z');
    await makeHub(user, 'Default Hub', '2026-01-01T10:00:09Z');

    await run();

    expect(await namesFor(user)).toEqual(['Default Hub', 'Default Hub 2', 'Default Hub 3']);
  });

  it('is idempotent — a second run changes nothing', async () => {
    const user = await makeUser();
    await makeHub(user, 'Default Hub', '2026-01-01T10:00:00Z');
    await makeHub(user, 'Default Hub', '2026-01-01T10:00:05Z');

    await run();
    const afterFirst = await namesFor(user);
    await run();

    expect(await namesFor(user)).toEqual(afterFirst);
  });

  it('does not touch another user’s hubs', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await makeHub(a, 'Default Hub', '2026-01-01T10:00:00Z');
    await makeHub(a, 'Default Hub', '2026-01-01T10:00:05Z');
    await makeHub(b, 'Default Hub', '2026-01-01T10:00:00Z');

    await run();

    expect(await namesFor(b)).toEqual(['Default Hub']);
  });
});
