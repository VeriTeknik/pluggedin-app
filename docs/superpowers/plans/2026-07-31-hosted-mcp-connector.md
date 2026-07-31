# Hosted MCP Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user adds Plugged.in to Claude by pasting `https://plugged.in/api/mcp` into **Add custom connector**, authorises once, and gets their Hub's library, memory, clipboard and tasks as MCP tools — no local process, no API key, no terminal.

**Architecture:** An OAuth 2.1 authorization server and a stateless MCP endpoint, both as Next.js routes in `pluggedin-app`. MCP 2026-07-28 removed protocol sessions (SEP-2567), so every request carries its own identity and version and a route handler is the right shape. Opaque bearer tokens resolve to `{user, hubs, scopes}` on each request. The protocol primitives already built and tested in `pluggedin-mcp/src/protocol/` are extracted into a shared package rather than copied.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM + PostgreSQL, Vitest, `@pluggedin/mcp-protocol` (new, extracted), `@modelcontextprotocol/sdk` 1.30.0 (pinned).

**Spec:** [`docs/superpowers/specs/2026-07-31-hosted-mcp-connector-design.md`](../specs/2026-07-31-hosted-mcp-connector-design.md)

## Global Constraints

- **Package manager is pnpm** (`pnpm@11.5.1`). Install with `pnpm install` only. Dependency `overrides` live in `pnpm-workspace.yaml`, not `package.json` — pnpm 11 ignores the `pnpm` field silently.
- **Never apply migrations directly.** `pnpm db:generate` then `pnpm db:migrate`. No hand-written SQL against the database.
- **Documents are scoped by `project_uuid` (Hub level).** OAuth tokens resolve to a Hub set, never to a bare user.
- **All user-facing text goes through `useTranslation`** (`react-i18next`, locales in `public/locales/{en,tr,zh,hi,ja,nl}`). The consent screen is user-facing.
- **Server actions return `{ success: true, data }` or `{ success: false, error }`.**
- **Never create server-specific implementations.** Generic and extensible only.
- **Test baseline:** `main` currently fails **42 test files / 204 tests**, and `pnpm lint` reports pre-existing errors. Judge a task by whether it *moves* those counts, not by whether the suite is green. Record the count before you start.
- **Commands:** `pnpm test` (vitest run), `pnpm lint`, `pnpm build`, `pnpm db:generate`, `pnpm db:migrate`.

### External requirements — quoted, not paraphrased

These come from Anthropic's connector authentication documentation and the MCP 2026-07-28 specification. Each is load-bearing; several fail *silently* when broken.

| Requirement | Source |
|---|---|
| CIMD is selected only when metadata advertises **both** `"client_id_metadata_document_supported": true` **and** `"none"` in `token_endpoint_auth_methods_supported`. Missing either → silent fallback to DCR. | Anthropic auth docs |
| `code_challenge_methods_supported: ["S256"]` must be advertised; PKCE S256 arrives on every authorization request. | Anthropic auth docs |
| `401` **required** with `WWW-Authenticate: Bearer resource_metadata="…"`. *"Claude does not honor a WWW-Authenticate header on a 200 response."* | Anthropic auth docs |
| Protected-resource `resource` must equal the MCP URL **exactly as the user types it**, including path. | Anthropic auth docs |
| `authorization_servers` — **only the first entry is used**, no fallback. | Anthropic auth docs |
| Token endpoint must accept `application/x-www-form-urlencoded`; DCR uses `application/json`. | RFC 6749 §4.1.3 / RFC 7591 §3.1 |
| Refresh tokens **must rotate** for public clients; return the new token in the same response that invalidates the old. Errors use RFC 6749 codes (`invalid_grant`). | Anthropic auth docs / OAuth 2.1 |
| Redirect URIs: `https://claude.ai/api/mcp/auth_callback`; plus `http://localhost/callback` and `http://127.0.0.1/callback` matched **with the port ignored**. | Anthropic auth docs / RFC 8252 §7.3 |
| Latency budget: **10 s** discovery/registration/token, **30 s** refresh. | Anthropic auth docs |
| Anthropic egress: `160.79.104.0/21`. | Anthropic auth docs |
| Every tool needs a `title` and the applicable `readOnlyHint`/`destructiveHint`. | Directory review criteria |

---

## File Structure

### Phase A — OAuth 2.1 authorization server

| File | Responsibility |
|---|---|
| `db/schema.ts` (append) | Four tables: `oauthClientsTable`, `oauthAuthorizationCodesTable`, `oauthAccessTokensTable`, `oauthRefreshTokensTable` |
| `lib/oauth/tokens.ts` | Mint, hash and compare opaque credentials. No DB access. |
| `lib/oauth/pkce.ts` | S256 challenge verification. Pure. |
| `lib/oauth/redirect-uri.ts` | Redirect-URI matching, including port-agnostic loopback. Pure. |
| `lib/oauth/metadata.ts` | Builds the three discovery documents. Pure — the two CIMD fields live here. |
| `lib/oauth/clients.ts` | CIMD fetch/validate/cache and DCR registration. DB access. |
| `lib/oauth/grants.ts` | Authorization-code issue/redeem, refresh rotation and family revocation. DB access. |
| `lib/oauth/scopes.ts` | Scope constants and enforcement. Pure. |
| `app/.well-known/oauth-authorization-server/route.ts` | RFC 8414 metadata |
| `app/.well-known/oauth-protected-resource/route.ts` | RFC 9728 metadata |
| `app/.well-known/mcp-client/route.ts` | Our own CIMD document |
| `app/api/oauth/register/route.ts` | DCR (JSON body) |
| `app/api/oauth/token/route.ts` | Code exchange + refresh (form-urlencoded body) |
| `app/api/oauth/revoke/route.ts` | RFC 7009 |
| `app/oauth/authorize/page.tsx` | Consent screen (Hub set + scopes) |
| `app/oauth/authorize/actions.ts` | Consent server action |
| `lib/oauth/authenticate.ts` | Bearer → `{user, hubs, scopes}` for the MCP route |

