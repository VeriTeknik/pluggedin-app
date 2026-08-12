# Removing Workspaces: promote, don't merge

This supersedes the merge plan the surveys were written to cost. The surveys
themselves stay — they produced the evidence this rests on — but the expensive
question they were measuring no longer gets asked.

## The change

The plan was: collapse the profiles inside a project into one, then move 25
tables from `profile_uuid` to `project_uuid`. Call that **merge**.

The plan is now: give every surviving profile its own project, so each Hub has
exactly one Workspace and the Workspace stops being an axis anyone has to
resolve. Call that **promote**.

## Why promote is cheaper, and not by a little

Every unique constraint that made merge expensive is keyed on `profile_uuid`:

| Constraint | Under merge | Under promote |
|---|---|---|
| `mcp_servers (profile_uuid, slug)` | 25 renames | untouched |
| `clipboards (profile_uuid, name)` | 0 | untouched |
| `clipboards (profile_uuid, idx)` | a behaviour decision | untouched |
| `collective_feedback (pattern_uuid, profile_uuid)` | 0 | untouched |
| `individuation_snapshots (profile_uuid, snapshot_date)` | 0 | untouched |

Promotion changes `profiles.project_uuid`. It does not change
`profiles.uuid`, so every one of those tuples is exactly as unique afterwards as
it was before. The 25 slug collisions do not need resolving because they never
occur — which matters more than the count suggests, since `slug` is the
tool-name prefix (`{slug}__{tool}`) and renaming one silently invalidates every
saved instruction naming its tools.

The same holds for the row counts. Merge had to move ~2.0k rows across 25 tables
(`mcp_activity` 1431, `audit_logs` 224, `mcp_servers` 153, `notifications` 89,
`server_installations` 76, `playground_settings` 10, `shared_mcp_servers` 6,
`docs` 3, `shared_collections` 1). Promotion moves **none** of them: they stay
keyed to the same profile, and the profile just acquires a new parent.

## What production says (surveyed 2026-08-12)

- 1403 profiles under 1340 projects → **63 secondary Workspaces**, belonging to
  49 users. Everyone else already has exactly one.
- **24 of the 63 are completely empty** across all 25 tables carrying
  `profile_uuid`. Those get deleted, not promoted — promoting them would mint 24
  empty Hubs. That leaves **39 to promote**.
- **No secondary Workspace has had a row written to it in 94 days.** The newest
  row anywhere in one is 2026-05-10; 2 have been touched inside 180 days, 19
  inside a year. This is measured from the data's own timestamps, not
  `users.last_login_at`, which is populated for 68 of 1238 users and means
  nothing here.
- Integrity is clean: no orphan profiles, no project without a profile,
  `active_profile_uuid` set on every project and always pointing inside it.

The fossil finding is what makes the trade acceptable. Merge would have lost the
*separation* between two Workspaces; promotion loses the *grouping* that put
them under one Hub. Nobody is actively using that grouping.

## The migration

Numbers below are from the survey run on 2026-08-12. Re-derive them at execution
time rather than trusting them — the point of the surveys is that they are
re-runnable.

**0. Freeze.** Set `users.show_workspace_ui = false` for all users first. The
only code path that creates a second profile under an existing project is
`createProfile` in `app/actions/profiles.ts`, and it is already gated behind
`requireWorkspaceUI()`. Freezing first means the migration cannot race a user
creating a Workspace mid-run, and it makes step 4 safe to apply.

**1. Delete the empty secondaries.** 24 profiles with zero rows in all 25
tables. Re-check emptiness at run time, do not use the count above.

**2. Promote the rest.** For each of the 39 remaining secondary profiles: insert
a `projects` row for the same `user_id`, point its `active_profile_uuid` at the
profile, and set `profiles.project_uuid` to the new project. Record the
old→new mapping in a scratch table; that mapping is the rollback.

Naming: use the profile's name. **7 of the 39 have a name identical to an
existing Hub of the same user.** There is no unique constraint on
`projects.name`, so this cannot fail the migration — it just puts two
identical entries in the Hubs dropdown. For those 7, use
`<old hub name> — <workspace name>`.

**3. Realign the dual-keyed rows.** `docs` is the only table carrying both
`profile_uuid` and `project_uuid`; 3 of its rows belong to a secondary profile
and their `project_uuid` must follow. Their `document_chunks` count is 0, but
re-check — `document_chunks.project_uuid` would need the same treatment.

**4. Enforce the invariant.** Add `UNIQUE` on `profiles(project_uuid)`. This is
the step that makes the whole thing worth doing: one Workspace per Hub stops
being a convention someone has to remember and becomes something the database
refuses to violate. Verify it by trying to insert a second profile and
confirming the insert fails.

**5. Remove the UI.** The Workspaces dropdown and "Workspace activated" control,
`createProfile`, `requireWorkspaceUI`, and `users.show_workspace_ui`. Readers
today: `lib/auth.ts`, `lib/auth-helpers.ts`, `components/profile-switcher.tsx`,
`app/(sidebar-layout)/(container)/settings/components/current-profile-section.tsx`.

Migrations go through `pnpm db:generate` then `pnpm db:migrate`, never
hand-applied. On the box `pnpm` is absent from the runtime image:

```bash
docker compose run --rm pluggedin-app node_modules/.bin/drizzle-kit migrate
```

Rollback is repointing `profiles.project_uuid` from the mapping table and
deleting the projects created in step 2. No row of user data is rewritten by
steps 1–4 except the 3 in step 3, which is what makes rollback cheap.

## What this does and does not fix

**Fixed by construction.** `requireHubProfile` in
`lib/mcp/connector/hub-scope.ts` currently prefers `projects.active_profile_uuid`
and falls back — a heuristic that at one point took the oldest profile and so
landed the connector on a different Workspace than the browser. With one profile
per Hub there is one answer, and step 4 makes it impossible for there to be two.

**Not fixed, still to do.** `memory` and `clipboard` remain unwrappable until
their actions stop deriving the profile from a NextAuth session. Every action in
`app/actions/memory.ts` (via `createProfileAction`) and `app/actions/clipboard.ts`
calls `getActiveProfileUuid(userId)`, which needs a session the connector does
not have. Promotion removes the *ambiguity* about which profile is meant; it
does not remove the session dependency. These need parameterising the way
`getNotifications(profileUuid, …)` already is.

Separately, `clipboard.ts`'s own helper resolves a project by taking the user's
first with `LIMIT 1` and no ordering, ignoring the granted Hub set. That is a
bug on its own terms and survives this migration untouched.

## Open

The migration SQL is not in this PR. It needs writing against a restored copy of
production and verifying by breaking each control — in particular that step 4's
constraint actually rejects a second profile, and that a promoted Workspace's
servers keep their `{slug}__{tool}` names byte for byte.
