# Docker + Traefik + SOPS migration: executed, live, hardened

Moves `plugged.in` off the native nginx + systemd + external-Postgres stack
onto the containerised one. **This is already running in production** — the
cutover completed 2026-07-31 21:47Z. The branch is the record of what was
done, plus the defects found doing it.

## What changed operationally

| Before | After |
|---|---|
| nginx + certbot | Traefik v3.7, ACME HTTP-01 |
| `pluggedin.service` (systemd) | `pluggedin-app` container |
| External PG `185.96.168.246` | Containerised `postgres:16` + pgvector |
| Native redis-server | Containerised `redis:7` |
| 7 host crontab entries | Ofelia |
| Workspace `.env` (two drifting copies) | SOPS + age, decrypted to tmpfs |

Downtime: **~3 minutes.** Verified after cutover from outside the host: 200
in 0.45s, fresh Let's Encrypt certificate, `http→https` 301, all seven
security headers byte-identical to the nginx originals, gzip 71,201 →
22,309 bytes, `/api/health` healthy, 5,305 encrypted values migrated onto
the rotated key with 0 failures, zvec mounted with the real data, Ofelia
running all 7 jobs.

## Secret rotation

Every secret the app generates itself was rotated before the encrypted blob
was committed to this public repo: `NEXTAUTH_SECRET`/`AUTH_SECRET`,
`CRON_SECRET`, `ADMIN_MIGRATION_SECRET`, `UNSUBSCRIBE_TOKEN_SECRET`,
`REGISTRY_INTERNAL_API_KEY`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
`API_KEY_ENCRYPTION_SECRET` was dropped — referenced nowhere in the repo.

`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is not a Next.js internal despite the
name: `lib/encryption.ts` derives the AES-256-GCM key for MCP server configs
and OAuth tokens from it. Rotating it blind would have made 5,305 live
values across four tables permanently undecryptable.
`infra/scripts/reencrypt-data-key.mjs` migrates them, with
`--dry-run`/`--apply`/`--verify` and one transaction per column.

**Third-party credentials are NOT rotated** (ops decision, deferred):
provider API keys, OAuth client secrets, GitHub tokens, SMTP, k8s. They
retain their live values in the committed blob. Git history is append-only,
so once merged that ciphertext is public permanently — the age private key
is the only thing protecting it. See the migration doc.

## Defects this work uncovered

Every one of these was latent in the Phase-1 scaffolding and would have
failed, or silently degraded, a real deploy.

- **Traefik ≤ v3.5 cannot talk to Docker Engine 29.** It pins its Docker
  client to API 1.24; the engine dropped everything below 1.40. No
  label-based router is ever discovered — which is every route here — while
  Traefik's own healthcheck stays green. Site-wide 404 behind a healthy
  container. Pinned to v3.7.
- **`verify.sh` asserted `"status":"ok"`** from `/api/health`, which is typed
  `'healthy' | 'unhealthy'` and has never emitted `ok`. The smoke test could
  only ever fail, and both `deploy.sh` and the cutover gate on it.
- **Compose interpolates `env_file`,** truncating any secret at its first
  `$`. A bcrypt hash arrives as `ops:$2b$10`. Warns, exits 0, fails at
  runtime.
- **`.sops.yaml` `path_regex` never matched** `secrets.env.sops`.
- **`deploy.sh` decrypted without `--input-type`;** sops can't infer format
  from `.sops`, defaults to JSON, dies on the dotenv comments.
- **Postgres never set `shared_preload_libraries`,** so `init.sql`'s
  `CREATE EXTENSION pg_stat_statements` left a view that errors on read.
- **Image ran as uid 1001** while every bind-mounted host dir is uid 1000 —
  the README prescribed `chown -R 1001` over 88 GiB of `/var/mcp-packages`,
  which would also have broken rollback (the native service runs as 1000).
- **No `compress` middleware,** where nginx gzips.
- **Cutover restored pre-rotation-encrypted data** then started the app on
  the rotated key, never dropped the host crontab holding the old
  `CRON_SECRET`, and hardcoded ports 8080/8443 so it could not have bound
  :80/:443.
- **`pnpm`/`tsx` were dangling symlinks** — the Dockerfile copied
  `/root/.local/share/pnpm`, which only holds pnpm's `store/`. This one
  aborted the first cutover attempt mid-window.

## Security hardening (post-cutover audit of the running system)

- **Docker socket.** Traefik mounted `/var/run/docker.sock:ro`, where `:ro`
  makes only the socket *file* read-only, not the API. Measured live: 108
  env vars readable off `pluggedin-app`, 28 secret-bearing, and
  `POST /containers/create` reachable — one bind-mount of `/` from host
  root. Replaced with `docker-socket-proxy` on an `internal: true` network,
  `POST=0`. Verified: read endpoints 200, create/exec/images/secrets 403.
- **MCP sandboxing was off.** `bwrap` failed `pivot_root: Operation not
  permitted` with `MCP_ISOLATION_FALLBACK=none`, so every STDIO MCP server
  ran unsandboxed where the native stack used firejail. Fixed with
  `seccomp:unconfined` + `systempaths=unconfined`; verified `SANDBOX_OK`,
  `pid=2`.
- **Dashboard had no rate limiting** — the only router without it, while
  `/api/rawdata` dumps the routing config behind one bcrypt password.
- **Rate limiter was bypassable** via `ipStrategy.depth: 1` reading
  attacker-supplied `X-Forwarded-For` at the edge.

## Known residual, not fixed here

Traefik's docker provider needs `GET /containers/{id}/json` for routing
labels, and that response carries `Config.Env` — so the 28 secret-bearing
variables remain readable through the proxy. Host-root escalation is closed;
secret disclosure on a Traefik compromise is not. The fix is to stop putting
secrets in container environment at all (a `*_FILE` indirection loaded at
boot). That is an application change to the production boot path and belongs
in its own PR with its own testing window, not tacked onto this one.

## Review notes

- `infra/sops/secrets.env.sops` is age-encrypted; the recipients in
  `.sops.yaml` are public keys and safe to read.
- `infra/sudoers/pluggedin-cutover` is a template, not installed by this PR.
  It should be removed from the host now the cutover is done.
- The rollback path (`systemctl start nginx pluggedin`) is still intact and
  was exercised for real during the first attempt — ~44s, no data loss.
