---
name: pluggedin-stack-ops
description: Use when deploying, restarting, verifying or rolling back the containerised plugged.in production stack, when the site returns 404 or 5xx after a deploy or git operation, or when changing infra/docker-compose.yml, infra/traefik/ or the app image.
---

# Operating the plugged.in production stack

`plugged.in` runs as a Docker Compose stack: Traefik on :80/:443, the Next.js app,
Postgres 16 + pgvector, Redis, Ofelia (cron), and a docker-socket-proxy. The native
nginx + systemd stack it replaced is stopped and disabled but still installed.

Entry point is always `infra/scripts/deploy.sh`. Running compose by hand skips secret
decryption, so the secrets file and the staged Traefik config never appear.

## Quick reference

| Task | Command |
|---|---|
| Deploy | `./infra/scripts/deploy.sh` |
| Smoke test | `./infra/scripts/verify.sh` (add `--quick` to skip the RAG canary) |
| Logs | `docker compose -f infra/docker-compose.yml logs -f --tail=50 pluggedin-app traefik` |
| Which routers exist | Traefik dashboard at `https://traefik.plugged.in/api/http/routers` (basic auth) |

Health must report `"status":"healthy"` **and** `"database":true`. The endpoint never
emits `"ok"` — asserting that is a bug that once made the smoke test unpassable.

## Deploying is not just `git pull`

> **`git pull` alone can 404 the site.**

`infra/traefik/dynamic/` is bind-mounted straight from the git working tree, and
Traefik hot-watches it. Any git operation that rewrites those files — `pull`,
`checkout`, `rebase` — can be observed mid-write. Traefik then loads a file missing a
middleware, every router referencing it errors, and the site returns 404 until the
next reload. Observed for ~40s after a `git checkout` where the before and after
content were **identical**: content equality is not write atomicity.

Until the dynamic config is staged outside the working tree, treat any git operation
against this checkout as a change window: run it, then immediately check

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://plugged.in/
docker logs --since 2m traefik 2>&1 | grep -i 'does not exist'
```

`middleware "X@file" does not exist` is the signature. It self-heals on the next
reload; `touch infra/traefik/dynamic/middlewares.yml` forces one.

## Verifying a change actually reached production

Mounts and environment are fixed at **create** time, and `docker compose up -d` only
recreates a container if its *definition* changed — rewriting a mounted file does not.
Secrets now come from a mounted file loaded at process start, so a changed secret needs
the container restarted, not merely the file rewritten. If a change must take effect, confirm the container was recreated:

```bash
docker inspect pluggedin-app --format '{{.State.StartedAt}}'
```

Check from **outside** the host, not just via `verify.sh`, which only probes
internally. A stack can be internally green and externally 404 — that is exactly what
a broken Traefik provider looks like, because Traefik's own healthcheck stays green
while it serves nothing.

## Rollback

The native units are disabled but present:

```bash
sudo systemctl enable --now nginx pluggedin
docker compose -f infra/docker-compose.yml stop traefik
crontab /home/pluggedin/crontab.pre-ofelia.backup
```

This returns traffic to the **external** Postgres. Writes made against the
containerised database after cutover are not replayed; the dumps in
`/var/backups/pluggedin/` are the reconciliation input, and they are encrypted with
the rotated data key.

## Traps that have already cost an outage

| Trap | Detail |
|---|---|
| Traefik ≤ v3.5 | Pins Docker API 1.24; Engine 29 rejects it. No label router is discovered, site 404s, healthcheck stays green. v3.7 is a floor, not a preference. |
| `systempaths` in compose | Takes `=`, not `:`. The colon form fails the *recreate*, not the config parse — the old container keeps serving and the error is easy to miss. |
| MCP sandboxing | Needs `CAP_SYS_ADMIN` + `apparmor:unconfined` + `seccomp:unconfined` + `systempaths=unconfined`. Any missing one silently falls back to no isolation, because `MCP_ISOLATION_FALLBACK=none`. Verify with `bwrap ... /usr/bin/env sh -c 'echo OK; echo $$'` inside the container — `pid=2` proves the namespace. |
| Image disk growth | CI builds a ~4 GB image per push on this same host with no retention. Reclaim with `docker image prune -af --filter until=90m`. |
| Restoring a DB dump | Dumps from the external PG are encrypted with the **pre-rotation** data key. Run `infra/scripts/reencrypt-data-key.mjs --apply` then `--verify`, or the app cannot read 5,305 values. |

## Common mistakes

| Mistake | Result |
|---|---|
| `git pull` without checking the site after | Possible silent 404 window |
| Trusting `verify.sh` alone | Internal-only; misses a broken public route |
| Assuming an edited mounted file took effect | Containers keep old env until recreated |
| Running compose directly instead of `deploy.sh` | Secrets never decrypted; Traefik config never staged |
| Restoring a dump without re-encrypting | Every MCP config and OAuth token unreadable |
