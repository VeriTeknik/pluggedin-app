# Automatic deployment

Design: `docs/superpowers/specs/2026-08-10-auto-deploy-design.md`

## What deploys by itself

Application-code merges to `main`, within about two minutes. A commit range
is blocked from unattended deployment if it touches any of:

- `infra/`
- `docker-compose*.yml`
- any root-level `Dockerfile` variant (e.g. `Dockerfile`, `Dockerfile.production`)
- `.dockerignore` at the repo root
- anything under `.github/` (not just `.github/workflows/` — composite
  actions under `.github/actions/` are just as capable of reaching secrets)

A blocked deploy is recorded and waits for a human; it does not retry itself
into working. **Once the gate blocks a range, later app-only commits do not
unblock it** — the poller always evaluates from the *running* revision to the
*latest* revision, so as long as the running revision is still behind the
infra commit, that commit is still in the range and the gate still fires,
no matter how many purely-app commits land on top of it. The block only
clears when a human deploys and the running revision moves past the infra
commit (see "Unblocking the gate" below); nothing here goes stale on its own.

Nothing notifies you of any of this — no email, no Slack, nothing. The only
way to learn a deploy happened, failed, or is blocked is to ask:

    infra/scripts/deploy-watch.sh --status

## Install

    git clone https://github.com/VeriTeknik/pluggedin-app /home/pluggedin/deploy-tree
    git -C /home/pluggedin/deploy-tree checkout --detach origin/main
    sudo cp infra/systemd/pluggedin-deploy-watch.* /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now pluggedin-deploy-watch.timer

## First run, supervised

Two things about this first run are unverified before it happens, and both
need a human watching:

1. **The systemd hardening directives have never been exercised.** The unit
   carries eight hardening directives — `NoNewPrivileges`,
   `ProtectKernelModules`, `ProtectKernelTunables`, `ProtectControlGroups`,
   `ProtectClock`, `RestrictSUIDSGID`, `RestrictRealtime`, `LockPersonality`
   — none of which have run against this host before. Confirm the run
   actually reached `git fetch` and `docker pull`/`docker compose` rather
   than failing silently inside the sandbox:

       journalctl -u pluggedin-deploy-watch.service -n 50
       # look for "deploying <sha>" or "up to date at <sha>", not a bare
       # non-zero exit with no deploy-watch log lines at all

2. **Compose labels containers with the project working directory.**
   Deploying from a second checkout (`/home/pluggedin/deploy-tree`, not the
   maintainer's usual checkout) changes that label, so the first run may
   recreate more than just the app container.

Run it by hand first and watch, rather than trusting the timer's first fire:

    infra/scripts/deploy-watch.sh --dry-run
    infra/scripts/deploy-watch.sh
    docker compose -f /home/pluggedin/deploy-tree/infra/docker-compose.yml ps

## Unblocking the gate

    IMAGE_TAG=sha-<short> infra/scripts/deploy.sh

Deploying by hand moves the running revision past the infra commit, and the
next cycle proceeds on its own (see "What deploys by itself" above for why
later app-only commits alone never do this).

## When rollback reports a migration was applied

`deploy-watch.sh` migrates the schema *before* replacing the running
container, so a verification failure after a migration ran cannot be
silently undone: the image can be swapped back, the schema cannot. Check
`--status` and `journalctl` for one of three outcomes, each requiring a
different response:

- **`rolled back and verified`** — the previous image is back up and passed
  `external_check`. If the range also touched `drizzle/`, this is still
  followed by a `MIGRATION ALREADY APPLIED, needs a human` marker: the old
  code is now running against a newer schema. Decide between rolling the
  schema forward with a fix or restoring from backup.
- **`rollback attempted but NOT verified`** — the retag and/or redeploy to
  the previous image may have partly landed, but `external_check` did not
  confirm it's healthy. Do not assume the site is back; check it directly
  and be ready to intervene by hand.
- **`NO ROLLBACK POSSIBLE (previous image unknown)`** — there was no prior
  running container to roll back to (e.g. first-ever deploy through this
  path). The stack is left as `do_deploy` left it; diagnose from there.

In any of these, if the outcome also carries `MIGRATION ALREADY APPLIED,
needs a human`, the schema changed and was never rolled back by this script.
The pre-migration dump is the newest file in `/var/backups/pluggedin/` —
note a backup is only taken when the deploying commit range touches
`drizzle/`, so if migrations were involved a dump exists. See
`infra/scripts/restore.sh` to restore it; the dumps are age-encrypted.

## What this does NOT do

- **No notifications of any kind.** Not email, not Slack, not anything else.
  `infra/scripts/deploy-watch.sh --status` (and `journalctl -u
  pluggedin-deploy-watch.service`) are the only ways to learn that a deploy
  ran, failed, or is sitting blocked behind the infra gate.
- **The deploy path has only ever run against stubs.** `test-deploy-watch.sh`
  exercises the logic with fake `docker`/`git`/`curl` on `PATH`; nothing in
  this branch has driven a real deploy, a real rollback, or a real migration
  against production. Treat the first real run of each path — deploy,
  rollback, migration — as unverified until watched happen once.

## Logs

    journalctl -u pluggedin-deploy-watch.service -n 100
