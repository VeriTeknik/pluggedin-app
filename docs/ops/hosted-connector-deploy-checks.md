# Hosted MCP connector — what to check after deploying

Covers PR #175 (the connector's OAuth authorization server) and PR #176 (PKCE
state extraction). Written to be worked through top to bottom on the box.

Set this once and the commands below can be pasted as-is:

```bash
BASE=https://plugged.in     # must equal NEXTAUTH_URL exactly, no trailing slash
```

---

## 0. Before anything else: the migrations

Three migrations ship here. **0099 and 0100 both matter and neither is
cosmetic.**

| Migration | What it does | If it does not run |
|---|---|---|
| `0098_curly_colonel_america` | Creates the four OAuth tables | Nothing works |
| `0099_wise_marrow` | `oauth_access_tokens.family_id`, NOT NULL, no default | Every token issue fails at the first insert |
| `0100_known_prowler` | Makes `(issuer, client_id)` a **unique** index | Duplicate client rows become possible, and a duplicate can revoke a legitimate client's whole token family |

```bash
pnpm db:migrate
```

Then confirm, rather than assuming the command's exit code told the truth:

```sql
-- family_id must exist and be NOT NULL
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'oauth_access_tokens' AND column_name = 'family_id';
--  expect: family_id | uuid | NO

-- the natural key must be UNIQUE, not merely indexed
SELECT i.indisunique
FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
WHERE c.relname = 'oauth_clients_issuer_client_id_idx';
--  expect: t
```

If `indisunique` comes back `f`, stop and run 0100 before letting traffic in.

**Ordering note.** `family_id` is NOT NULL with no default, so 0099 must land
before the app writes its first token. Migrate before the new release starts
serving, not alongside it.

---

## 1. The two discovery fields that fail silently

Claude picks CIMD over Dynamic Client Registration only when **both** of these
are true. Get one wrong and there is no error anywhere — clients simply fall
back to DCR, and you find out weeks later from a table full of registrations.

```bash
curl -s "$BASE/.well-known/oauth-authorization-server" | jq '{
  issuer,
  client_id_metadata_document_supported,
  token_endpoint_auth_methods_supported,
  code_challenge_methods_supported
}'
```

Required:

- `client_id_metadata_document_supported: true`
- `"none"` present in `token_endpoint_auth_methods_supported`
- `code_challenge_methods_supported: ["S256"]`
- `issuer` **byte-for-byte** equal to `$BASE` — no trailing slash, correct scheme

Then the protected-resource document:

```bash
curl -s "$BASE/.well-known/oauth-protected-resource" | jq '{resource, authorization_servers}'
```

- `resource` must equal the URL the user types into Claude, byte for byte
- only the **first** entry of `authorization_servers` is read — put the real one first

---

## 2. The 401 challenge

The `WWW-Authenticate` header is ignored on a 200. It must arrive on a 401 or
Claude never starts the OAuth flow.

```bash
curl -si "$BASE/api/mcp" | head -20
```

Expect `HTTP/1.1 401` and a header of the shape:

```
WWW-Authenticate: Bearer resource_metadata="https://plugged.in/.well-known/oauth-protected-resource"
```

Also check it with a bad token, which is the case that actually happens in
production:

```bash
curl -si -H 'Authorization: Bearer not-a-real-token' "$BASE/api/mcp" | head -5
```

---

## 3. Walk the flow by hand, once

Worth doing once per environment. It exercises the paths that carried the real
bugs.

```
1. In Claude: Settings → Connectors → Add custom connector → paste $BASE
2. You should be sent to /oauth/authorize and, if signed out, to /login first
3. The consent screen must show:
   - the client's name, and beneath it "Verified as belonging to claude.ai"
   - the redirect host
   - your Hubs, with a single Hub pre-selected
   - the scopes being requested
4. Approve. Claude should connect without an error.
```

**Check the consent screen carefully.** It is the one place a user decides
whether to trust a client, and it is the screen most recently changed.

- Name shown, origin stated beneath it → correct
- Name shown with **no** origin line → the client registered via DCR; there
  should be an amber warning that the name is unverified
- A raw `https://…/.well-known/oauth-client` URL as the title → `client_name`
  is not reaching the page