### Phase B — MCP endpoint

| File | Responsibility |
|---|---|
| `packages/mcp-protocol/` | Extracted from `pluggedin-mcp/src/protocol/` |
| `app/api/mcp/route.ts` (rewrite) | Stateless MCP over OAuth |
| `lib/mcp/connector/dispatch.ts` | Method → handler map |
| `lib/mcp/connector/tools.ts` | The curated tool definitions |

### Phase C — Tool surface

| File | Responsibility |
|---|---|
| `lib/mcp/connector/handlers/*.ts` | One file per group: hubs, library, clipboard, tasks, memory, findings |
| `lib/mcp/connector/rings.ts` | CogMem ring taxonomy + alias mapping |

### Phase D — Compliance

| File | Responsibility |
|---|---|
| `app/(legal)/privacy/connector/page.tsx` | Privacy policy section on conversation-derived memory |
| `tests/e2e/connector-handoff.test.ts` | Cross-surface hand-off scenario |

---

## Phase ordering and independence

Phase A is independently testable and is **not affected** by the pending `mcp-review@anthropic.com` answer on the memory model. Start there. Phase C's memory tools are the only part gated on that reply; if the answer is restrictive, Task C4 changes and nothing else does.

---

# Phase A — OAuth 2.1 Authorization Server

## Task A1: OAuth schema and migration

**Files:**
- Modify: `db/schema.ts` (append at end)
- Test: `tests/oauth/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `oauthClientsTable`, `oauthAuthorizationCodesTable`, `oauthAccessTokensTable`, `oauthRefreshTokensTable` — Drizzle table objects imported as `import { oauthAccessTokensTable } from '@/db/schema'`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/oauth/schema.test.ts
import { describe, expect, it } from 'vitest';
import {
  oauthClientsTable,
  oauthAuthorizationCodesTable,
  oauthAccessTokensTable,
  oauthRefreshTokensTable,
} from '@/db/schema';

describe('oauth schema', () => {
  it('stores credentials as hashes, never plaintext', () => {
    // The column is named token_hash on purpose: a column called `token`
    // invites someone to write the token into it.
    expect(oauthAccessTokensTable.token_hash).toBeDefined();
    expect((oauthAccessTokensTable as Record<string, unknown>).token).toBeUndefined();
    expect(oauthRefreshTokensTable.token_hash).toBeDefined();
    expect((oauthRefreshTokensTable as Record<string, unknown>).token).toBeUndefined();
  });

  it('carries the fields refresh-token reuse detection needs', () => {
    expect(oauthRefreshTokensTable.family_id).toBeDefined();
    expect(oauthRefreshTokensTable.parent_id).toBeDefined();
    expect(oauthRefreshTokensTable.rotated_at).toBeDefined();
    expect(oauthRefreshTokensTable.revoked_at).toBeDefined();
    expect(oauthRefreshTokensTable.revocation_reason).toBeDefined();
  });

  it('binds authorization codes to PKCE and a redirect URI', () => {
    expect(oauthAuthorizationCodesTable.code_challenge).toBeDefined();
    expect(oauthAuthorizationCodesTable.code_challenge_method).toBeDefined();
    expect(oauthAuthorizationCodesTable.redirect_uri).toBeDefined();
    expect(oauthAuthorizationCodesTable.consumed_at).toBeDefined();
  });

  it('scopes access to a Hub set, not a bare user', () => {
    expect(oauthAccessTokensTable.granted_project_uuids).toBeDefined();
    expect(oauthAuthorizationCodesTable.granted_project_uuids).toBeDefined();
  });

  it('keys clients by issuer so credentials cannot be reused across servers', () => {
    expect(oauthClientsTable.issuer).toBeDefined();
    expect(oauthClientsTable.client_id).toBeDefined();
    expect(oauthClientsTable.registration_type).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/oauth/schema.test.ts`
Expected: FAIL — `oauthClientsTable` is not exported from `@/db/schema`.

- [ ] **Step 3: Append the tables to `db/schema.ts`**

Add at the end of the file. `text('...').array()` is Drizzle's Postgres text-array; the file already imports everything used here.

