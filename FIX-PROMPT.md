# Fix 5 confirmed auth vulnerabilities in pluggedin-app

A security scan found these and I verified the top one by hand. All are in
`app/actions/social.ts` and `app/actions/memory.ts`. Both files start with
`'use server'`, so **every exported function is a public HTTP endpoint** —
callable by anyone who knows the action id, logged in or not. Several of these
functions back live public pages, so the action ids are already exposed.

Fix all five. Work on a branch off `main`, do not deploy without review.

---

## 1. CRITICAL — `getFollowers` / `getFollowing` leak password hashes and 2FA secrets

`app/actions/social.ts:546` and `:572`

Both run `db.select({ followerUser: users })` / `{ followedUser: users }` — the
**entire** `users` row, no column projection — and neither calls any auth helper.

`db/schema.ts` (~L159-188) shows `users` holds `password`, `two_fa_secret`,
`two_fa_backup_codes`, `last_login_ip`, `email`.

A `userId` is trivially obtainable from any public `/to/<username>` page, from
`searchUsers`, or the discover feed. `limit` is caller-controlled. So anyone can
harvest password hashes and TOTP seeds for the whole follow graph. Leaking
`two_fa_secret` alone defeats 2FA entirely.

**Fix:** project an explicit public-safe column set (`id`, `username`, `name`,
`avatar_url`, `image`) instead of the whole `users` object, and require an
authenticated session before returning any follower/following list.

## 2. CRITICAL — `getUserByUsername` visibility check is a no-op for logged-in users

`app/actions/social.ts:239`, predicate at `:259`

```ts
if (user.is_public || currentUserId === user.id || currentUserId) return user;
```

The third clause makes the whole check pass for **any** authenticated caller, so
`is_public` is decorative once you are logged in. The query at `:246-248` also has
no column restriction, so it returns the same secrets as finding #1. This backs the
public profile page (`app/to/[username]/page.tsx` L65, L81), so every profile view
pulls those fields into the server-rendered tree.

**Fix:** drop the bare `|| currentUserId` so it reads
`user.is_public || currentUserId === user.id`, and select only public-safe columns.
Never return auth columns from a profile lookup.

## 3. CRITICAL — MCP server sharing has no ownership check and republishes decrypted credentials

`app/actions/social.ts:604` (`shareMcpServer`), plus read paths at `:670`, `:459`, `:1186`

- `shareMcpServer(profileUuid, serverUuid, …)` never verifies the session owns
  `profileUuid`, and looks up `serverUuid` against **any** server in the system.
- Without a `customTemplate` it calls `createShareableTemplate()`
  (`app/actions/mcp-servers.ts` L885-915), which decrypts `command_encrypted`,
  `args_encrypted`, `env_encrypted`, `url_encrypted` and embeds the **plaintext**
  `command`/`args`/`env`/`url` into the persisted `template` JSON. `env` is where
  MCP server API keys live.
- Three read paths then expose it with no gating: `getSharedMcpServer` returns
  `template` even when `is_public=false` and also leaks the owner's raw email;
  `getSharedMcpServers(profileUuid, limit, includePrivate)` takes `includePrivate`
  as an unauthenticated caller-supplied boolean; `isServerShared` returns the raw
  row including `template`.

Chained: learn any other user's `serverUuid` → share it or read the share →
recover that victim's decrypted MCP credentials. Reachable from the client —
`components/server/share-server-dialog.tsx` (`'use client'`) calls it directly.

**Fix:** require verified ownership of both `profileUuid` and `serverUuid` before
creating or reading a share. Strip `env`/`command`/`args`/`url` from
`createShareableTemplate`'s default output instead of auto-including decrypted
secrets. Filter every read path by `is_public = true` unless the caller is verified
to own the profile.

## 4. HIGH — `queryGutIntuition` is unauthenticated

`app/actions/memory.ts:498`

Every sibling action requires auth. `queryCBPPatterns` (`:551`) even carries a
comment explaining that it still calls `requireAuthUserId()` despite being
k-anonymous. `queryGutIntuition` has the identical shape but omits it — it
zod-parses input then calls `queryIntuition()`, which generates an embedding and
runs a vector search. Unauthenticated embedding calls on attacker-supplied strings.

**Fix:** add `await requireAuthUserId();` at the top, matching `queryCBPPatterns`.

## 5. HIGH — collection/embedded-chat mutations trust a caller-supplied `profileUuid`

`app/actions/social.ts:856` (`shareCollection`), `:896` (`updateSharedCollection`),
`:1013` (`unshareCollection`), `:1058` (`shareEmbeddedChat`), `:1098` (`updateEmbeddedChat`)

None call an auth helper. The create actions insert using whatever `profileUuid`
the caller passes, letting anyone publish fabricated content under any victim's
public profile. The update/delete actions *look* guarded —
`and(eq(uuid, targetUuid), eq(profile_uuid, profileUuid))` — but `profileUuid` is
the same untrusted client parameter, not session-derived. Both UUIDs are routinely
returned by this file's own read functions or visible in public URLs, so anyone who
has viewed a collection or chat can update or delete it.

**Fix:** wrap each in `withProfileAuth(profileUuid, …)` so `profileUuid` is verified
against `session.user.id` first. **`unshareServer` in this same file (L765-844)
already implements the correct pattern — copy it.**

---

## Constraints

- `lib/auth-helpers.ts` already provides `withAuth`, `requireAuthUserId`, and
  profile-scoped helpers. Use the existing primitives; do not invent new ones.
- `getFollowers`, `getFollowing`, and `getUserByUsername` back **live public pages**
  (`app/to/[username]/`, `/followers`, `/following`). Public profile viewing must keep
  working for anonymous visitors — the fix is column projection plus a correct
  `is_public` predicate, not blanket auth on profile reads.
- Follow the repo conventions in `CLAUDE.md`: Zod validation, the
  `{ success, data | error }` server-action return shape, i18n for any new user text.

## Verify before opening the PR

1. **Do not expect a green test suite.** This repo is red at baseline — roughly
   203 vitest failures and lint errors exist on a clean checkout of `main`.
   Capture a baseline first (`git stash && pnpm test 2>&1 | tail -5`, then
   restore) and confirm your diff adds no *new* failures. Never report
   "tests pass"; report "no new failures vs baseline".
2. Grep the diff for `select({` in `app/actions/social.ts` — no bare `users`
   table object should remain in any returned projection.
3. Confirm an anonymous visitor can still load `/to/<some-public-username>` and its
   `/followers` page.
4. Confirm a private profile is **not** returned to a logged-in non-owner.
5. Add a regression test asserting that no follower/following/profile payload ever
   contains `password`, `two_fa_secret`, or `two_fa_backup_codes`.
