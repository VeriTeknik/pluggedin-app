# Removing Workspaces: promote, don't merge

The plan was to collapse the profiles inside a Hub into one and move 25 tables
from `profile_uuid` to `project_uuid`. This is the other way round: give every
surviving profile its own Hub, so a Hub has exactly one Workspace and the
Workspace stops being an axis anyone has to resolve.

Everything below has been executed against a restored copy of production, not
reasoned about. Where the rehearsal contradicted the design, the design changed.

## Why promotion is cheaper, and not by a little

Every unique constraint that made merging expensive is keyed on `profile_uuid`:

| Constraint | Under merge | Under promotion |
|---|---|---|
| `mcp_servers (profile_uuid, slug)` | 25 renames | untouched |
| `clipboards (profile_uuid, name)` | 0 | untouched |
| `clipboards (profile_uuid, idx)` | a behaviour decision | untouched |
| `collective_feedback (pattern_uuid, profile_uuid)` | 0 | untouched |
| `individuation_snapshots (profile_uuid, snapshot_date)` | 0 | untouched |

Promotion changes `profiles.project_uuid`. It does not change `profiles.uuid`,
so every one of those tuples is exactly as unique afterwards as before. The 25
slug collisions never occur — which matters more than the count suggests, since
`slug` is the tool-name prefix (`{slug}__{tool}`) and renaming one silently
invalidates any saved instruction naming that server's tools.

The rehearsal confirms it rather than asserting it: the md5 of every
`(profile_uuid, slug)` pair in `mcp_servers` is byte-for-byte identical before
and after — `e51f4b2ecaaa61da202f153e06436af4` either side of the run. So is
every row count. Merging would have moved ~2.0k rows across 25 tables;
promotion moves none.

## What production looks like

Re-derive these before acting — they drift. Production gained two users and two
Hubs between the survey and this document, which is why
`scripts/promote-workspaces.ts` reports before it changes anything.

At the time of the rehearsal: 1405 profiles under 1342 Hubs, so **63 secondary
Workspaces** across 49 users. Of those, **24 hold no rows in any of the 25
tables carrying `profile_uuid`** and are deleted rather than promoted; **39 are
promoted**; **3 of the 39** would take a name their owner already uses for a Hub
and get `<old hub> — <workspace>` instead.

(An earlier count said 7 name clashes. That counted the empty Workspaces too,
which are deleted and never named.)

No secondary Workspace has been written to in 94 days — the newest row in any of
them is 2026-05-10, measured from the data's own timestamps rather than
`users.last_login_at`, which is populated for 68 of 1238 users and means nothing
here. That is what makes losing the Hub-level grouping acceptable.

## Running it

```bash
# 1. Report. Changes nothing. This is the default.
docker compose run --rm pluggedin-app node_modules/.bin/tsx scripts/promote-workspaces.ts

# 2. Migrations: the audit table, and the invariant if it can be taken yet.
docker compose run --rm pluggedin-app node_modules/.bin/drizzle-kit migrate

# 3. Promote, then lock the invariant in.
docker compose run --rm pluggedin-app node_modules/.bin/tsx scripts/promote-workspaces.ts --execute

# 4. Confirm it actually landed. Exits non-zero if not.
docker compose run --rm pluggedin-app node_modules/.bin/tsx scripts/promote-workspaces.ts --verify

# 5. Re-embed the documents that changed Hub (see "Search vectors" below).
#    Step 3 prints the Hub uuids and the exact commands; run them per Hub.

# If it needs undoing:
docker compose run --rm pluggedin-app node_modules/.bin/tsx scripts/promote-workspaces.ts --rollback
# ...and then step 5 again, for the Hubs the rollback prints.
```

### Search vectors: re-embed after promotion and after rollback

Moving a document to another Hub is not finished when the transaction commits.
Each vector in zvec carries its own copy of `project_uuid` and the uuid of its
chunk, and retrieval filters vectors by Hub, then loads chunk text by chunk uuid
alone. zvec is a separate single-writer store the transaction cannot touch, so
promotion (and rollback) gives every chunk that changes Hub a **new uuid**: a
vector still labelled with the old Hub then resolves to no text, and the Hub the
documents left can no longer read them.

The price is that the moved documents are **not searchable in either Hub until
they are re-embedded**. `--execute` and `--rollback` print a warning listing the
affected Hubs (`lib/db/workspace-promotion.ts`, `vectorResyncInstructions()`).
Re-embed from `document_chunks` (`scripts/reindex-rag.ts`), either:

- with the app stopped (zvec has a single writer), against the live
  `ZVEC_DATA_PATH`, per target Hub:

  ```bash
  pnpm reindex:rag -- --project=<hub uuid>
  # in the compose deployment, with the app container stopped:
  docker compose run --rm pluggedin-app node_modules/.bin/tsx scripts/reindex-rag.ts --project=<hub uuid>
  ```