```ts
// ===== OAuth 2.1 Authorization Server (hosted MCP connector) =====
//
// Credentials are stored as SHA-256 hashes. The columns are named *_hash so a
// future contributor cannot casually write a plaintext token into them.
// Access is granted to a SET of Hubs (project_uuids) chosen at consent time;
// runtime Hub switching is confined to that set.

export const oauthClientsTable = pgTable(
  'oauth_clients',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    // For CIMD this is the https URL of the client's metadata document.
    client_id: text('client_id').notNull(),
    // Credentials are bound to the authorization server that issued them
    // (SEP-2352), so the natural key is (issuer, client_id).
    issuer: text('issuer').notNull(),
    registration_type: text('registration_type').notNull(), // 'cimd' | 'dcr'
    client_name: text('client_name'),
    redirect_uris: text('redirect_uris').array().notNull(),
    application_type: text('application_type').notNull().default('web'),
    token_endpoint_auth_method: text('token_endpoint_auth_method')
      .notNull()
      .default('none'),
    // CIMD documents are cached; this is when the document was last fetched.
    metadata_fetched_at: timestamp('metadata_fetched_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // DCR registrations expire so the table cannot grow without bound.
    expires_at: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => ({
    oauthClientsIssuerClientIdIdx: index('oauth_clients_issuer_client_id_idx').on(
      table.issuer,
      table.client_id
    ),
    oauthClientsExpiresAtIdx: index('oauth_clients_expires_at_idx').on(table.expires_at),
  })
);

export const oauthAuthorizationCodesTable = pgTable(
  'oauth_authorization_codes',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    code_hash: text('code_hash').notNull().unique(),
    client_uuid: uuid('client_uuid')
      .notNull()
      .references(() => oauthClientsTable.uuid, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    granted_project_uuids: uuid('granted_project_uuids').array().notNull(),
    scopes: text('scopes').array().notNull(),
    redirect_uri: text('redirect_uri').notNull(),
    code_challenge: text('code_challenge').notNull(),
    code_challenge_method: text('code_challenge_method').notNull().default('S256'),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Single use: set on redemption. A second presentation is an error.
    consumed_at: timestamp('consumed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    oauthCodesExpiresAtIdx: index('oauth_codes_expires_at_idx').on(table.expires_at),
  })
);

export const oauthAccessTokensTable = pgTable(
  'oauth_access_tokens',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    token_hash: text('token_hash').notNull().unique(),
    client_uuid: uuid('client_uuid')
      .notNull()
      .references(() => oauthClientsTable.uuid, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    granted_project_uuids: uuid('granted_project_uuids').array().notNull(),
    scopes: text('scopes').array().notNull(),
    // Convenience default Hub, updated by pluggedin_open_hub. Server state
    // keyed to a credential — not a protocol session.
    default_project_uuid: uuid('default_project_uuid').references(
      () => projectsTable.uuid,
      { onDelete: 'set null' }
    ),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    last_used_at: timestamp('last_used_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    oauthAccessTokensExpiresAtIdx: index('oauth_access_tokens_expires_at_idx').on(
      table.expires_at
    ),
    oauthAccessTokensUserIdx: index('oauth_access_tokens_user_idx').on(table.user_id),
  })
);

export const oauthRefreshTokensTable = pgTable(
  'oauth_refresh_tokens',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    token_hash: text('token_hash').notNull().unique(),
    // All tokens descended from one authorization share a family_id. Presenting
    // an already-rotated token means a copy exists somewhere, so the whole
    // family is revoked — rotation without this only makes theft detectable.
    family_id: uuid('family_id').notNull(),
    parent_id: uuid('parent_id'),
    client_uuid: uuid('client_uuid')
      .notNull()
      .references(() => oauthClientsTable.uuid, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    granted_project_uuids: uuid('granted_project_uuids').array().notNull(),
    scopes: text('scopes').array().notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    rotated_at: timestamp('rotated_at', { withTimezone: true }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
    revocation_reason: text('revocation_reason'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    oauthRefreshFamilyIdx: index('oauth_refresh_family_idx').on(table.family_id),
    oauthRefreshExpiresAtIdx: index('oauth_refresh_expires_at_idx').on(table.expires_at),
  })
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/oauth/schema.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Generate and apply the migration**

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: a new file under `drizzle/` creating four tables. Read it before applying — if it proposes dropping or altering an existing table, stop and investigate; this task only adds.

- [ ] **Step 6: Commit**

```bash
pnpm test && pnpm lint
git add db/schema.ts drizzle/ tests/oauth/schema.test.ts
git commit -m "feat(oauth): add authorization server schema

Four tables for the hosted MCP connector's OAuth 2.1 server. Credentials are
stored as SHA-256 hashes and the columns are named *_hash so a plaintext token
cannot be written into them casually — unlike api_keys, which stores keys in
clear text (tracked separately).

oauth_refresh_tokens carries family_id/parent_id/rotated_at because rotation
without reuse detection is close to cosmetic: presenting an already-rotated
token means a copy exists somewhere, and the correct response is revoking the
whole family.

Access is granted to a SET of project_uuids chosen at consent, per the rule that
documents are scoped by project_uuid at Hub level."
```

---

## Task A2: Opaque credential minting and hashing

**Files:**
- Create: `lib/oauth/tokens.ts`
- Test: `tests/oauth/tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `function mintCredential(): string` — 43-char base64url, 32 bytes of CSPRNG
  - `function hashCredential(credential: string): string` — lowercase hex SHA-256
  - `function credentialsMatch(presented: string, storedHash: string): boolean` — timing-safe
  - `const TTL` — `{ authorizationCodeMs: 60_000, accessTokenMs: 3_600_000, refreshTokenMs: 2_592_000_000 }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/oauth/tokens.test.ts
import { describe, expect, it } from 'vitest';
import { TTL, credentialsMatch, hashCredential, mintCredential } from '@/lib/oauth/tokens';

describe('credential minting', () => {
  it('produces unguessable, URL-safe, unique credentials', () => {
    const a = mintCredential();
    const b = mintCredential();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('hashing', () => {
  it('is deterministic lowercase hex', () => {
    const credential = mintCredential();
    expect(hashCredential(credential)).toBe(hashCredential(credential));
    expect(hashCredential(credential)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never returns the credential itself', () => {
    const credential = mintCredential();
    expect(hashCredential(credential)).not.toContain(credential);
  });
});

describe('comparison', () => {
  it('matches a credential against its own hash', () => {
    const credential = mintCredential();
    expect(credentialsMatch(credential, hashCredential(credential))).toBe(true);
  });

  it('rejects a different credential', () => {
    expect(credentialsMatch(mintCredential(), hashCredential(mintCredential()))).toBe(false);
  });

  it('rejects a malformed stored hash without throwing', () => {
    // timingSafeEqual throws on length mismatch; the guard must absorb that.
    expect(credentialsMatch(mintCredential(), 'not-a-hash')).toBe(false);
    expect(credentialsMatch(mintCredential(), '')).toBe(false);
  });
});

describe('lifetimes', () => {
  it('matches the design: 60s code, 1h access, 30d refresh', () => {
    expect(TTL.authorizationCodeMs).toBe(60_000);
    expect(TTL.accessTokenMs).toBe(3_600_000);
    expect(TTL.refreshTokenMs).toBe(2_592_000_000);
  });

  it('leaves margin over Claude’s 5-minute proactive refresh window', () => {
    expect(TTL.accessTokenMs).toBeGreaterThan(5 * 60_000 * 2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/oauth/tokens.test.ts`
