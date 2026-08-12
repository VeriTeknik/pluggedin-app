# Hosted MCP connector — handoff

Paste this into a fresh Claude Code session on the live box.

---

You are continuing work on the hosted MCP connector in `pluggedin-app`. Read this
whole brief before doing anything; several of the traps below cost real time to
find and one of them produced a wrong number the team had already acted on.

## Where the work stands

Merged to `main`:

| PR | What |
|---|---|
| #176 | PKCE state validation extracted; 17 P0 security tests that had never run |
| #175 | OAuth 2.1 authorization server (Phase A) |
| #183 | sanitize-html 2.17.6, `engines.node` corrected to `>=22.12.0` |
| #181, #185 | `docs/ops/hosted-connector-deploy-checks.md` and three corrections |
| #186 | §4's abuse checks as integration tests against a real Postgres |
| #188 | The connector endpoint: stateless MCP over OAuth at `/api/mcp` |
| #190 | `server/discover` reachable without a credential; §2 rewritten |
| #191 | Hub boundary (`GrantedHub`) and the three library tools |

Open:

- **#194** — task tools and the `HubProfile` axis. Checks green, threads resolved.
- **#197** — the two workspace-collapse survey scripts, both run against
  production, plus `workspace-promotion-plan.md`, which replaces the merge plan.

The connector serves eight tools today: two Hub, three library, three task.

## What is blocked, and why

`memory` and `clipboard` cannot be wrapped as they stand. Every action in
`app/actions/memory.ts` (via `createProfileAction`, line 70) and
`app/actions/clipboard.ts` derives its profile like this:

```ts
const userId = await requireAuthUserId();            // a NextAuth session
const profileUuid = await getActiveProfileUuid(userId);
```

The connector has a bearer token, not a session, so the first call throws. And
`clipboard.ts`'s own helper resolves the profile by taking the user's first
project with `LIMIT 1` and no ordering — it ignores the granted Hub set
entirely.

`tasks` shipped because `getNotifications(profileUuid, …)` takes the profile
explicitly. That is the whole difference.

The decision taken: **remove the Workspace axis first**, so the question
disappears rather than being worked around. Until that lands, do not wrap memory
or clipboard.

## The workspace collapse

Workspaces are already hidden from new users — `users.show_workspace_ui`
defaults to false. The question was whether the concept can go entirely.

**Read `docs/ops/workspace-promotion-plan.md` before doing anything here.** The
approach changed on 2026-08-13, after both surveys had been run against
production. It is no longer *merge the profiles inside a Hub*; it is *give each
surviving profile its own Hub*. Every unique constraint that made the merge
expensive is keyed on `profile_uuid`, and promotion does not change
`profile_uuid` — so the 25 slug collisions never occur and none of the ~2.0k
rows move. 24 empty secondary Workspaces get deleted, 39 get promoted, 49 users
see any change at all.

What the surveys established, and what is still worth knowing:

- **Collisions under the old plan:** `mcp_servers.slug` 25 groups / 25 rows.
  Everything else zero, including `clipboards.idx`, the one that would not have
  been a simple rename. Moot under promotion; recorded because it is what the
  scripts measure.
- **Scale:** 1238 users, 1340 projects, 1403 profiles, 53 multi-profile
  projects, 63 secondary Workspaces.
- **Empty vs holding data: 24 / 39.** An earlier run said 26 / 37 and was
  wrong — section 4 counted a hand-picked subset of tables. It now counts all 25
  carrying `profile_uuid` and section 3 carries a guard that fails loudly if the
  live schema has a table the script does not list. The list has drifted twice:
  once picked by hand, once derived from `db/schema.ts`.
- **No secondary Workspace has been written to in 94 days.** Newest row anywhere
  in one is 2026-05-10; 2 inside 180 days, 19 inside a year. This is what makes
  losing the Hub-level grouping acceptable.

**`users.last_login_at` is not an activity signal here.** It is populated for 68
of 1238 users. The `users_active_90d = 0` in section 1 means "login time is not
written", not "nobody uses Workspaces". Use the follow-up script, which asks the
same question from the data's own timestamps.

**If the merge plan is ever revived, the slug collisions are not a pure rename.**
`slug` is the tool-name prefix: tools are exposed as `{slug}__{tool}`. Renaming
one renames every tool that server offers, so a user whose saved instructions
call the old prefixed name would silently be calling a tool that no longer
exists. The follow-up script says which side of each collision is dead. Measure
that per server (`mcp_activity.server_uuid`), not per Workspace — attributing
every call in a Workspace to every server in it marked 10 collisions contested
when the real number is 7, and 17 of the 25 have never had either side called.

