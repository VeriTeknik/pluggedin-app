# Docker + Traefik + SOPS Migration Plan

**Status:** Proposed
**Owner:** ops
**Target completion:** TBD (depends on PG dump-and-restore window)
**Companion files:** `infra/` directory at repo root contains the working stack.

---

## 1. Executive summary

Move `plugged.in` off the bespoke "native nginx + systemd + workspace `.env` + external PostgreSQL" deployment onto a containerised stack:

- **Docker Compose** as the unit of deployment (single-host today, portable later).
- **Traefik v3** as the only TLS terminator and reverse proxy. Automatic Let's Encrypt issuance via **HTTP-01** (same mechanism certbot used pre-migration). No DNS-provider account needed.
- **SOPS + age** as the single source of truth for secrets. Encrypted file checked into the repo, decrypted at deploy time into a tmpfs.
- **PostgreSQL 16 + pgvector** as a containerised database on this host, replacing the external `185.96.168.246` instance. Data migrated in a short maintenance window via `pg_dump --clean --if-exists` round-trip.
- **Redis 7** containerised on the same compose stack.
- **Ofelia** for in-stack cron, replacing the seven host crontab entries. Host-side helper scripts (`oauth-refresh.sh`, etc.) become `docker compose exec` calls or are absorbed into the app.
- **Existing `firejail`/`bubblewrap` MCP sandboxing** preserved by giving the app container `CAP_SYS_ADMIN` and a writable `/tmp` namespace; verified per-server before cutover.

The migration also incidentally fixes the class of bug we just hit (workspace `.env` not propagating to Next.js standalone), because Docker Compose's `env_file:` is the authoritative env source for the container — no second `.env` copy inside the build artefact.

### Non-goals (intentionally out of scope)

- Migrating to Kubernetes/Nomad. Compose is enough for a single host of this size.
- Multi-host HA. Today's footprint fits comfortably on one box (125 GiB RAM, 338 GiB free disk, p99 CPU < 20%).
- Re-architecting the app. Code changes are limited to a tiny `lib/` adjustment and an updated `Dockerfile`.
- Migrating zvec to a client/server vector store. It stays embedded; we bind-mount `/home/pluggedin/zvec-data` into the container.

---

## 2. Current state inventory (verified 2026-05-14)

| Component | Where | Notes |
|---|---|---|
| `pluggedin.service` (systemd) | `/etc/systemd/system/pluggedin.service` | Runs `pnpm start` → `node .next/standalone/server.js` on `:12005` |
| `nginx.service` | `/etc/nginx/sites-enabled/plugged.in` | TLS termination + `proxy_pass http://localhost:12005` plus per-location rules (gzip, SSE timeouts, widget CORS, immutable static cache, security headers — translated 1:1 into `infra/traefik/dynamic/middlewares.yml` and labels on `pluggedin-app`) |
| `redis-server.service` | local | `redis://localhost:6379` |
| PostgreSQL | **External** `185.96.168.246:5432/v220_prod` | Shared with other VeriTeknik infra |
| TLS certs | `/etc/letsencrypt/live/plugged.in/` | certbot HTTP-01 → Traefik will take over with the same challenge type, same renewal cadence |
| `.env` | `/home/pluggedin/pluggedin-app/.env` (workspace) and `/home/pluggedin/pluggedin-app/.next/standalone/.env` (build copy) | Two copies, drift caused the recent zvec incident |
| zvec data | `/home/pluggedin/zvec-data/` (3.9 MiB after reindex) | bind-mount candidate |
| MCP package cache | `/var/mcp-packages/` (**88 GiB**) | Stays on host disk; bind-mount, do not move into named volume |
| User uploads | `/home/pluggedin/uploads/` (114 MiB) | bind-mount |
| App logs | `/var/log/pluggedin/pluggedin_app.log` | Replace with container stdout → loki/jsonlog driver, keep file logger as fallback |
| Host crontab | 7 entries | 4 shell scripts in `/home/pluggedin/*.sh`, 3 `curl` POSTs to `/api/memory/*` and `/api/clipboard/*` |