Expected: FAIL — cannot resolve `@/lib/oauth/tokens`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/oauth/tokens.ts
/**
 * Opaque credential primitives for the OAuth authorization server.
 *
 * Opaque rather than JWT: revocation is a real requirement here (refresh-token
 * family revocation, user-initiated disconnect), and a single indexed lookup is
 * cheap. JWTs would make revocation a denylist problem.
 *
 * Nothing in this module touches the database, so it stays trivially testable.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/** 32 bytes of CSPRNG output, base64url — 43 characters, no padding. */
export function mintCredential(): string {
  return randomBytes(32).toString('base64url');
}

export function hashCredential(credential: string): string {
  return createHash('sha256').update(credential, 'utf8').digest('hex');
}

/**
 * Timing-safe comparison of a presented credential against a stored hash.
 *
 * timingSafeEqual throws when the buffers differ in length, which a malformed
 * or truncated stored hash would trigger — so the length check comes first and
 * the whole thing is guarded.
 */
export function credentialsMatch(presented: string, storedHash: string): boolean {
  const presentedHash = Buffer.from(hashCredential(presented), 'hex');
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHash, 'hex');
  } catch {
    return false;
  }
  if (stored.length !== presentedHash.length) return false;
  return timingSafeEqual(presentedHash, stored);
}

/**
 * Credential lifetimes.
 *
 * accessTokenMs is deliberately well clear of Claude's behaviour: it refreshes
 * reactively on 401 and proactively up to five minutes before expiry, so a
 * short-lived access token would produce constant refresh traffic.
 */