### Deny, too

Click Cancel on a second attempt. You should land back at Claude with
`error=access_denied`, not on an error page.

---

## 4. Things that must fail

These are the controls that carried findings during review. Each should be
refused.

**An authorization code is single-use.** Redeem the same code twice; the second
attempt must return `invalid_grant`.

```bash
curl -s -X POST "$BASE/api/oauth/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=authorization_code&code=<used-code>&client_id=<client>&redirect_uri=<uri>&code_verifier=<verifier>' | jq
```

**A replayed refresh token kills the family.** Refresh once, then present the
*old* refresh token again. Expect `invalid_grant`, and then confirm the whole
family is dead — the access token issued alongside it must stop working too, not
just the refresh chain:

```sql
SELECT
  (SELECT count(*) FROM oauth_refresh_tokens WHERE family_id = '<family>' AND revoked_at IS NULL) AS live_refresh,
  (SELECT count(*) FROM oauth_access_tokens  WHERE family_id = '<family>' AND revoked_at IS NULL) AS live_access;
--  expect: 0 | 0
```

`live_access` above zero means revocation is only reaching one table.

**A refresh token presented with the wrong `client_id` also kills the family.**
This is deliberate: a token offered by a client it was not issued to is evidence
it has leaked. Expect `invalid_grant` and a revoked family, with
`revocation_reason = 'refresh_token_wrong_client'`.

**The error text must not distinguish a real token from an invented one.** Send
a made-up refresh token and a real one belonging to another client. Both must
return the identical message. Different wording is an oracle for sorting stolen
tokens.

**The token endpoint takes form encoding, not JSON.** A JSON body returns 415,
which reads like an outage rather than a content-type mistake:

```bash
curl -si -X POST "$BASE/api/oauth/token" -H 'Content-Type: application/json' -d '{}' | head -3
```

---

## 5. Egress and latency

- Allow outbound HTTPS to **`160.79.104.0/21`** (Anthropic). The server fetches
  the client's CIMD document during authorization; blocked egress makes every
  first-time connection fail with an unhelpful "Unknown client".
- Anthropic's budgets: **10 s** for discovery and a token request, **30 s** for
  a refresh. Nothing slow may sit in front of these routes — no cold starts, no
  synchronous cache warm-up.

Quick check from the box itself:

```bash
time curl -s -o /dev/null -w '%{http_code}\n' https://claude.ai/.well-known/oauth-client
```

---

## 6. What to watch in the days after

| Signal | Means |
|---|---|
| `refresh_token_reuse_detected` in `oauth_refresh_tokens.revocation_reason` | Either a genuine replay, or a client refreshing concurrently. A steady trickle from one client is the second. |
| `refresh_token_wrong_client` | A token reached a client it was not issued to. Investigate; this should be rare enough to be interesting. |
| Rows in `oauth_clients` with `registration_type = 'dcr'` for Claude | CIMD is not being selected — re-read section 1. |
| Duplicate `(issuer, client_id)` pairs | Impossible after 0100. If you see any, 0100 did not run. |
| `pkceValidationsTotal`, `codeInjectionAttemptsTotal`, `integrityViolationsTotal` | From #176. A non-zero injection or integrity count deserves a look at the source IP. |

Token lifetimes, for reading the tables: authorization code **60 s**, access
token **1 hour**, refresh token **30 days**.

---

## 7. Rolling back

The application code is safe to roll back on its own — nothing in the previous
release reads the new tables.

**Do not roll the migrations back.** Dropping `family_id` or the unique index
while tokens exist loses the revocation lineage, and 0100 in particular is the
only thing preventing duplicate client rows. Leaving all three applied under an
older release is harmless: the old code does not touch these tables.

If you must stop connector traffic without a deploy, the fastest lever is to
make discovery unavailable — the flow cannot start without it.

---

## 8. Known gaps, so they are not mistaken for faults

- **Phase B has not shipped.** Users can complete authorization, but there is no
  tool surface behind it yet. A connection that authorizes and then exposes no
  tools is the expected state, not a bug.
- **204 test failures exist on `main`** and are unrelated to this work — they
  predate both branches and are untouched by them. Compare against `main` before
  attributing a failure to the connector.
