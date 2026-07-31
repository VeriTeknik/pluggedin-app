# Hosted MCP Connector — Design

**Date:** 2026-07-31
**Status:** Approved — ready for implementation planning
**Repository:** `pluggedin-app`
**Sub-project:** 1 of 4 in the Plugged.in v2 direction (see [Scope](#scope-and-non-goals))

---

## Goal

Let a user add Plugged.in to Claude by pasting a URL into **Add custom connector**, authorising once, and getting their Hub's library, memory, clipboard and tasks as MCP tools — with no local process, no API key, and no terminal.

**This works without a directory listing.** Any user can add a custom connector by URL today; the directory adds discoverability, not function. So the shipping criterion is the sentence above, and directory acceptance is a later milestone.

**Directory rules are still treated as hard design constraints.** Listing requires a Team or Enterprise organisation, which we do not have yet and are evaluating separately. Building to the review criteria now costs almost nothing; retrofitting them later means re-architecting the tool surface and the auth model. The rules are followed; only the submission is deferred.

### Build-time versus submission-time

| Requirement | When | Why |
|---|---|---|
| OAuth 2.1 AS with CIMD, PKCE, rotation | **Build** | The auth model cannot be retrofitted |
| `title` + annotations on every tool | **Build** | Cheap now, 26 edits later either way |
| Separate read/write tools, no catch-all | **Build** | Shapes the tool surface |
| First-party APIs only | **Build** | Determines the whole architecture |
| Narrow descriptions, no prompt-injection patterns | **Build** | Also just better tool design |
| Actionable errors, no generic failures | **Build** | Also just better engineering |
| Privacy policy | **Build** | Custom-connector users deserve it regardless of listing |
| Team/Enterprise organisation | Submission | Commercial decision, tracked separately |
| Listing copy, slug, icon, categories | Submission | Portal-only, no engineering |
| Test account, fully populated | Submission | Needs a stable deployment first |
| Public documentation URL | Submission | Blog post or help-centre article |
| Seven policy acknowledgments | Submission | Includes the conversation-data item the pre-clearance email covers |

The practical effect on sequencing: **nothing in the build is blocked by the missing organisation.** The connector ships, users add it by URL, and the listing follows when the commercial side is settled.

---

## Why this shape — the finding that determined it

The obvious design was "expose the MCP hub over HTTP with OAuth": one endpoint that aggregates the user's 1500+ downstream MCP servers. **That design cannot be listed.** Three directory rules block it:

1. *"Every tool must include a `title` and the applicable `readOnlyHint` or `destructiveHint`."* The hub cannot control annotations on tools it proxies from arbitrary third-party servers.
2. *"Your server must call your own first-party APIs, or APIs you legitimately proxy. The MCP server domain should match your service."* A universal aggregator proxies third parties by definition.
3. *"A single tool that accepts both safe HTTP methods and unsafe methods is rejected. Do not ship a catch-all `api_request` tool with a `method` parameter."* A generic downstream executor is that pattern.

A fourth problem is structural rather than a rule: the submission portal **syncs your tools from the connected server**, but an aggregator's tool list differs per user, so the listing would show whatever the reviewer's test account happened to have.

So the connector exposes **Plugged.in's own capabilities only**. Aggregation stays in the local proxy (`pluggedin-mcp`) and is deprecated separately — first by building its replacement in the UI, then by removing it from MCP.

This is not a consolation prize. Anthropic now ships its own connector directory, its own MCP tunnels and its own enterprise auth, so the aggregator's value is being squeezed from above. Cross-AI data exchange is squeezed from nowhere: it is cross-vendor by definition, and its value grows with the number of *different* AI clients rather than the number of MCP servers.

---

## Primary use case: bridging Claude Desktop and Claude Code

Today these are two disconnected surfaces. You debug something in Claude Code and none of it exists when you open Desktop. The connector is the bridge, and this is the sharpest instantiation of "the data exchange point between AIs" — the value shows up between two clients from the *same* vendor before it ever needs a second vendor.

**Both surfaces can use the same hosted connector.** Anthropic's authentication documentation notes that Claude Code runs its own OAuth flow locally and identifies itself with its own Client ID Metadata Document, using a loopback redirect. So Claude Code does not need the local proxy to reach the first-party surface — it needs it only for aggregation.

```
Claude Code  ──┐                        ┌── memory   (findings, procedures, shocks)
Claude Desktop ├── OAuth ── connector ──┼── library  (documents + RAG, with model attribution)
Claude mobile ─┘                        ├── clipboard (live hand-off)
                                        └── tasks
```

Four concrete hand-offs, each already backed by an existing capability:

| Hand-off | Mechanism |
|---|---|
| "What did I work out about X yesterday?" | `record_finding` in Code → `memory_search` in Desktop |
| Passing a plan, diff or output between surfaces | `clipboard_push` → `clipboard_pop`; this is what the clipboard was built for |
| A durable artifact both can read | Library document, with `document_model_attributions` recording who wrote what |
| Resuming an interrupted task | `memory-capture-plan-step` in Code → memory resume in Desktop |

**`_meta.clientInfo` is what makes this legible.** Under 2026-07-28 every request carries client identity, so each finding records *which* client produced it. The user sees "Claude Code found this on Tuesday" rather than an anonymous pile. That provenance is the actual product — storage alone is a Drive connector.

This also settles a question raised elsewhere in this design: the clipboard tools are not filler. They are the live hand-off channel, and this use case is why they stay in the curated surface.

**It strengthens the deprecation story too.** Once Claude Code can reach the first-party surface over the connector, the local proxy is needed only for aggregation — which is exactly the capability sub-project 4 retires.

---

## Scope and non-goals

**In scope (this spec):** OAuth 2.1 authorization server, stateless MCP endpoint, Hub selection, curated tool surface, the `record_finding` outcome model, directory-submission readiness.

**Out of scope, tracked as separate sub-projects:**

| # | Sub-project | Depends on |
|---|---|---|
| 2 | Task Manager UI (data model already exists — see below) | 1 |
| 3 | Agent Space invocability — micro-agents as MCP tools | 1 |
| 4 | v2 packaging, aggregator deprecation and migration narrative | 1, 2, 3 |

**Explicit non-goals here:** no MCP proxying or aggregation; no changes to `pluggedin-mcp` beyond extracting the shared protocol package; no rewrite of the existing platform.

**On the "retire the old repo" idea:** rejected, and the strongest argument is inside the requirement itself. "Seamless migration on the same SSO keys" means the same `users`/`accounts`/`sessions` rows, the same API keys, the same OAuth account links. That is free if the database and repo stay, and it is the riskiest part of the project if they do not. With 79 tables, a 3671-line schema, a working PAP agent lifecycle, six languages and real users, a rewrite is the second-system trap. **v2 is a product and positioning release, not a codebase rewrite.**

---

## What already exists

Verified against the working tree on 2026-07-31. "Partially exists" turned out to be an understatement.

| v2 capability | Current state |
|---|---|
| Agent Space | `agentsTable`, `agentTemplatesTable`, `agentModelsTable`, `agentHeartbeats/Metrics/LifecycleEvents`, `clustersTable` |
| Library + AI document archive | `docsTable`, `documentChunksTable`, `documentVersionsTable`, `documentModelAttributionsTable` |
| Semantic memory | `freshMemoryTable`, `memoryRingTable`, `memorySessionsTable` |
| Clipboard | `clipboardsTable` |
| Projects (Hubs) | `projectsTable`, `profilesTable` |
| RAG | `@zvec/zvec@^0.2.1` (**z**vec, not xvec) |
| API access | `apiKeysTable` + 45 API routes |
| SDKs | `pluggedin-js-sdk`, `-python-sdk`, `-go-sdk` |
| Browser-based auth instead of a pasted key | `device_auth_codes` + `app/cli/authorize` — already working |
| **Task Manager** | **`notificationsTable.completed`** — literally commented *"For todo-style checkmarks on custom notifications"* |

Nothing is missing. The gap is not capability, it is **reach**: none of it is available to a user who cannot run a local process.

**Memory lineage.** The ring names in `pluggedin-app` (`fresh`, ring types) are the same lineage as CogMem-AI in `veriteknik-web`, which is the deeper system (108 BIOS rules, KE-IE forward/backward chaining, Focus/Attention agents, differential privacy) and is TÜBİTAK 1501 funded. This design treats CogMem as the canonical source for taxonomy (see [Ring taxonomy](#ring-taxonomy-alignment)).

---

## Architecture

The connector lives in **`pluggedin-app`**, as Next.js routes.

The decisive reason is that MCP 2026-07-28 made the protocol **stateless request/response** — SEP-2567 removed protocol sessions and the `Mcp-Session-Id` header. There is no long-lived stream to hold and no sticky routing to arrange, so an MCP endpoint is now exactly the shape of a route handler. The historical objection to hosting MCP inside Next.js no longer applies.

Everything else points the same way: the authorization server must own `users`/`accounts`/`sessions`/`api_keys`, which live here; the tools wrap `app/api/*` logic in the same process; per-request identity is native to a web request.

```
pluggedin-app
├── app/.well-known/
│   ├── oauth-authorization-server/route.ts   RFC 8414 AS metadata
│   ├── oauth-protected-resource/route.ts     RFC 9728 RS metadata
│   └── mcp-client/route.ts                   our own CIMD document (we are a client elsewhere)
│
├── app/oauth/authorize/                      consent screen: Hub set + scopes
│
├── app/api/oauth/
│   ├── token/route.ts                        code→token, refresh (form-urlencoded)
│   ├── register/route.ts                     DCR fallback (JSON)
│   └── revoke/route.ts                       RFC 7009
│
└── app/api/mcp/route.ts                      rewritten: session-auth → OAuth Bearer,
                                              stateful → stateless
```

### Request flow

```
Claude                         pluggedin-app                       Postgres
  │                                 │                                 │
  │ POST /api/mcp                   │                                 │
  │ Authorization: Bearer <opaque>  │                                 │
  │ {"method":"tools/call",         │                                 │
  │  "params":{...,"_meta":{        │                                 │
  │    protocolVersion:"2026-07-28",│                                 │
  │    clientInfo:{...}}}}          │                                 │
  ├────────────────────────────────▶│                                 │
  │                                 │ 1. sha256(token) → {user, hubs, scopes}
  │                                 ├────────────────────────────────▶│
  │                                 │ 2. detectRevision()   ┐          │
  │                                 │ 3. validateMcpHeaders()├ shared pkg
  │                                 │ 4. scope check        ┘          │
  │                                 │ 5. dispatch → tool handler       │
  │                                 │ 6. resultType:"complete"         │
  │                                 │    + _meta.serverInfo            │
  │◀────────────────────────────────┤                                 │
```

No held stream, no session, no sticky routing. Horizontal scaling is free.

### Shared protocol package

`@pluggedin/mcp-protocol` — the nine modules currently in `pluggedin-mcp/src/protocol/` (`versions`, `meta`, `errors`, `detect`, `discover`, `cache`, `headers`, `mrtr`, `handles`), extracted. Pure TypeScript, no runtime dependencies beyond each other, 245 tests already passing.

The connector speaks only 2026-07-28, so it does not use the bridging modules (`lower`, `registry`) — those stay relevant to the local proxy during its deprecation window. The package's long-term justification is the transition period plus potential SDK adoption, not "two repos share code", since `pluggedin-mcp` is scheduled for retirement.

---

## OAuth 2.1 authorization server

Every requirement below is quoted from Anthropic's connector authentication documentation and is a hard constraint, not a preference.

### Discovery

**`/.well-known/oauth-protected-resource`**
- `resource` must equal the MCP server URL **exactly as the user types it into Claude**, including any path component: `https://plugged.in/api/mcp`.
- `authorization_servers` — Claude uses **only the first entry** and does not fall back to later ones.

**`/.well-known/oauth-authorization-server`** — two fields decide whether we get CIMD or DCR:

```json
{
  "client_id_metadata_document_supported": true,
  "token_endpoint_auth_methods_supported": ["none"],
  "code_challenge_methods_supported": ["S256"],
  "scopes_supported": ["…", "offline_access"]
}
```

> *"Claude selects CIMD only when your authorization server metadata advertises **both** `client_id_metadata_document_supported: true` **and** `none` in `token_endpoint_auth_methods_supported`… If either is missing, Claude falls back to DCR."*

We want CIMD: *"For servers expecting high traffic from the directory, prefer CIMD or `oauth_anthropic_creds` over DCR. DCR causes Claude to register a new client on every fresh connection."*

Both fields are load-bearing and can be broken silently — a missing `"none"` degrades us to DCR with no error anywhere. **They are covered by contract tests** (see [Testing](#testing)).

### Client registration

**CIMD (primary).** `client_id` is an https URL; we fetch, validate and cache the document, keyed by issuer.

**DCR (fallback, retained).** Other MCP clients may only support DCR, and 2026-07-28 keeps it for backwards compatibility while deprecating it. Rate-limited, with a TTL on registered clients so the table does not grow without bound.

**Redirect URIs.**
- Hosted Claude surfaces: `https://claude.ai/api/mcp/auth_callback`
- Claude Code: loopback on an ephemeral port. Its CIMD declares `http://localhost/callback` and `http://127.0.0.1/callback`, and **both must match with the port component ignored** (RFC 8252 §7.3).

### Token model

**Opaque tokens with a database lookup**, not JWTs. Revocation is a real requirement and a single indexed lookup is cheap. This also matches the existing `apiKeysTable` pattern.

**Tokens are stored as SHA-256 hashes, never in plaintext.** (`apiKeysTable.api_key` stores plaintext today — see [Follow-ups](#follow-ups-not-in-this-sub-project).)

Four new tables, created with `pnpm db:generate` then `pnpm db:migrate` — never direct SQL:

| Table | Contents |
|---|---|
| `oauth_clients` | CIMD-resolved and DCR-registered clients, keyed by issuer |
| `oauth_authorization_codes` | 60 s TTL, single use, PKCE `code_challenge`, `redirect_uri`, scopes, granted `project_uuid` set |
| `oauth_access_tokens` | `token_hash`, scopes, granted hub set, `expires_at`, `revoked_at` |
| `oauth_refresh_tokens` | `token_hash`, `family_id`, `parent_id`, `rotated_at`, `revoked_at`, `revocation_reason` |

**Lifetimes**

| Credential | Lifetime | Rationale |
|---|---|---|
| Authorization code | 60 s | Single use, PKCE-bound |
| Access token | 1 hour | Claude refreshes reactively on 401 and proactively up to 5 minutes before expiry; an hour leaves comfortable margin |
| Refresh token | 30 days, sliding | Rotated on every use |

### Refresh token rotation and reuse detection

Rotation is mandatory: *"Rotate refresh tokens for public-client connections. DCR and CIMD register Claude as a public client, and the MCP authorization spec adopts OAuth 2.1's requirement to rotate or sender-constrain refresh tokens for public clients."*

**Rotation alone is close to cosmetic.** What makes it worth having is reuse detection:

- Each use mints a new token and marks the old one `rotated_at`.
- The new token is returned **in the same response that invalidates the old one**.
- If an already-rotated token is presented again, a copy exists somewhere and we cannot tell whether the presenter is the attacker or the legitimate client. **Revoke the entire `family_id`**, write an audit record, notify the user.

Without this, a stolen refresh token is usable indefinitely; rotation only makes theft *detectable*.

Refresh failures return RFC 6749 codes — `invalid_grant`, never a custom code, or Claude's refresh handling breaks.

### Scopes

Chosen to mirror the read/write split the directory requires in tool annotations, so the consent screen and the tool list tell the same story:

```
library:read     library:write
memory:read      memory:write
clipboard:read   clipboard:write
tasks:read       tasks:write
hubs:read
offline_access
```

Claude appends `offline_access` when it appears in `scopes_supported`, to obtain a refresh token. To control which scopes Claude requests, include a `scope` parameter in the `WWW-Authenticate` header on the 401.

### Consent screen

`/oauth/authorize` — the user signs in, then chooses **which Hubs** this connection may reach (least privilege) and sees the scopes in plain language. `memory:write` gets an explicit sentence: *"Plugged.in will record observations derived from your conversations into your memory."*

The spec requires the redirect URI's hostname to be shown clearly, with an additional warning when the only registered redirect URIs are loopback addresses (a CIMD cannot prevent loopback impersonation — any local process can bind a port).

### Operational constraints

- **Latency budget:** 10 s for discovery, registration and token endpoints; 30 s for refresh. Exceeding it fails the flow even if the request eventually completes. The token endpoint gets its own rate-limit bucket so throttling cannot eat the budget.
- **Egress:** Anthropic calls from `160.79.104.0/21`. A WAF in front of the authorization server breaks the flow even when the MCP endpoint is reachable.
- **Body parsers differ:** the token endpoint must accept `application/x-www-form-urlencoded` (RFC 6749 §4.1.3); DCR uses `application/json` (RFC 7591 §3.1). Next.js route handlers assume JSON, which produces a 415 on the token endpoint. Two parsers, tested separately.

---

## MCP endpoint

`app/api/mcp/route.ts` is rewritten. Today it authenticates with a NextAuth session and manages `Mcp-Session-Id`; both go away.

**Unauthenticated requests must return `401` with:**

```http
WWW-Authenticate: Bearer resource_metadata="https://plugged.in/.well-known/oauth-protected-resource"
```

> *"The 401 status is required — Claude does not honor a `WWW-Authenticate` header on a 200 response."*

Returning a tool error instead of a 401 is the single most common way this integration silently fails: Claude never learns where the authorization server is.

`server/discover` answers before authentication, because it *is* the negotiation.

---

## Hub selection

`apiKeysTable` is scoped to `project_uuid`, and the project rule is that documents are scoped by `project_uuid` at Hub level. OAuth tokens resolve the same way.

**Claude does not tell us which Project a request came from.** Neither Anthropic's authentication documentation nor the 2026-07-28 reserved `_meta` keys carry a project or workspace identifier; `clientInfo` is `{name, version, title}`. Automatic Hub selection from the Claude Project is therefore **not achievable at the protocol level**. Three mechanisms approximate it honestly:

1. **Single Hub → automatic.** Users with one Hub never choose.
2. **Selection over MCP.** `pluggedin_list_hubs` (read-only) and `pluggedin_open_hub`, which returns a **server-minted handle** that subsequent calls pass as an argument. This is precisely what SEP-2567 prescribes in place of sessions — with no protocol session, "currently selected Hub" cannot live in connection state.
3. **Automation via Claude Project instructions.** The user writes *"in this project use Plugged.in Hub 'Acme'"* in the project's custom instructions and the model calls `pluggedin_open_hub("Acme")` on first use. The automation comes from project instructions, not from the protocol.

A per-token default Hub is kept as a convenience and updated by `pluggedin_open_hub`. This is server state keyed to a credential, not protocol session state, so it does not reintroduce what SEP-2567 removed.

Runtime switching is permitted **within the Hub set granted at consent**, never outside it.

---

## Tool surface

### Annotation audit

Measured on `pluggedin-mcp/src/tools/static-tools.ts`:

| | Count |
|---|---|
| Total tools | 27 |
| **Carrying a `title`** | **1 / 27** |
| `readOnlyHint: true` | 14 |
| `destructiveHint: true` | 3 |
| Write, non-destructive | 10 |
| Missing annotations entirely | 0 |

Annotations are in good shape. **The gap is titles**, and it is a hard blocker: *"If any tools are flagged for missing titles or annotations, fix them on your server before submitting."* Mechanical work, 26 tools.

### Curation

**Removed (2).** `pluggedin_setup` configures the local proxy and is meaningless hosted. `pluggedin_discover_tools` is the aggregation function being retired.

**Added (3).** `pluggedin_list_hubs`, `pluggedin_open_hub`, `pluggedin_record_finding`.

**Deferred (2).** `pluggedin_cbp_query` and `pluggedin_cbp_feedback`. Collective patterns involve profile-UUID hashing and cross-user sharing, which deserve their own privacy narrative rather than complicating a first listing. They return once the team layer below is built.

Resulting surface, **26 tools** (27 − 2 removed + 3 added − 2 deferred):

| Group | Count | Tools |
|---|---|---|
| Hub | 2 | `list_hubs`, `open_hub` |
| Library | 6 | `ask_knowledge_base`, `create_document`, `get_document`, `list_documents`, `search_documents`, `update_document` |
| Clipboard | 6 | `clipboard_set/get/list/delete/push/pop` |
| Tasks | 4 | `send_notification`, `list_notifications`, `mark_notification_done`, `delete_notification` |
| Memory | 7 | `memory_session_start/end`, `memory_observe`, `memory_search`, `memory_details`, `memory_search_with_context`, `memory_individuation` |
| Findings | 1 | `record_finding` |

Twenty-six is more than ideal for a first listing — fewer, sharper tools review better. The count is driven by the decision to ship full memory (7 tools) rather than a read-only subset. If review friction appears, the memory group is where to cut first, and the clipboard's `push`/`pop` pair could fold into `set`/`get` with an index argument.

### Directory rules this surface must satisfy

- Every tool: `title` plus the applicable hint.
- Read and write operations in **separate** tools — no catch-all with a method parameter. The existing surface already complies; the rule is recorded so it is not violated later.
- Names ≤ 64 characters.
- Narrow, accurate descriptions that match actual behaviour.
- No prompt-injection patterns: describe what the tool does, never how Claude should behave.
- Every tool returns a useful response for valid parameters; generic "Internal Server Error" fails review.

---

## Recording outcomes, not transcripts

### The problem

The review rules state: *"Do not collect conversation data beyond what the tool needs for its function"* and *"Tool descriptions are rejected if they… tell Claude to behave in ways unrelated to the tool's function."*

`src/server-instructions.ts:11-12` currently says:

> *"Start every conversation with `pluggedin_memory_session_start`… During the session, use `pluggedin_memory_observe` to record important observations"*

That is a behavioural instruction to record conversations, shipped on the surface a reviewer reads. It is the single most likely cause of rejection.

### The principle

`memory_observe` accepts ten observation types, and they are already two different things:

| Kind | Types | Character |
|---|---|---|
| **Transcript** | `tool_call`, `tool_result`, `workflow_step`, `context_switch` | A record of *what happened* |
| **Outcome** | `decision`, `insight`, `user_preference`, `error_pattern`, `success_pattern`, `failure_pattern` | A record of *what was learned* |

The distinction is not invented for review — it is latent in the existing schema. Outcomes are meaningful without the conversation; transcripts are not. **The connector surface accepts outcomes only.** The four transcript types are exactly what a reviewer would object to and are also the least valuable to a team.

### Why structure is a precondition, not decoration

Free-form conversation text **cannot be reliably anonymised**. A hostname, path, customer name or credential can hide anywhere in a sentence. A typed, slotted record can be, because you know which field carries identifying material.

Structure is therefore the technical precondition for the team layer, and the bridge to the anonymisation work in CogMem (`ke-ie/anonymizer.ts`, `ke-ie/differential-privacy.ts` with k=5 Laplace) and to CBP's profile-UUID hashing.

### `pluggedin_record_finding`

A new tool — not a narrowed `memory_observe` — so the connector and the plugin can converge on one shape while the local proxy's full schema stays untouched during transition.

```
pluggedin_record_finding
  type       : ring taxonomy (see below)
  statement  : one self-contained sentence — the outcome
  rationale  : why — this is what makes it reusable
  scope      : { hub, system?, tags[] }
  evidence?  : document_uuid[]        → links to the Library
  shareable  : candidate for the team layer (default false)
```

`rationale` is **required**. A conclusion without its reason is useless six months later, and requiring it forces the model to distil rather than dump.

The description then reads honestly:

> *"Records a structured, user-confirmed finding into the user's own knowledge base. Does not store conversation transcripts."*

That is a sentence that survives review. The current one is not.

### Division of labour with `pluggedin-plugin`

The plugin already ships five capture skills, each targeting a ring:

| Skill | Target |
|---|---|
| `memory-capture-solution` | long-term — *"what failed, what worked, and why"* |
| `memory-capture-procedure` | procedures — *"numbered implementation algorithm"* |
| `memory-capture-shock` | shocks — *"never decay, always surfaced"* |
| `memory-capture-cross-reference` | dependency trail |
| `memory-capture-plan-step` | fresh — *"task continuity across compaction"* |

**The outcome taxonomy already exists and is in production.** The right division is: the *skill* decides when and how to distil; the *tool* stores the typed result. On the connector there is no plugin, so the same judgement is carried by the tool description and server instructions — but the tool and schema are identical.

```
Claude Code               → pluggedin-plugin (skills) → local MCP ─┐
                                                                   ├→ one memory, one taxonomy
Claude.ai / Desktop / mobile → connector ──────────────────────────┘
```

The only real conflict risk is schema divergence between the two paths. `record_finding` must be identical on both, and the plugin migrates onto it.

### Ring taxonomy alignment

The MCP schema names rings `['procedures', 'practice', 'longterm', 'shocks']`; CogMem names them `procedures, habits, long_term, dos_and_donts, shocks` (plus `fresh` and `gut`). So `practice`↔`habits` and `longterm`↔`long_term` have drifted, and `dos_and_donts` is absent from the MCP side.

**Decision: align on CogMem naming**, which is canonical (TÜBİTAK/academic documentation). `record_finding` is born with the correct names; the MCP schema converts, accepting the old names as aliases for a deprecation window. Fixing this before writing the new tool prevents copying the drift into a third place.

### The team layer

```
personal finding
   │  (1) user marks shareable — explicit consent, default off
   ▼
anonymiser — identifier-bearing slots stripped
   │  hostname, path, user/customer name, credential, UUID → hash
   ▼
k-anonymity gate — a pattern stays invisible until ≥k independent members record an equivalent
   │  (CogMem's k=5; one person's context never reaches the team)
   ▼
team pattern → read via the CBP tools
```

The value to a team is precisely here: *"three people on your team hit this same failure mode"* is worth far more than three transcripts. The k threshold guarantees a single member's private context never crosses over.

---

## Memory on the connector: decision and mitigations

**Decision: full memory, including session lifecycle and automatic observation.** The rejection risk was raised and the trade-off accepted deliberately — memory is the most differentiated asset and a read-only version halves the cross-AI exchange thesis.

Five mitigations make that defensible:

1. **Explicit scope consent.** `memory:write` is its own scope with plain-language consent copy. Consented recording is a contracted feature, not covert collection.
2. **Server instructions rewritten from instruction to capability.** Not *"Start every conversation with…"* but *"When the user has enabled session memory (`memory:write` granted), you may record observations…"* Same behaviour, described as a capability rather than dictated as behaviour.
3. **The tool list does not vary by scope.** The instinct is to hide tools the token cannot use, but that conflicts with 2026-07-28's rule that list endpoints no longer vary per connection, and it would make the reviewer's synced list differ from a user's. The list is constant; an ungranted call returns a clear scope error.
4. **Attribution and control.** Every observation records the writing client from `_meta.clientInfo`. The UI shows *"Claude wrote 40 observations on this date"*, and the user can inspect, export and delete. Retention policy is defined.
5. **A dedicated privacy-policy section** on conversation-derived memory: what is collected, how long it is kept, how to delete it. Required anyway — *"Missing or incomplete privacy policies result in immediate rejection"* — and this is its most important paragraph.

**Recommended before submitting:** email `mcp-review@anthropic.com` describing the memory model and obtain a written answer. This is a genuine grey area; one email is cheaper than a rejection that delays the listing.

---

## Error handling

Three layers, three formats:

| Layer | Format |
|---|---|
| OAuth | RFC 6749 codes — `invalid_grant`, never custom |
| Protocol | 2026-07-28 reserved codes — `-32020` header mismatch, `-32021` missing capability, `-32022` unsupported version |
| Tools | Actionable messages. Generic errors fail review explicitly |

Unauthenticated access is `401` + `WWW-Authenticate: Bearer resource_metadata="…"`, never a tool-level error.

---

## Security

- Tokens hashed at rest (SHA-256), never stored in plaintext.
- PKCE S256 required on every authorization request and advertised in metadata.
- Refresh token rotation with family revocation on reuse.
- Hub set fixed at consent; runtime switching confined to that set; cross-Hub access fails closed.
- Scope enforced per tool call, server-side, from the token record — never from a client-supplied value.
- Rate limiting per the existing tiers, with the token endpoint in its own bucket.
- Consent screen displays the redirect URI hostname and warns on loopback-only registrations.
- Every OAuth lifecycle event written to the existing audit log.

---

## Testing

**Unit.** Every step of the authorization-code flow; PKCE verification including mismatch; **refresh reuse → family revocation**; scope enforcement per tool; attempted access to a Hub outside the granted set.

**Contract.** The three `.well-known` documents against RFC 8414 and RFC 9728 shapes; `resource` byte-equal to the MCP URL; **both CIMD-selection fields present**. These fail silently in production — a missing `"none"` degrades to DCR with no error — so they must be assertions, not assumptions.

**Body parsing.** The token endpoint accepts `application/x-www-form-urlencoded`; the DCR endpoint accepts `application/json`. The Next.js default breaks the first with a 415.

**End to end.** Every tool through the MCP Inspector and as a custom connector in Claude — the directory requires exactly this: *"exercise every tool through the MCP Inspector and as a custom connector in Claude."* Plus one full OAuth round trip against real Claude.

**Cross-surface hand-off.** The bridge use case gets its own scenario, run against real clients rather than mocks, because it is the primary reason the product exists:

1. Claude Code connects over OAuth (loopback redirect, its own CIMD) and calls `record_finding`.
2. Claude Desktop connects over OAuth to the same Hub and `memory_search` returns that finding, attributed to Claude Code via `_meta.clientInfo`.
3. `clipboard_push` in one surface, `clipboard_pop` in the other, same payload.
4. A Library document written from one surface is readable from the other with correct model attribution.

Failure here means the product does not do the thing it is for, however green the unit tests are.

**Baseline note.** `pluggedin-app` currently fails 42 test files / 204 tests on `main` (tracked separately). Judge this work by whether it moves those counts, not by whether the suite is green.

---

## Directory submission — deferred milestone

Not on the critical path (see [Build-time versus submission-time](#build-time-versus-submission-time)), but recorded so the build stays compatible.

**Where to submit.** The portal lives inside Claude.ai admin settings at
`https://claude.ai/admin-settings/directory/submissions/new`, with status and reviewer feedback at
`https://claude.ai/admin-settings/directory/submissions`. It accepts **remote MCP servers only** — local servers go to the separate desktop-extension form. Escalations: `mcp-review@anthropic.com`.

**Access.** A Team or Enterprise organisation is required; admin settings do not exist on individual plans. By default only Owners and Primary owners may submit. On Enterprise an Owner can delegate through a custom role carrying the *Directory management* permission; Team plans have no custom roles, so it stays with Owners.

**The URL trap.** The portal's Connection step asks for the MCP server URL. Whatever is entered there must be byte-identical to the `resource` field in our protected-resource metadata — trailing slash, path and all — or OAuth discovery breaks silently. This is why that equality is a contract test rather than an assumption.

**Readiness**

| Requirement | Status after this work |
|---|---|
| `https://` server URL, streamable HTTP | ✅ |
| OAuth 2.0 for authenticated services | ✅ CIMD primary, DCR fallback |
| `title` + applicable hint on every tool | ✅ 26 titles added during the build |
| Separate read and write tools, no catch-all | ✅ already true |
| First-party APIs only | ✅ by design |
| Every tool exercised by us first | ✅ covered by end-to-end tests |
| Privacy policy, HTTPS, complete | ✅ built — memory section is the critical part |
| Team/Enterprise org with Directory management | ⏸ commercial decision, tracked separately |
| Listing copy, slug (permanent), icon, categories | ⏸ portal-only |
| Test account, fully populated | ⏸ needs a stable deployment |
| Public documentation by publish date | ⏸ blog post or help-centre article |
| Seven policy acknowledgments | ⏸ one covers conversation-data collection — see the pre-clearance email |
| Allowed link URIs | n/a — we do not use `ui/open-link` |
| Carousel screenshots | n/a — not an MCP App |

---

## Follow-ups, not in this sub-project

**`api_keys` hygiene.** `apiKeysTable` has no `expires_at`, no `revoked_at`, no rotation, and stores keys in plaintext. These are permanent bearer credentials, and a database leak is a direct compromise of every user's Hub. Changing their semantics affects every existing user and the local proxy, so it needs its own migration plan rather than being attached to this work. To be filed as an issue recommending `expires_at`, `revoked_at` and hashed storage. The connector's proper token hygiene creates useful pressure toward that migration.

**Ring-name migration.** Converting the MCP schema from `practice`/`longterm` to `habits`/`long_term` with an alias window.

**Aggregator deprecation.** Sub-project 4. Sequence agreed: build the replacement in the UI first, then remove the capability from MCP. Existing local-proxy users lose access to 1500 aggregated tools, which is a deliberate strategic bet and must be communicated, not allowed to happen quietly.

**`mcp-review@anthropic.com` pre-clearance** on the memory model, before submission.
