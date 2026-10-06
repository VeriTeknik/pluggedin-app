# Automatic Deployment — Design

**Date:** 2026-08-10
**Status:** Approved — ready for implementation planning
**Repository:** `pluggedin-app`

---

## Goal

A merge to `main` reaches production without anyone opening a terminal, so the
maintainer can patch from a phone or from Claude Code on the web while away from
the box.

The prompting incident: PR #192 (a Mobile Safari crash fix) merged on 2026-08-09
and was still not live the next day. Production had been serving the 2026-08-01
image for eight days, with four merged app-affecting PRs — including a
`sanitize-html` GHSA patch — sitting undeployed. CI built and pushed every one of
those images successfully. Nothing consumed them.

---

## Why deployment is not already automatic

`.github/workflows/build-image.yml` builds and pushes to GHCR. It has no deploy
step, and production pins `IMAGE_TAG` to a hand-maintained `:live` tag that CI
never moves. Deployment has always been a human running `infra/scripts/deploy.sh`.

---

## The constraint that determines the shape

**CI cannot deploy this stack, by design.**

`infra/scripts/isolate-gha-runner.sh` moved the self-hosted runner off the
`pluggedin` account onto a dedicated `ghrunner` user with a *rootless* Docker
daemon. Its header states the reasoning: membership in the `docker` group is
root-equivalent, so a separate user in that group closes nothing —

```
docker run -v /etc/sops/age:/host:ro alpine cat /host/keys.txt
```

— and that was verified against this host before the script was written.

After isolation the runner cannot read `/etc/sops/age/keys.txt`, cannot read
`/run/sops/secrets.env`, and cannot reach the system Docker daemon that serves
production. `deploy.sh` requires all three.

So a push-based deploy from CI would mean handing the runner back the age key and
the production socket — reverting the hardening. **Deployment must therefore be
pull-based: triggered on the host, by a principal that already holds those
rights.**

Watchtower fails the same test more cheaply. It needs `POST` and `IMAGES` on the
Docker API, which `docker-socket-proxy` denies deliberately — the compose comment
records that direct socket access could read 108 environment variables off
`pluggedin-app`, 28 of them secret-bearing, and that `POST /containers/create` is
one bind-mount from host root. Watchtower also knows nothing about SOPS
decryption, Traefik config staging, migrations, verification, or rollback. It was
never installed here, and should not be.

---

## Architecture

A `deploy-watch.sh` script runs on the host as `pluggedin` under a systemd timer,
every 2 minutes. Given that an image build takes several minutes, a 2-minute poll
is indistinguishable from merge-triggered in practice, and it needs no inbound
network surface, no webhook secret, and no relaxation of the runner boundary.

Each tick:

1. `git fetch` the deploy tree; read `origin/main`'s HEAD commit.
2. Resolve `ghcr.io/veriteknik/pluggedin-app:sha-<short>` for that exact commit.
   Absent means CI has not finished — exit quietly, try again next tick.
3. Compare against the running container's
   `org.opencontainers.image.revision` label. Equal means nothing to do.
4. Apply the infra gate (below). Blocked means record and exit.
5. Deploy, verify, and roll back on failure.

`flock` guarantees a single concurrent run.

### Commit lockstep

Deployment runs from a dedicated clean clone at `/home/pluggedin/deploy-tree`,
checked out detached at the exact commit the image was built from — never from
the maintainer's working tree.

This fixes a live hazard. `deploy.sh` reads `infra/docker-compose.yml` and
`infra/traefik/dynamic/*.yml` from whatever tree it is invoked in, and that tree
is currently on branch `infra/prune-build-artifacts`, not `main`. A deploy today
would pair `main`'s image with a feature branch's infrastructure config. Lockstep
removes the class of bug, and frees the maintainer to switch branches in the
working tree without any effect on production.

### The infra gate

Automatic deployment applies **only to application-code changes**. The range
examined is `<currently deployed revision>..<candidate commit>` — every commit
that would go live in this deploy, not just the newest one. If any file in that
range matches:

- `infra/**`
- `docker-compose*.yml`
- `Dockerfile`
- `.github/workflows/**`

the watcher does not deploy. It records the blocked commit in its state file and
exits.