- or with the app running, a full rebuild into a fresh `ZVEC_DATA_PATH`, then
  restart the app on it:

  ```bash
  ZVEC_DATA_PATH=<new path> pnpm reindex:rag
  ```

Do not run `--project` into a fresh path: the app would come back with only
those Hubs indexed. Re-index in the Library does the same for a single Hub from
the UI. A rollback detaches the returned documents the same way, so it needs its
own re-embed for the Hubs it prints.

Freeze first if there is any doubt: `UPDATE users SET show_workspace_ui = false`.
The only path that creates a second Workspace under an existing Hub is
`createProfile` in `app/actions/profiles.ts`, already gated behind
`requireWorkspaceUI()`, so this closes the one way the migration could race a
user.

## Two things the rehearsal changed

**drizzle-kit applies every pending migration in a single transaction.** The
first design had `0102` raise when duplicates still existed, so applying it out
of order would fail loudly. It does — and takes `0101` down with it, so the
audit table the promotion script needs is never created. The ordering deadlocks:
the constraint needs the promotion, the promotion needs the audit table, and the
audit table ships in the same transaction as the constraint. `0102` now takes
the constraint when it can and skips with a `WARNING` when it cannot;
`enforceOneWorkspacePerHub` in the script is the step that refuses loudly, and
`--verify` is how a deploy confirms the invariant landed rather than assuming
"migrations applied" meant it did.

**21 Hubs came out of the first run pointing at a Workspace that had left them.**
`projects.active_profile_uuid` carries no foreign key, and it is exactly what
the web UI reads to decide which Workspace you are looking at. When a user's
selected Workspace was a secondary one, promoting it away left the old Hub
pointing outside itself. Promotion now repoints the old Hub at its remaining
Workspace, and records the previous selection so rollback can put it back. After
the fix the rehearsal reports zero Hubs pointing outside themselves, zero with
no Workspace, and zero with no selection.

Neither was caught by reasoning or by unit tests. Both were caught by running it
against real data.

## What the tests cover

`tests/integration/workspace-promotion.test.ts`, 26 cases against a real
Postgres, skipping when `INTEGRATION_DATABASE_URL` is unset:

- The list of `profile_uuid`-carrying tables matches `information_schema`. That
  list has drifted twice — once picked by hand, once grepped out of
  `db/schema.ts` — and each time a Workspace was reported empty when it was not.
  Emptiness decides deletion, so this test is the one standing between a stale
  list and deleted data.
- Colliding slugs survive untouched; no profile-scoped row moves.
- `docs` and `document_chunks` follow their profile to the new Hub, and moved
  chunks get new uuids so vectors still labelled with the old Hub resolve to
  nothing (`tests/deepsec/d-workspace-promotion-vectors.test.ts`, no database).
- The whole run is one transaction: a failure part-way leaves nothing behind.
- The invariant rejects a second Workspace, and refuses to be applied while any
  Hub still holds two.
- Rollback restores Workspaces, their Hubs' selections, the deleted Workspaces,
  and removes the Hubs promotion created.

Each control was verified by breaking it: removing the transaction makes the
atomicity test fail 3 runs out of 3, renaming slugs makes the slug test fail and
nothing else, dropping the audit write makes rollback fail. A test that has
never failed has not been shown to work.

Rollback was verified the same way, end to end: promote a copy of production,
roll back, and compare a fingerprint of row counts, the slug map, the
profile→Hub map, and every Hub's selection. Identical.

## What this does not do, and why not

**The Workspace UI is still there.** Removing it before the script runs would
leave the 70 users with `show_workspace_ui` unable to reach data in their second
Workspace. After promotion that data is a Hub and reachable from the Hubs
dropdown, so the removal is safe then and not before. It is a separate change,
gated on step 3 above having run.

**`memory` and `clipboard` are still unwrappable.** Every action in
`app/actions/memory.ts` (via `createProfileAction`) and `app/actions/clipboard.ts`
derives its profile from a NextAuth session the connector does not have.
Promotion removes the ambiguity about *which* profile is meant — there is now
exactly one per Hub, enforced — but not the session dependency. The handlers
inside `createProfileAction` already take `profileUuid` explicitly, so the fix is
small; it wants #194's `HubProfile` brand to type the entry point, and #194 is
still open. Doing it against `string` instead would give up the compile-time
guarantee that a handler cannot be called without proving the Hub first, which is
the whole point of that type.

**`requireHubProfile` is untouched.** It lives in #194, and it is already
correct: it prefers `active_profile_uuid` and validates it against the Hub. Its
comment says the column has "no guarantee it still points inside this project" —
the 21 dangling pointers above are that hazard, observed. Once this lands, its
fallback becomes unreachable and can go, on that branch rather than in a
conflicting copy here.
