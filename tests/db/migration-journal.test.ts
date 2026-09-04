/**
 * Every migration file must be listed in drizzle/meta/_journal.json.
 *
 * `pnpm db:migrate` does not read the drizzle/ directory — it reads the
 * journal. A .sql file that is not listed there is not a migration; it is a
 * file. That is not hypothetical: 0104 was written, tested against a real
 * database, dry-run against a copy of production, and would still have done
 * nothing on deploy, because the journal entry was missing and the test read
 * the .sql file directly.
 *
 * This test needs no database. It is the check that would have caught it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const DRIZZLE_DIR = join(process.cwd(), 'drizzle');

type Journal = {
  entries: Array<{ idx: number; tag: string; when: number }>;
};

const journal: Journal = JSON.parse(
  readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf8')
);

/**
 * Migration files that predate this check and are NOT in the journal, so
 * `db:migrate` has never run them. Twenty-five of them, from 0032 to 0086.
 *
 * They are listed rather than fixed. Adding them to the journal now would run
 * years-old DDL against databases that already have those objects — several
 * are named "fix_…" and were plainly applied by hand at the time. Sorting that
 * out means checking each against a live schema, which is its own piece of
 * work, not a side effect of adding 0104.
 *
 * The point of the list is that it cannot grow: a new unlisted file fails the
 * test. Shrinking it is welcome.
 */
const KNOWN_UNLISTED = new Set([
  "0032_release_notes",
  "0034_fix_system_logs_source",
  "0035_add_system_logs_source_column",
  "0036_fix_system_logs_table",
  "0042_create_mcp_activity",
  "0045_password_reset_tokens",
  "0046_active_profile_fk",
  "0047_tools_table",
  "0048_add_profile_capabilities",
  "0049_lame_invaders",
  "0050_missing_fk_constraint",
  "0051_tense_mockingbird",
  "0052_fix_slug_profile_uniqueness",
  "0053_security_enhancements",
  "0055_performance_indexes",
  "0070_oauth_optimization",
  "0071_add_user_id_to_pkce_states",
  "0072_add_unique_constraint_oauth_tokens",
  "0073_add_composite_index_oauth_tokens",
  "0074_atomic_refresh_token_marking",
  "0075_pkce_state_audit_and_constraints",
  "0076_metrics_performance_indexes",
  "0077_clipboard_size_and_index",
  "0078_clipboard_name_idx_check",
  "0086_model_router_services",
]);

/**
 * One pair is out of chronological order in the journal. Same reasoning:
 * recorded so the ordering check is still useful for everything after it.
 */
const KNOWN_OUT_OF_ORDER = '0066_fix_missing_username';

const sqlTags = readdirSync(DRIZZLE_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => f.replace(/\.sql$/, ''))
  .sort();

describe('drizzle migration journal', () => {
  it('lists every .sql file in drizzle/', () => {
    const listed = new Set(journal.entries.map((e) => e.tag));
    const missing = sqlTags.filter((tag) => !listed.has(tag) && !KNOWN_UNLISTED.has(tag));

    expect(missing).toEqual([]);
  });

  it('does not let the unlisted set grow silently', () => {
    // If a file in KNOWN_UNLISTED has since been listed or deleted, the entry
    // should go — otherwise the exemption outlives the exception.
    const listed = new Set(journal.entries.map((e) => e.tag));
    const present = new Set(sqlTags);
    const stale = [...KNOWN_UNLISTED].filter((tag) => listed.has(tag) || !present.has(tag));

    expect(stale).toEqual([]);
  });

  it('does not list a migration whose file is gone', () => {
    const present = new Set(sqlTags);
    const dangling = journal.entries.map((e) => e.tag).filter((tag) => !present.has(tag));

    expect(dangling).toEqual([]);
  });

  it('numbers entries consecutively from 0, so none is skipped', () => {
    const indices = journal.entries.map((e) => e.idx);

    expect(indices).toEqual(indices.map((_, i) => i));
  });

  it('orders entries by their timestamp', () => {
    const entries = journal.entries.filter((e) => e.tag !== KNOWN_OUT_OF_ORDER);
    const whens = entries.map((e) => e.when);

    expect(whens).toEqual([...whens].sort((a, b) => a - b));
  });

  it('has a filename prefix matching each entry index', () => {
    for (const entry of journal.entries) {
      expect(entry.tag).toMatch(new RegExp(`^${String(entry.idx).padStart(4, '0')}_`));
    }
  });
});