export const TTL = Object.freeze({
  authorizationCodeMs: 60_000,
  accessTokenMs: 3_600_000,
  refreshTokenMs: 2_592_000_000,
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/oauth/tokens.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
pnpm test tests/oauth/ && pnpm lint
git add lib/oauth/tokens.ts tests/oauth/tokens.test.ts
git commit -m "feat(oauth): add opaque credential minting, hashing and comparison"
```

---

## Task A3: PKCE S256 verification

**Files:**
- Create: `lib/oauth/pkce.ts`
- Test: `tests/oauth/pkce.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `function verifyPkce(verifier: string, challenge: string, method: string): boolean`
  - `const SUPPORTED_CHALLENGE_METHODS: readonly ['S256']`

- [ ] **Step 1: Write the failing test**

The vector below is the canonical example from RFC 7636 Appendix B, so a passing test proves interoperability rather than self-consistency.

```ts
// tests/oauth/pkce.test.ts
import { describe, expect, it } from 'vitest';
import { SUPPORTED_CHALLENGE_METHODS, verifyPkce } from '@/lib/oauth/pkce';

// RFC 7636 Appendix B
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('PKCE S256', () => {
  it('verifies the RFC 7636 test vector', () => {
    expect(verifyPkce(RFC_VERIFIER, RFC_CHALLENGE, 'S256')).toBe(true);
  });

  it('rejects a wrong verifier', () => {
    expect(verifyPkce('wrong-verifier-value-padded-to-length', RFC_CHALLENGE, 'S256')).toBe(false);
  });

  it('rejects the plain method outright', () => {
    // OAuth 2.1 removes `plain`; accepting it would silently weaken every flow.
    expect(verifyPkce(RFC_VERIFIER, RFC_VERIFIER, 'plain')).toBe(false);
  });

  it('rejects an unknown method', () => {
    expect(verifyPkce(RFC_VERIFIER, RFC_CHALLENGE, 'S512')).toBe(false);
  });

  it('rejects empty input without throwing', () => {
    expect(verifyPkce('', RFC_CHALLENGE, 'S256')).toBe(false);
    expect(verifyPkce(RFC_VERIFIER, '', 'S256')).toBe(false);
  });

  it('advertises S256 only', () => {
    expect(SUPPORTED_CHALLENGE_METHODS).toEqual(['S256']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/oauth/pkce.test.ts`
Expected: FAIL — cannot resolve `@/lib/oauth/pkce`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/oauth/pkce.ts
/**
 * PKCE verification (RFC 7636), S256 only.
 *
 * Claude sends a code_challenge with code_challenge_method=S256 on every
 * authorization request regardless of how the client registered, so S256 is not
 * optional for us. OAuth 2.1 removes the `plain` method, and accepting it would
 * silently weaken every flow — so it is rejected explicitly rather than by
 * omission.
 */

import { createHash, timingSafeEqual } from 'crypto';

export const SUPPORTED_CHALLENGE_METHODS = ['S256'] as const;

export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method !== 'S256') return false;
  if (!verifier || !challenge) return false;

  const computed = createHash('sha256').update(verifier, 'ascii').digest('base64url');
  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(challenge, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/oauth/pkce.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
pnpm test tests/oauth/ && pnpm lint
git add lib/oauth/pkce.ts tests/oauth/pkce.test.ts
git commit -m "feat(oauth): add PKCE S256 verification against the RFC 7636 vector"
```

---

## Task A4: Redirect-URI matching, including loopback

**Files:**
- Create: `lib/oauth/redirect-uri.ts`
- Test: `tests/oauth/redirect-uri.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `function redirectUriMatches(presented: string, registered: string): boolean`
  - `function isLoopbackRedirect(uri: string): boolean`
  - `const CLAUDE_HOSTED_REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback'`

- [ ] **Step 1: Write the failing test**

```ts
// tests/oauth/redirect-uri.test.ts
import { describe, expect, it } from 'vitest';
import {
  CLAUDE_HOSTED_REDIRECT_URI,
  isLoopbackRedirect,
  redirectUriMatches,
} from '@/lib/oauth/redirect-uri';

describe('exact matching for non-loopback URIs', () => {
  it('accepts an identical https URI', () => {
    expect(
      redirectUriMatches(CLAUDE_HOSTED_REDIRECT_URI, CLAUDE_HOSTED_REDIRECT_URI)
    ).toBe(true);
  });

  it('rejects a different path on the same host', () => {
    expect(
      redirectUriMatches('https://claude.ai/api/mcp/other', CLAUDE_HOSTED_REDIRECT_URI)
    ).toBe(false);
  });

  it('rejects a different host', () => {
    expect(
      redirectUriMatches('https://evil.example/api/mcp/auth_callback', CLAUDE_HOSTED_REDIRECT_URI)
    ).toBe(false);
  });

  it('does not let an https registration match on port alone', () => {
    expect(
      redirectUriMatches('https://claude.ai:8443/api/mcp/auth_callback', CLAUDE_HOSTED_REDIRECT_URI)
    ).toBe(false);
  });
});

describe('loopback matching ignores the port', () => {
  // Claude Code binds an ephemeral port and declares the port-less form in its
  // CIMD, so both 127.0.0.1 (RFC 8252 s7.3) and localhost must match any port.
  it('matches 127.0.0.1 on any port', () => {
    expect(redirectUriMatches('http://127.0.0.1:3118/callback', 'http://127.0.0.1/callback')).toBe(true);
    expect(redirectUriMatches('http://127.0.0.1:51234/callback', 'http://127.0.0.1/callback')).toBe(true);
  });

  it('matches localhost on any port', () => {
    expect(redirectUriMatches('http://localhost:3118/callback', 'http://localhost/callback')).toBe(true);
  });

  it('still requires the path to match', () => {
    expect(redirectUriMatches('http://127.0.0.1:3118/evil', 'http://127.0.0.1/callback')).toBe(false);
  });

  it('does not treat a non-loopback host as loopback', () => {
    expect(redirectUriMatches('http://192.168.1.5:3118/callback', 'http://127.0.0.1/callback')).toBe(false);
    expect(redirectUriMatches('http://notlocalhost:3118/callback', 'http://localhost/callback')).toBe(false);
  });

  it('identifies loopback URIs for the consent-screen warning', () => {
    expect(isLoopbackRedirect('http://127.0.0.1/callback')).toBe(true);
    expect(isLoopbackRedirect('http://localhost:1234/callback')).toBe(true);
    expect(isLoopbackRedirect('http://[::1]/callback')).toBe(true);
    expect(isLoopbackRedirect(CLAUDE_HOSTED_REDIRECT_URI)).toBe(false);
  });

  it('returns false on unparseable input rather than throwing', () => {
    expect(redirectUriMatches('not a uri', CLAUDE_HOSTED_REDIRECT_URI)).toBe(false);
    expect(isLoopbackRedirect('not a uri')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/oauth/redirect-uri.test.ts`
Expected: FAIL — cannot resolve `@/lib/oauth/redirect-uri`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/oauth/redirect-uri.ts
/**
 * Redirect-URI matching.
 *
 * Exact match everywhere except loopback. Claude Code is a native client that
 * binds an ephemeral port and declares the port-less forms
 * (http://localhost/callback, http://127.0.0.1/callback) in its Client ID
 * Metadata Document, so both must match with the port ignored. RFC 8252 s7.3
 * requires this for the IP literal; Anthropic asks for the same treatment of
 * `localhost` even though s8.3 discourages the name.
 *
 * A CIMD cannot prevent loopback impersonation — any local process can bind a
 * port — which is why isLoopbackRedirect exists: the consent screen warns when
 * the only registered redirect URIs are loopback addresses.
 */

export const CLAUDE_HOSTED_REDIRECT_URI = 'https://claude.ai/api/mcp/auth_callback';

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function parse(uri: string): URL | undefined {
  try {
    return new URL(uri);
  } catch {
    return undefined;
  }
}

export function isLoopbackRedirect(uri: string): boolean {
  const url = parse(uri);
  if (!url) return false;
  return LOOPBACK_HOSTNAMES.has(url.hostname);
}

export function redirectUriMatches(presented: string, registered: string): boolean {
  const a = parse(presented);
  const b = parse(registered);
  if (!a || !b) return false;

  if (a.protocol !== b.protocol) return false;
  if (a.hostname !== b.hostname) return false;
  if (a.pathname !== b.pathname) return false;
  if (a.search !== b.search) return false;

  // Port is ignored only for loopback; everywhere else it is part of identity.
  if (LOOPBACK_HOSTNAMES.has(b.hostname)) return true;
  return a.port === b.port;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/oauth/redirect-uri.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
pnpm test tests/oauth/ && pnpm lint
git add lib/oauth/redirect-uri.ts tests/oauth/redirect-uri.test.ts
git commit -m "feat(oauth): add redirect-URI matching with port-agnostic loopback

Exact match everywhere except loopback, where Claude Code binds an ephemeral
port and declares the port-less form in its CIMD. RFC 8252 s7.3 requires
port-agnostic matching for 127.0.0.1; Anthropic asks for the same for localhost."
```

---

## Task A5: Scope definitions and enforcement

**Files:**
- Create: `lib/oauth/scopes.ts`
- Test: `tests/oauth/scopes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Scope` — the nine scopes plus `offline_access`
  - `const SUPPORTED_SCOPES: readonly Scope[]`
  - `function parseScopeParam(raw: string | null): Scope[]`
  - `function hasScope(granted: string[], required: Scope): boolean`
  - `const TOOL_SCOPES: Readonly<Record<string, Scope>>` — tool name → required scope

- [ ] **Step 1: Write the failing test**

```ts
// tests/oauth/scopes.test.ts
import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_SCOPES,
  TOOL_SCOPES,
  hasScope,
  parseScopeParam,
} from '@/lib/oauth/scopes';

describe('supported scopes', () => {
  it('mirrors the read/write split the directory requires in annotations', () => {
    expect([...SUPPORTED_SCOPES].sort()).toEqual([
      'clipboard:read',
      'clipboard:write',
      'hubs:read',
      'library:read',
      'library:write',
      'memory:read',
      'memory:write',
      'offline_access',
      'tasks:read',
      'tasks:write',
    ]);
  });

  it('includes offline_access so Claude can obtain a refresh token', () => {
    expect(SUPPORTED_SCOPES).toContain('offline_access');
  });
});

describe('parsing the scope parameter', () => {
  it('splits on whitespace and drops unknown scopes', () => {
    expect(parseScopeParam('library:read memory:read bogus:scope')).toEqual([
      'library:read',
      'memory:read',
    ]);
  });

  it('collapses duplicates and tolerates irregular whitespace', () => {
    expect(parseScopeParam('  library:read   library:read\tmemory:read ')).toEqual([
      'library:read',
      'memory:read',
    ]);
  });

  it('returns an empty array for null or empty input', () => {
    expect(parseScopeParam(null)).toEqual([]);
    expect(parseScopeParam('')).toEqual([]);
  });
});

describe('enforcement', () => {
  it('grants only what was granted', () => {
    expect(hasScope(['library:read'], 'library:read')).toBe(true);
    expect(hasScope(['library:read'], 'library:write')).toBe(false);
  });

  it('does not treat write as implying read', () => {
    // Implied hierarchies are a classic source of over-broad grants; keep them
    // explicit so the consent screen and the enforcement agree exactly.
    expect(hasScope(['library:write'], 'library:read')).toBe(false);
  });
});

describe('tool to scope mapping', () => {
  it('maps every read tool to a :read scope and every write tool to :write', () => {
    expect(TOOL_SCOPES['pluggedin_search_documents']).toBe('library:read');
    expect(TOOL_SCOPES['pluggedin_create_document']).toBe('library:write');
    expect(TOOL_SCOPES['pluggedin_clipboard_get']).toBe('clipboard:read');
    expect(TOOL_SCOPES['pluggedin_clipboard_set']).toBe('clipboard:write');
    expect(TOOL_SCOPES['pluggedin_list_notifications']).toBe('tasks:read');
    expect(TOOL_SCOPES['pluggedin_send_notification']).toBe('tasks:write');
    expect(TOOL_SCOPES['pluggedin_memory_search']).toBe('memory:read');
    expect(TOOL_SCOPES['pluggedin_memory_observe']).toBe('memory:write');
    expect(TOOL_SCOPES['pluggedin_record_finding']).toBe('memory:write');
    expect(TOOL_SCOPES['pluggedin_list_hubs']).toBe('hubs:read');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/oauth/scopes.test.ts`
Expected: FAIL — cannot resolve `@/lib/oauth/scopes`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/oauth/scopes.ts
/**
 * OAuth scopes for the hosted MCP connector.
 *
 * Deliberately mirrors the read/write split the directory requires in tool
 * annotations, so the consent screen and the tool list tell the same story: a
 * tool marked readOnlyHint needs a :read scope, a tool that writes needs :write.
 *
 * There is no implied hierarchy — :write does not grant :read. Implied
 * hierarchies quietly widen grants and make the consent screen a lie.
 */

export type Scope =
  | 'library:read'
  | 'library:write'
  | 'memory:read'
  | 'memory:write'
  | 'clipboard:read'
  | 'clipboard:write'
  | 'tasks:read'
  | 'tasks:write'
  | 'hubs:read'
  | 'offline_access';

export const SUPPORTED_SCOPES: readonly Scope[] = [
  'library:read',
  'library:write',
  'memory:read',
  'memory:write',
  'clipboard:read',
  'clipboard:write',
  'tasks:read',
  'tasks:write',
  'hubs:read',
  'offline_access',
] as const;

const SCOPE_SET = new Set<string>(SUPPORTED_SCOPES);

export function parseScopeParam(raw: string | null): Scope[] {
  if (!raw) return [];
  const seen = new Set<Scope>();
  for (const token of raw.split(/\s+/)) {
    if (SCOPE_SET.has(token)) seen.add(token as Scope);
  }
  return [...seen];
}

export function hasScope(granted: string[], required: Scope): boolean {
  return granted.includes(required);
}

/**
 * Tool name to required scope.
 *
 * A tool absent from this map is refused rather than allowed — see the
 * dispatcher in Phase B. Fail closed: forgetting to add a new tool here must
 * not silently expose it.
 */
export const TOOL_SCOPES: Readonly<Record<string, Scope>> = Object.freeze({
  // Hubs
  pluggedin_list_hubs: 'hubs:read',
  pluggedin_open_hub: 'hubs:read',

  // Library
  pluggedin_ask_knowledge_base: 'library:read',
  pluggedin_get_document: 'library:read',
  pluggedin_list_documents: 'library:read',
  pluggedin_search_documents: 'library:read',
  pluggedin_create_document: 'library:write',
  pluggedin_update_document: 'library:write',

  // Clipboard
  pluggedin_clipboard_get: 'clipboard:read',
  pluggedin_clipboard_list: 'clipboard:read',
  pluggedin_clipboard_set: 'clipboard:write',
  pluggedin_clipboard_push: 'clipboard:write',
  pluggedin_clipboard_pop: 'clipboard:write',
  pluggedin_clipboard_delete: 'clipboard:write',

  // Tasks (notifications)
  pluggedin_list_notifications: 'tasks:read',
  pluggedin_send_notification: 'tasks:write',
  pluggedin_mark_notification_done: 'tasks:write',
  pluggedin_delete_notification: 'tasks:write',

  // Memory
  pluggedin_memory_search: 'memory:read',
  pluggedin_memory_details: 'memory:read',
  pluggedin_memory_search_with_context: 'memory:read',
  pluggedin_memory_individuation: 'memory:read',
  pluggedin_memory_session_start: 'memory:write',
  pluggedin_memory_session_end: 'memory:write',
  pluggedin_memory_observe: 'memory:write',
  pluggedin_record_finding: 'memory:write',
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/oauth/scopes.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
pnpm test tests/oauth/ && pnpm lint
git add lib/oauth/scopes.ts tests/oauth/scopes.test.ts
git commit -m "feat(oauth): add scope definitions, parsing and tool mapping

Scopes mirror the read/write split the directory requires in tool annotations,
so the consent screen and the tool list agree. No implied hierarchy: :write does
not grant :read, because implied hierarchies quietly widen grants.

TOOL_SCOPES fails closed — a tool missing from the map is refused, so forgetting
to register a new tool cannot silently expose it."
```

---

## Task A6: Discovery metadata documents

This is the task where a silent mistake is most expensive: omitting either CIMD field downgrades every connection to DCR with no error anywhere.

**Files:**
- Create: `lib/oauth/metadata.ts`
- Create: `app/.well-known/oauth-authorization-server/route.ts`
- Create: `app/.well-known/oauth-protected-resource/route.ts`
- Create: `app/.well-known/mcp-client/route.ts`
- Test: `tests/oauth/metadata.test.ts`

**Interfaces:**
- Consumes: `SUPPORTED_SCOPES` from `@/lib/oauth/scopes`; `SUPPORTED_CHALLENGE_METHODS` from `@/lib/oauth/pkce`; `CLAUDE_HOSTED_REDIRECT_URI` from `@/lib/oauth/redirect-uri`.
- Produces:
  - `function buildAuthorizationServerMetadata(issuer: string): Record<string, unknown>`
  - `function buildProtectedResourceMetadata(resource: string, issuer: string): Record<string, unknown>`
  - `function buildClientIdMetadataDocument(clientIdUrl: string): Record<string, unknown>`
  - `function connectorBaseUrl(): string` — from `NEXTAUTH_URL`, trailing slash stripped

- [ ] **Step 1: Write the failing test**

```ts
// tests/oauth/metadata.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildAuthorizationServerMetadata,
  buildClientIdMetadataDocument,
  buildProtectedResourceMetadata,
} from '@/lib/oauth/metadata';

const ISSUER = 'https://plugged.in';
const RESOURCE = 'https://plugged.in/api/mcp';

describe('authorization server metadata', () => {
  const meta = buildAuthorizationServerMetadata(ISSUER);

  it('advertises BOTH fields Claude requires to choose CIMD over DCR', () => {
    // Claude selects CIMD only when both are present. Missing either one
    // silently falls back to DCR, which registers a new client on every fresh
    // connection. This assertion is the only thing standing between us and
    // that regression.
    expect(meta.client_id_metadata_document_supported).toBe(true);
    expect(meta.token_endpoint_auth_methods_supported).toContain('none');
  });

  it('advertises S256 PKCE', () => {
    expect(meta.code_challenge_methods_supported).toEqual(['S256']);
  });

  it('advertises offline_access so Claude requests a refresh token', () => {
    expect(meta.scopes_supported).toContain('offline_access');
  });

  it('points at the right endpoints', () => {
    expect(meta.issuer).toBe(ISSUER);
    expect(meta.authorization_endpoint).toBe('https://plugged.in/oauth/authorize');
    expect(meta.token_endpoint).toBe('https://plugged.in/api/oauth/token');
    expect(meta.registration_endpoint).toBe('https://plugged.in/api/oauth/register');
    expect(meta.revocation_endpoint).toBe('https://plugged.in/api/oauth/revoke');
  });

  it('supports the authorization_code and refresh_token grants only', () => {
    expect(meta.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
    expect(meta.response_types_supported).toEqual(['code']);
  });
});

describe('protected resource metadata', () => {
  const meta = buildProtectedResourceMetadata(RESOURCE, ISSUER);

  it('states the resource exactly as the user types it into Claude', () => {
    expect(meta.resource).toBe(RESOURCE);
  });

  it('lists exactly one authorization server, because only the first is used', () => {
    expect(meta.authorization_servers).toEqual([ISSUER]);
  });

  it('advertises the scopes Claude should request', () => {
    expect(meta.scopes_supported).toContain('library:read');
    expect(meta.scopes_supported).toContain('offline_access');
  });
});

describe('our own client id metadata document', () => {
  const doc = buildClientIdMetadataDocument('https://plugged.in/.well-known/mcp-client');

  it('uses the document URL as the client_id', () => {
    expect(doc.client_id).toBe('https://plugged.in/.well-known/mcp-client');
  });

  it('declares application_type to avoid OIDC redirect-URI conflicts', () => {
    expect(doc.application_type).toBe('web');
  });

  it('authenticates as a public client', () => {
    expect(doc.token_endpoint_auth_method).toBe('none');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test tests/oauth/metadata.test.ts`
Expected: FAIL — cannot resolve `@/lib/oauth/metadata`.

- [ ] **Step 3: Write `lib/oauth/metadata.ts`**

```ts
// lib/oauth/metadata.ts
/**
 * OAuth discovery documents.
 *
 * Pure builders so the fields that fail silently in production can be asserted
 * in a unit test. Two of them matter more than the rest:
 *
 *   client_id_metadata_document_supported: true
 *   token_endpoint_auth_methods_supported: [... 'none' ...]
 *
 * Claude selects CIMD only when BOTH are present, and falls back to DCR when
 * either is missing — with no error, no warning, and a new client registration
 * on every fresh connection.
 */

import { SUPPORTED_CHALLENGE_METHODS } from './pkce';
import { SUPPORTED_SCOPES } from './scopes';

export function connectorBaseUrl(): string {
  const raw = process.env.NEXTAUTH_URL;
  if (!raw) throw new Error('NEXTAUTH_URL is required to build OAuth metadata');
  return raw.replace(/\/+$/, '');
}

export function buildAuthorizationServerMetadata(issuer: string): Record<string, unknown> {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    scopes_supported: [...SUPPORTED_SCOPES],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: [...SUPPORTED_CHALLENGE_METHODS],
    // Both of the following are required for CIMD selection. Do not remove
    // either without reading tests/oauth/metadata.test.ts first.
    client_id_metadata_document_supported: true,
    token_endpoint_auth_methods_supported: ['none'],
  };
}

export function buildProtectedResourceMetadata(
  resource: string,
  issuer: string
): Record<string, unknown> {
  return {
    // Must equal the MCP server URL exactly as the user types it into Claude,
    // including any path component.
    resource,
    // Only the first entry is ever used; there is no fallback to later ones.
    authorization_servers: [issuer],
    scopes_supported: [...SUPPORTED_SCOPES],
    bearer_methods_supported: ['header'],
  };
}

export function buildClientIdMetadataDocument(clientIdUrl: string): Record<string, unknown> {
  return {
    client_id: clientIdUrl,
    client_name: 'Plugged.in',
    application_type: 'web',
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    redirect_uris: [`${connectorBaseUrl()}/api/oauth/callback`],
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test tests/oauth/metadata.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Add the three routes**

All three are static JSON with permissive CORS — discovery is unauthenticated by design.

```ts
// app/.well-known/oauth-authorization-server/route.ts
import { NextResponse } from 'next/server';

import { buildAuthorizationServerMetadata, connectorBaseUrl } from '@/lib/oauth/metadata';

// Discovery must be reachable from Anthropic's egress range 160.79.104.0/21.
// A WAF in front of this route breaks the flow even when /api/mcp is reachable.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(buildAuthorizationServerMetadata(connectorBaseUrl()), {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
```

```ts
// app/.well-known/oauth-protected-resource/route.ts
import { NextResponse } from 'next/server';

import { buildProtectedResourceMetadata, connectorBaseUrl } from '@/lib/oauth/metadata';

export const dynamic = 'force-dynamic';

export async function GET() {
  const issuer = connectorBaseUrl();
  return NextResponse.json(buildProtectedResourceMetadata(`${issuer}/api/mcp`, issuer), {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
```

```ts
// app/.well-known/mcp-client/route.ts
import { NextResponse } from 'next/server';

import { buildClientIdMetadataDocument, connectorBaseUrl } from '@/lib/oauth/metadata';

// Our own CIMD: pluggedin-app is an OAuth CLIENT when it connects to downstream
// MCP servers, and 2026-07-28 deprecates DCR in favour of this document.
export const dynamic = 'force-dynamic';

export async function GET() {
  const url = `${connectorBaseUrl()}/.well-known/mcp-client`;
  return NextResponse.json(buildClientIdMetadataDocument(url), {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
```

- [ ] **Step 6: Verify the routes serve correctly**

```bash
pnpm build
```

Then in one terminal `pnpm start`, and in another:

```bash
curl -s localhost:12005/.well-known/oauth-authorization-server | \
  python3 -c "import json,sys; d=json.load(sys.stdin); \
    assert d['client_id_metadata_document_supported'] is True, 'CIMD flag missing'; \
    assert 'none' in d['token_endpoint_auth_methods_supported'], 'none missing'; \
    assert d['code_challenge_methods_supported']==['S256']; \
    print('AS metadata OK')"

curl -s localhost:12005/.well-known/oauth-protected-resource | \
  python3 -c "import json,sys; d=json.load(sys.stdin); \
    assert len(d['authorization_servers'])==1; \
    print('resource =', d['resource'])"
```

Expected: `AS metadata OK` and a `resource` ending in `/api/mcp`. **The printed `resource` is the string that must later be typed into Claude verbatim** — note it down.

- [ ] **Step 7: Commit**

```bash
pnpm test tests/oauth/ && pnpm lint
git add lib/oauth/metadata.ts app/.well-known tests/oauth/metadata.test.ts
git commit -m "feat(oauth): serve authorization-server, protected-resource and CIMD metadata

The two fields that decide CIMD versus DCR are asserted in a unit test on
purpose: Claude selects CIMD only when client_id_metadata_document_supported is
true AND token_endpoint_auth_methods_supported contains 'none', and falls back
to DCR silently when either is missing — registering a new client on every fresh
connection.

protected-resource lists exactly one authorization server because only the first
entry is ever used, and its resource field must match the URL the user types
into Claude byte for byte."
```

---

Phase A continues in the next section of this plan (Tasks A7–A10: client registration, authorization endpoint and consent screen, token endpoint with rotation and reuse detection, bearer authentication). Phases B–D follow.