## Conventions this codebase now expects

**Verify a control by breaking it.** Every fix here was checked by removing the
control and confirming a test fails. Several tests looked thorough and proved
nothing until that was done. Two examples worth internalising: a mock that
ignores the `where` clause answers the same with or without a condition, so
assert on the SQL (walk drizzle's `queryChunks` for column names) rather than on
returned rows; and a mutation that silently fails to apply reads as a survivor,
so confirm the edit landed before believing the result.

**Enter a test at the layer under discussion.** Four bugs in this work reached
review because a test entered below the layer holding them: seeded authorization
codes hid a consent-path fault, a pre-parsed body hid a route ordering fault, a
supplied bearer token hid a routing fault. Coverage was never the problem.

**Ask the database what exists.** Deriving a table list by grepping
`db/schema.ts` produced tables with no such column and missed tables declared
with double quotes. `information_schema` costs one query. That list then drifted
a second time — the schema-derived version was three tables short of production
— so the survey now carries a guard that compares its own list against the live
schema and prints anything missing. A hardcoded list is fine; a hardcoded list
that cannot tell you it is stale is not.

**Checking whether reviews are clear.** Do *not* filter comments on sentry's
`*Resolved in <sha>*` prefix — that is not what GitHub means by an unresolved
thread, and `main` has `required_conversation_resolution: true`. Use:

```bash
gh api graphql -f query='{repository(owner:"VeriTeknik",name:"pluggedin-app"){
  pullRequest(number:NNN){reviewThreads(first:50){nodes{isResolved path line
  comments(first:1){nodes{author{login} body}}}}}}}'
```

Reporting a PR clean while it sat BLOCKED with three live threads happened here
more than once.

**A green check does not mean a review happened.** Sourcery's check reports
SUCCESS when it posts a rate-limit message and stops. Read the review body
before claiming two reviewers agreed.

**Migrations.** `pnpm db:generate` then `pnpm db:migrate`, never hand-applied.
On the box, `pnpm` is deliberately absent from the runtime image:

```bash
docker compose run --rm pluggedin-app node_modules/.bin/drizzle-kit migrate
```

**The baseline is 204 failing tests on `main`.** Compare against `main` before
attributing a failure to your change. Recreate the comparison worktree if it is
gone:

```bash
git worktree add /tmp/mainbase origin/main
ln -s "$PWD/node_modules" /tmp/mainbase/node_modules
npx vitest run --root /tmp/mainbase
```

## Design notes you will need

`lib/mcp/connector/hub-scope.ts` is the only way a handler obtains a Hub.
`requireGrantedHub` returns a branded `GrantedHub`; `requireHubProfile` returns a
branded `HubProfile`. Handlers take those types, never `string`, so omitting the
scope is a compile error rather than a silent widening. This exists because the
shared actions fall back to *every document the user owns* when `projectUuid` is
absent — fine for the web UI, whose boundary is the user; wrong here, whose
boundary is the granted Hub set. The failure has no symptom: the wrong data
comes back and the call looks like it worked.

`requireHubProfile` prefers `projects.active_profile_uuid` — what the web UI
reads — and confirms it still sits inside the granted Hub before using it.
Taking the oldest profile instead meant the connector and the browser landed on
different profiles. Once the promotion plan lands this stops being a preference
at all: one profile per Hub, enforced by a `UNIQUE` constraint on
`profiles(project_uuid)`, so the lookup has exactly one answer.

Hub handles are **not capabilities**. `pluggedin_open_hub` mints one because
SEP-2567 left nowhere to keep "the currently selected Hub", but every call
re-checks the Hub against the granted set. A forged handle, someone else's, and
a raw project uuid all get the same answer.

`TOOL_SCOPES` in `lib/oauth/provider/scopes.ts` is the authorization decision and
**fails closed**. A tool absent from it cannot be called, so tool names must
match that map — inventing `pluggedin_list_tasks` produced error messages
pointing at a tool nothing could call.

## Still outstanding

- §3 of the deploy doc — the consent screen — has never been verified. It needs a
  browser and nobody has done it.
- `pluggedin_search_documents` and `pluggedin_update_document` have no action
  underneath; they need writing before they can be wrapped.
- The homepage deliberately says nothing about the connector yet. The call was to
  wait until the tool surface is worth pointing at.