### Resource headroom

- RAM: 6.9 used / 125 GiB total → plenty for a PG container with `shared_buffers=4GB`.
- Disk: 338 GiB free.
- Disk-hungry directory: `/var/mcp-packages` at 88 GiB. The compose stack must bind-mount it, not copy.

---

## 3. Target architecture

```
                Internet
                   │
                   ▼
        ┌──────────────────────┐
        │  Traefik v3          │ :80 → :443 redirect
        │  LE HTTP-01          │ :443 TLS terminator
        └──────────┬───────────┘
                   │  internal docker network: pluggedin
                   │
       ┌───────────┴────────────┐
       ▼                        ▼
   pluggedin-app             ofelia-cron
   :3000 (int)               (no port; runs scheduled tasks
                              against the app via docker exec)
       │
       ▼
   postgres:16 (pgvector ext) — :5432 internal only
   redis:7                    — :6379 internal only

Bind mounts (host → container):
  /home/pluggedin/zvec-data   → /app/data/vectors  (rw)
  /home/pluggedin/uploads     → /app/uploads       (rw)
  /var/mcp-packages           → /app/.cache/mcp-packages (rw)
  /var/log/pluggedin          → /app/logs          (rw)
  /run/sops                   → /run/sops          (ro, decrypted at deploy)

Named volumes (managed by Docker):
  pgdata          → /var/lib/postgresql/data
  redisdata       → /data
  traefik-acme    → /letsencrypt
```

### Why bind-mount `/var/mcp-packages` instead of a named volume?

88 GiB. Recreating that cache from scratch costs the whole site ~hours of latency while every MCP package re-resolves. Bind mount is one `chown -R` from being writable by the container.

---

## 4. Decisions (with my recommendation)

| Decision | Options | Recommendation | Why |
|---|---|---|---|
| **SOPS key backend** | age, GPG, AWS KMS, GCP KMS | **age** with a single host key + one offsite backup key | Zero external dependency, single binary, machine-readable, fits ops scale here. |
| **Traefik TLS issuer** | LE HTTP-01, LE DNS-01 | **HTTP-01** | Same mechanism certbot used on this host pre-migration; no DNS-provider API token to manage. We only need certs for `plugged.in` and `traefik.plugged.in`, no wildcards required. Pre-listing both domains on the websecure entrypoint pre-warms issuance at startup so the first request after cutover doesn't pay the ACME round-trip. |
| **PG migration cutover** | dump/restore, logical replication, pg_dumpall | **`pg_dump -Fc` round-trip in a maintenance window** | Database is small (estimated < 5 GiB based on chunk count and table set); single-shot is faster to plan, validate, and rollback than logical replication. Estimated downtime: 5–10 min. |
| **PG inside Docker** | yes, no | **Yes**, on this host | One less external dependency, no more cross-network round-trip latency, encrypted at rest if needed via LUKS or pg-tde later. |
| **Container registry** | GHCR, Docker Hub, self-hosted | **GHCR** (`ghcr.io/veriteknik/pluggedin-app`) | Free for public repos; integrates with GH Actions; tied to the existing repo identity. |
| **MCP sandboxing inside container** | drop sandboxing, firejail-in-docker, bubblewrap-in-docker | **bubblewrap + fallback to none** | Firejail requires SUID-root inside the container which is fragile; bubblewrap works with `CAP_SYS_ADMIN` and userns, which Docker can grant safely. Document trade-off. |
| **Cron scheduler** | host crontab unchanged, Ofelia, app-internal node-cron | **Ofelia container** | Survives host reinstalls, declarative in `infra/ofelia/config.ini`, runs `docker exec` so the cron has the right env. |
| **Logging** | json-file driver, Loki, file bind-mount | **json-file + bind-mount `/var/log/pluggedin`** (Loki later) | Preserves `tail -f /var/log/pluggedin/pluggedin_app.log` muscle memory while we migrate. |
| **`docker-compose.yml` at repo root** | keep, delete | **Delete** in Phase 9 | Confusing alongside the new `infra/docker-compose.yml`; `Dockerfile.production` becomes `Dockerfile`. |

