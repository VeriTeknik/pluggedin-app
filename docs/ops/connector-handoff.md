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
- **#197** — the two workspace-collapse survey scripts.

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

The decision taken: **collapse Workspaces (profiles) into Hubs (projects)
first**, so the question disappears rather than being worked around. Until that
lands, do not wrap memory or clipboard.

## The workspace collapse

Workspaces are already hidden from new users — `users.show_workspace_ui`
defaults to false. The question is whether the concept can go entirely.

Survey one has been run against production:

- **Collisions:** `mcp_servers.slug` 25 groups / 25 rows. Everything else zero —
  including `clipboards.idx`, the one that would not have been a simple rename.
- **Rows to move:** ~1.7k (`mcp_activity` 1431, `mcp_servers` 153,
  `notifications` 89, `shared_mcp_servers` 6, `docs` 3).
- **Scale:** 1238 users, 1340 projects, 53 multi-profile projects.

Two things about those numbers:

1. **The empty/holding-data split needs re-running.** Section 4 originally
   counted a hand-picked subset of tables and reported Workspaces as empty that
   were not. It now covers all 22 tables with a `profile_uuid` column, taken
   from `information_schema`. The earlier "26 empty / 37 holding data" figure
   overstates the empty side.
2. **`users.last_login_at` is not an activity signal here.** It is populated for
   68 of 1238 users. The `users_active_90d = 0` from section 1 means "login time
   is not written", not "nobody uses Workspaces". `workspace-collapse-followup.sql`
   asks the same question using data timestamps instead — run it.

**The slug collisions are not a pure rename.** `slug` is the tool-name prefix:
tools are exposed as `{slug}__{tool}`. Renaming one renames every tool that
server offers, so a user whose saved instructions call the old prefixed name
would silently be calling a tool that no longer exists. The follow-up script
tells you which side of each collision is dead; rename that one.

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
with double quotes. `information_schema` costs one query.

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
different profiles.

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