Once blocked, later app-only commits do **not** unblock it: they widen the range,
which still contains the infra change. The gate stays shut until a human deploys
and the deployed revision moves past it. This is deliberate — the alternative
would let an infra change ride to production behind an innocuous follow-up
commit.

The reasoning is specific to this repository. `main` has
`required_approving_review_count: 0` and `enforce_admins: false`, so a commit can
reach `main` with no review — commit `c1d7a27f` did, and had to be reverted by
#182. The repository is public. Today the compensating control is that a human
must run `deploy.sh`; automation removes it, and a merge to `main` would become
arbitrary code execution on the production host as the user holding the SOPS age
key, within two minutes.

The gate keeps the routine case — an app patch merged from a phone — fully
automatic, while the class of change that can alter what the host mounts, which
services run, or what the container can reach still requires a human at a
terminal. It is the single decision that most reduces blast radius without
blocking the workflow this project exists to enable.

### Migrations

Migrations do not run at container start; `Dockerfile:122` documents them as a
manual one-shot. Automation therefore runs them explicitly, in this order:

```
pull → pg_dump (infra/scripts/backup.sh) → drizzle-kit migrate (one-shot, new image)
     → docker compose up -d → verify.sh → external HTTP check
```

Migrating **before** the app is replaced means a migration failure aborts the
deploy without ever touching the running container: the old app keeps serving old
code against the unmigrated schema. That is a clean failure.

### Rollback

If `verify.sh` or the external check fails, the watcher retags `:live` to the
previous digest and brings the stack back up. The previous image is pinned under
an explicit `rollback-<short>` tag so retagging cannot orphan it.

**Rollback restores the image; it does not reverse the migration.** If migration
succeeded and verification then failed, the schema is forward and the code is
back. The pre-migration dump exists precisely for that case, and the state file
must record it as requiring a human rather than as self-healed.

### Reporting

No notification channel, by decision. The watcher writes to journald and
maintains a state file readable via `deploy-watch.sh --status`, reporting: last
check, running revision, latest available revision, whether a deploy is blocked by
the infra gate and which commit, and the outcome of the last deploy.

The accepted cost: a deploy blocked by the infra gate is silent. `--status` is the
one place that answers "is anything waiting?", and it must answer it in one
command.

---

## Preconditions found while validating the design

**Stale GHCR credential (blocker).** `~/.docker/config.json` held a GHCR
credential that the registry rejects. Anonymous manifest resolution returns `200`
— the package is public — while an authenticated `docker pull` returned
`denied: denied`. Docker prefers the stored credential over anonymous access, so
every pull failed. Resolved by `docker logout ghcr.io`; the deploy user now pulls
the public package anonymously and carries no registry token. Left unfixed, this
would have failed every automated deploy at the same step.

**Compose project identity.** The running stack has project name `infra` with
`working_dir=/home/pluggedin/pluggedin-app/infra`. Invoking compose from
`/home/pluggedin/deploy-tree/infra` yields the same project name, but the
`working_dir` and `config_files` labels change. The first deploy from the new
tree must be run manually and observed, in case Compose elects to recreate
services beyond `pluggedin-app`. `name: infra` should be set explicitly in
`infra/docker-compose.yml` so project identity no longer depends on a directory
name.

**Tag width.** GHCR short-SHA tags are 7 characters (`sha-4cf9c6e`). The watcher
must derive them with `git rev-parse --short=7`; an 8-character guess 404s.

---

## Testing

- **Unit, on the gate:** given a commit range, does the classifier correctly
  allow app-only changes and block each of the four protected path patterns.
- **Dry run:** `--dry-run` resolves and reports what it *would* deploy, changing
  nothing. This is how the first live check is made.
- **Rollback rehearsal:** force `verify.sh` to fail against a known-good image and
  confirm the previous digest is restored and the state file marks it as failed.
- **Idempotence:** two ticks with no new commit must be a no-op, and concurrent
  invocations must serialise on the lock.

---

## Non-goals

- Moving the Actions runner to a separate machine, which is the correct long-term
  fix and would make push-based deployment safe. Tracked separately.
- Ofelia's raw Docker socket mount (`infra/docker-compose.yml:363`), already noted
  in-file as a follow-up. This design neither depends on it nor worsens it.
- Zero-downtime or blue/green deployment. The stack restarts a single app
  container; the brief gap is acceptable and is what happens today.