### Open questions

1. **External PG owner.** Are other apps still pointing at `185.96.168.246/v220_prod` after we copy out? If yes, we can't shut down the external instance even after cutover.

---

## 5. Phased plan

Each phase has explicit **rollback** instructions. We never burn a bridge before the next bridge is verified.

### Phase 0 — Prep (no production impact, ~1 day calendar)

- [ ] Drop DNS TTL on `plugged.in` A record to 60s (currently likely 3600+). Wait one previous-TTL window before any cutover.
- [ ] Generate age key on this host: `age-keygen -o /etc/sops/age/keys.txt`, `chmod 400`, back up the **private key** to offline storage (1Password, USB, whatever ops already uses).
- [ ] Take a verified backup of the external Postgres:
      `pg_dump -Fc -h 185.96.168.246 -U postgres -d v220_prod -f /tmp/v220_prod-prepatch.dump`
      Restore into a throwaway container to confirm it's not corrupt before we trust it.
- [ ] Snapshot `/home/pluggedin/zvec-data`, `/home/pluggedin/uploads`, `/var/mcp-packages` (`/var/mcp-packages` will not be copied, but verify it's still readable). Tarball goes alongside the PG dump.
- [ ] Install Docker Engine ≥ 24, Docker Compose plugin (already present per survey), `sops` ≥ 3.8, `age` ≥ 1.1.

**Rollback:** none needed; this phase is read-only on prod.

### Phase 1 — Repo-side scaffolding (this PR)

- [x] `infra/docker-compose.yml` describing the full stack.
- [x] `infra/traefik/traefik.yml` (static) + `infra/traefik/dynamic/middlewares.yml`.
- [x] `infra/sops/.sops.yaml` (creation rules) and `infra/sops/secrets.env.sops` (encrypted template).
- [x] `infra/scripts/` (`deploy.sh`, `backup.sh`, `restore.sh`, `cutover-from-native.sh`, `rotate-keys.sh`, `verify.sh`).
- [x] `infra/postgres/init.sql` (extensions, roles).
- [x] `infra/ofelia/config.ini` (cron jobs, replacing the host crontab).
- [x] `Dockerfile` (replace existing — single image for the prod app).
- [x] `.github/workflows/build-image.yml` — image build gated to `workflow_dispatch` and tag pushes until a self-hosted runner with the right CPU profile lands. Standard GitHub-hosted runners SIGILL on the `@zvec/zvec` binding's SIMD code paths inconsistently; the `stack-validate` job (compose config + shellcheck + traefik + ofelia INI parse) still runs on every PR.
- [x] `docs/ops/docker-traefik-sops-migration.md` — this file.

**Rollback:** delete the branch.

### Phase 2 — Stand up Traefik on a non-conflicting port (1 hour)

The current nginx owns `:80` and `:443`. We bring Traefik up on `:8080` (dashboard) and `:8443` (TLS) bound to a test hostname like `staging.plugged.in` (point a temporary A record at the host), validate certificate issuance, then proceed.

- [ ] `docker compose -f infra/docker-compose.yml up -d traefik`
- [ ] Issue a cert for `staging.plugged.in` via HTTP-01 (requires Traefik to own a public port-80 path under that hostname during the test window — we use `8080:80` on Traefik first and gate certbot's existing `:80` ownership by stopping nginx for the 60s validation window only).
- [ ] `curl --resolve staging.plugged.in:8443:127.0.0.1 https://staging.plugged.in:8443/whoami` returns 200 from Traefik's `whoami` test backend.

**Rollback:** `docker compose down traefik`.

### Phase 3 — Containerise Postgres + Redis next to the live app (½ day, no downtime)

- [ ] `docker compose up -d postgres redis`
- [ ] Restore the Phase-0 dump into the container: `infra/scripts/restore.sh /tmp/v220_prod-prepatch.dump`.
- [ ] Run `pnpm db:migrate` against the containerised PG from inside the build image: `infra/scripts/migrate.sh`.
- [ ] Spot-check row counts: `infra/scripts/verify.sh` compares `SELECT COUNT(*)` for every table against the dump.

The live app is untouched in this phase; we have a populated containerised PG sitting next to it, ready for cutover.

**Rollback:** `docker compose down postgres redis -v` (drops volumes); revert is automatic because nothing is pointing at the new PG yet.

### Phase 4 — Containerise the app, port `:12005` parked under Traefik (½ day)

- [ ] Build the image: `infra/scripts/build.sh` (also runs in CI on every push to `main`).
- [ ] `docker compose up -d pluggedin-app` (binds internal port `3000`, Traefik exposes it via the labelled router set).
- [ ] Internal smoke test on the docker network: `docker compose exec traefik curl -fsS http://pluggedin-app:3000/api/health`.
- [ ] Run `infra/scripts/verify.sh --app` which hits `/api/health`, `/api/rag/query` (with a known query), and the auth flow.
- [ ] **Critically: the container has the right zvec path because compose sets `ZVEC_DATA_PATH=/app/data/vectors` and bind-mounts `/home/pluggedin/zvec-data` there.** The drift class of bug from this week becomes structurally impossible.

The live nginx still routes `plugged.in` to the native `:12005`. The containerised app is reachable only through Traefik on `:8443`.

**Rollback:** `docker compose down pluggedin-app`.

### Phase 5 — Cutover (≤ 10 min downtime, scheduled)

This is the only step that affects users. Pick a low-traffic window.

```
[T-15] Drop DNS TTL to 60s (already done in Phase 0).
[T-5]  Run pre-cutover dump for safety:
       infra/scripts/cutover-from-native.sh --dump-only
[T-0]  systemctl stop pluggedin nginx
       Take a delta-dump (changes since the Phase-0 dump) and apply it:
       infra/scripts/cutover-from-native.sh --delta-apply
       Move :80/:443 ownership: bring Traefik down, change its host-port
       binding from 8443→443 and 8080→80, bring it back up.
       Verify cert validity, verify /api/health, verify AI search on a
       known query (the same "PCI"/"GSLB" we used during the zvec
       incident — they're a good canary).
[T+2]  Watchful tail of /var/log/pluggedin (now in the container) and
       Traefik access logs for 5xx spikes.
```

**Rollback (must be feasible in under 2 minutes):**
1. `docker compose stop traefik`.
2. `systemctl start nginx pluggedin`.
3. App is back on the native stack. The containerised PG keeps the new writes since cutover — we'll need a small delta apply back to the external PG if we go through with rollback. The cutover script writes the delta into `/var/backups/pluggedin/cutover-delta-<ts>.sql` precisely for this case.

### Phase 6 — SOPS wired in (1 day, no production impact after Phase 5)

The compose file already references `infra/sops/runtime/secrets.env`, which is the decrypted form. `infra/scripts/deploy.sh` decrypts at deploy time into a tmpfs (`/run/sops`) and removes the file on container restart.

- [ ] Move every secret out of any `.env` file into `infra/sops/secrets.env.sops`.
- [ ] Delete `.env.production` (if present) from the host, leave a tombstone.
- [ ] Document the rotation flow in `docs/ops/sops-rotation.md` (separate file).

**Rollback:** decrypt the SOPS file once, write back to a plain `.env`, set `env_file:` to point at that file.

### Phase 7 — Move crontab into Ofelia (1 hour)

- [ ] The seven host cron entries become entries in `infra/ofelia/config.ini`.
- [ ] `crontab -l > /home/pluggedin/crontab.pre-ofelia.backup; crontab -r`.
- [ ] `docker compose up -d ofelia`.
- [ ] Verify each job fires at least once on its schedule (timestamps in `docker compose logs ofelia`).

**Rollback:** `crontab /home/pluggedin/crontab.pre-ofelia.backup` and `docker compose stop ofelia`.

### Phase 8 — Decommission (1 day, after one week of stable run)

- [ ] `systemctl disable --now pluggedin nginx` (don't delete the unit files yet — they're the documented rollback path).
- [ ] Coordinate with the external PG owner to confirm we're the last consumer of `v220_prod`, then either shut down that database or leave it as a cold replica.
- [ ] Delete `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.production.yml`, `Dockerfile.production`, `docker-build.sh` from the repo root. The `infra/` stack is the only stack.

**Rollback:** `systemctl enable --now pluggedin nginx`. Revert the file deletions from git.

### Phase 9 — Operationalisation (continuous)

- Daily automated `infra/scripts/backup.sh` (PG dump + zvec rsync + uploads rsync), encrypted with the same age key, shipped offsite.
- Quarterly **restore drill**: spin up a parallel compose stack from yesterday's backup on a different port; run `infra/scripts/verify.sh` against it; tear it down.
- Quarterly **key rotation drill**: `infra/scripts/rotate-keys.sh`.
- **Self-hosted GitHub Actions runner** on the prod host (or a sibling box
  with matching CPU). Re-enables the image build in CI by removing the
  `if: ...` guard on the `build` job. The blocker today is that the
  `@zvec/zvec` binding's SIMD code paths SIGILL on GitHub-hosted runners
  whose Xeons sometimes lack the required ISA — production CPU works
  every time. Self-hosted closes the gap. Setup is ~30 min:
  `actions-runner` install + a label like `[self-hosted, plugged-in-prod]`,
  then `runs-on: [self-hosted, plugged-in-prod]` in the workflow.

---

## 6. Deliverables (this PR)

```
infra/
├── README.md                           # ops entry point
├── docker-compose.yml                  # the stack
├── postgres/
│   └── init.sql                        # extensions, roles
├── traefik/
│   ├── traefik.yml                     # static config
│   └── dynamic/
│       └── middlewares.yml             # HSTS, rate-limit, security headers
├── sops/
│   ├── .sops.yaml                      # creation rules — which keys encrypt what
│   └── secrets.env.sops                # encrypted; template here, real values added at deploy
├── ofelia/
│   └── config.ini                      # cron jobs
└── scripts/
    ├── deploy.sh                       # decrypt → compose up → smoke
    ├── build.sh                        # build + tag + (optional) push
    ├── backup.sh                       # pg + zvec + uploads → encrypted tarball
    ├── restore.sh                      # inverse of backup.sh
    ├── cutover-from-native.sh          # the Phase-5 dance
    ├── rotate-keys.sh                  # age key rotation
    └── verify.sh                       # health checks across containers

Dockerfile                              # replaces Dockerfile.production
.github/workflows/build-image.yml       # GHCR push on main
docs/ops/
└── docker-traefik-sops-migration.md    # this file
```

---

## 7. Test strategy

| Layer | Test | Where it runs | Blocking? |
|---|---|---|---|
| Static | `docker compose config` succeeds | CI on every push | yes |
| Static | `sops --check infra/sops/secrets.env.sops` (file is valid SOPS, can be decrypted by the public key) | CI | yes |
| Static | shellcheck on `infra/scripts/*.sh` | CI | yes |
| Build | Docker image builds with `--no-cache` on every push to `main` | CI | yes |
| Image | image starts, `node --version` returns 20+, `tsx --version` returns the locked version | CI | yes |
| Stack | `infra/scripts/verify.sh` runs against a one-shot compose stack with a seeded test DB | CI nightly | yes |
| Stack | Backup/restore drill: take a backup, restore into a parallel stack, diff schema + row counts vs. source | CI weekly | yes |
| Migration | Cutover dry-run on `staging.plugged.in` with a copy of prod data, verifying the AI-search canary query ("GSLB" against the VeriTeknik doc) returns the expected document | manual, pre-cutover | yes |
| Runtime | Traefik `/ping` healthcheck, PG `pg_isready`, Redis `redis-cli PING`, app `/api/health` | every 10s, restart on 3 failures | live |

The canary query — "GSLB" → "VeriTeknik Comprehensive Verticals & Capabilities Summary" — is enshrined in `infra/scripts/verify.sh` because it's exactly the failure mode that turned out to be the trigger for this whole migration. If we ever fall back into the same trap, the verify script fails loudly before anyone notices in the UI.

---

## 8. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| pg_dump/restore data corruption | low | high | Phase 3 restores into a sandbox first; Phase 5 takes a *delta* dump to bridge any drift between Phase-0 dump and cutover; row counts verified by `verify.sh`. |
| LE rate limit during testing | medium | medium | Toggle `caServer:` in `traefik.yml` to `acme.staging.letsencrypt.org` for everything except the final cutover. The staging CA's limits are 30,000 certs per week — effectively unbounded for our needs. |
| Cutover window overruns | low | medium | The cutover is a small, scripted, well-rehearsed sequence; we keep the native stack ready to start with one `systemctl start`. |
| /var/mcp-packages bind-mount permissions | medium | high (long site latency if cache rebuilds) | Phase 4 verify step includes `docker compose exec pluggedin-app ls /app/.cache/mcp-packages | wc -l` against a known-good count from the host. |
| firejail / bubblewrap not available inside container | medium | medium | We ship bubblewrap in the image (already present in `Dockerfile.production` base). For the irreducible case where neither works, `MCP_ISOLATION_TYPE=none` is a feature flag, not a code change. |
| Age private key loss | low | catastrophic (every SOPS secret unreadable) | Key is backed up offline at Phase 0; ops password manager carries a copy; rotation drill quarterly. |
| External PG decommissioned before all consumers move off | low | low | Phase 8 includes a final consumer scan; the external PG stays read-only for at least two weeks post-cutover. |

---

## 9. Runbook (post-cutover daily ops)

### Deploy a new version

```bash
cd /opt/pluggedin-stack
git pull
./infra/scripts/deploy.sh    # decrypts secrets, pulls image, rolling restart, smoke check
```

### Add or change a secret

```bash
sops infra/sops/secrets.env.sops    # opens $EDITOR with decrypted content
git commit -am "ops: rotate FOO"
./infra/scripts/deploy.sh
```

### Restore from yesterday's backup

```bash
./infra/scripts/restore.sh s3://pluggedin-backups/$(date -d yesterday +%F).tar.age
```

### Read the logs

```bash
docker compose -f /opt/pluggedin-stack/infra/docker-compose.yml logs -f pluggedin-app
# Or, since /var/log/pluggedin is still bind-mounted:
tail -f /var/log/pluggedin/pluggedin_app.log
```

### Emergency rollback to the native stack

```bash
docker compose -f /opt/pluggedin-stack/infra/docker-compose.yml stop traefik
systemctl start nginx pluggedin
# DNS is unchanged because Traefik and nginx both terminated on the same
# host IP. Anything written to the containerised PG since cutover is in
# /var/backups/pluggedin/cutover-delta-*.sql for re-apply if needed.
```

---

## 10. Open questions for you before Phase 2

1. ~~CloudFlare API token~~ — **answered**: no CF, using HTTP-01.
2. Does the external PG (`185.96.168.246`) have other clients besides plugged.in?
3. ~~rc1 data sharing~~ — **answered**: rc1 no longer exists; single instance only.
4. Acceptable cutover window (timezone + duration)? Plan is sized for 10 minutes but I'd schedule a 30-minute window with comms.
5. ~~Container registry~~ — **answered**: GHCR, already pushing on every main merge via the self-hosted runner (PR #157, PR #158).
