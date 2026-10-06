# Automatic deployment

Design: `docs/superpowers/specs/2026-08-10-auto-deploy-design.md`

## What deploys by itself

Application-code merges to `main`, within about two minutes. A commit range
is blocked from unattended deployment if it touches any of:

- `infra/`
- `docker-compose*.yml` at the repo root
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

**A deploy that fails is not retried automatically either** — see "When an
automatic deploy fails" below. This is deliberate: a failed target stays
failed until a human (or a fix pushed as a newer commit) resolves it,
rather than the poller hammering the same broken target every two minutes.

Nothing notifies you of any of this — no email, no Slack, nothing. The only
way to learn a deploy happened, failed, or is blocked is to ask:

    infra/scripts/deploy-watch.sh --status

## Install

    git clone https://github.com/VeriTeknik/pluggedin-app /home/pluggedin/deploy-tree
    git -C /home/pluggedin/deploy-tree checkout --detach origin/main
    sudo cp infra/systemd/pluggedin-deploy-watch.* /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable pluggedin-deploy-watch.timer

`enable`, deliberately **without** `--now`. `pluggedin-deploy-watch.timer`
has `OnBootSec=3min`: on any host that has already been up for more than 3
minutes (i.e. every host except one that just rebooted), that fires
immediately once the timer unit is started — a full, unsupervised deploy,
on the spot, before the supervised first run below has ever happened. Enable
now so the timer survives reboots; start it only at the end of "First run,
supervised", once that run is confirmed good.

### Bootstrap the state directory

The service unit declares `StateDirectory=pluggedin-deploy-watch`, which
normally makes systemd create `/var/lib/pluggedin-deploy-watch`, owned by
`pluggedin:pluggedin`, the first time the *service* starts. But the
supervised first run below runs the script by hand, before the service has
ever started — and `/var/lib` itself is `root:root 0755`, so the `pluggedin`
user cannot create a directory under it. Left alone, the hand run below dies
on `mkdir` inside the script.

Create it explicitly first, with the same ownership systemd would have used:

    sudo install -d -o pluggedin -g pluggedin /var/lib/pluggedin-deploy-watch

Use `install -d`, not a bare `sudo mkdir -p`, and do not run
`deploy-watch.sh` itself under `sudo`: either one leaves the directory or
its state file owned by `root`, and the service — which runs as
`pluggedin`, not `root` — then cannot write to it on its next cycle.

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

Run it by hand first and watch, rather than trusting the timer's first fire.
Run it **as the `pluggedin` user**, not as `root` and not via plain `sudo`
(see the state-directory note above — an account mismatch here leaves a
root-owned state file the service can never write again):

    sudo -u pluggedin -H infra/scripts/deploy-watch.sh --dry-run
    sudo -u pluggedin -H infra/scripts/deploy-watch.sh
    docker compose -f /home/pluggedin/deploy-tree/infra/docker-compose.yml ps

Once this is confirmed good — the container came up, `docker compose ps`
looks right, and `infra/scripts/deploy-watch.sh --status` shows a clean `ok`
outcome, not a `FAILED` or `BLOCKED` one — start the timer so it takes over
future cycles:

    sudo systemctl start pluggedin-deploy-watch.timer

## Unblocking the gate

    IMAGE_TAG=sha-<short> infra/scripts/deploy.sh

Deploying by hand moves the running revision past the infra commit, and the
next cycle proceeds on its own (see "What deploys by itself" above for why
later app-only commits alone never do this).

## When an automatic deploy fails

If `do_deploy` fails for a target — a bad migration, a health check that
never turns green, anything in "When rollback reports a migration was
applied" below — the watcher records that exact commit as the failed
target and **will not attempt it again on its own**. This is deliberate,
not a bug: a broken target does not start passing on attempt two with no
code change in between, every attempt whose range touches `drizzle/` costs
a full `backup.sh` run (minutes, gigabytes) before it even reaches the step
that might fail again, and there is no notification channel to say a retry
budget got burned overnight. One attempt, then stop, until something
actually changes.

`--status` shows it plainly:

    infra/scripts/deploy-watch.sh --status
    ...
      DEPLOY FAILED for target <sha> — will NOT retry automatically.
      See "last outcome" above for why. To clear this and resume automatic
      deploys, do ONE of:
        1. Push a fix to main — a NEWER commit deploys on its own, no
           clearing needed, that is the whole point of the feature.
        2. Deploy this exact target by hand, which clears the marker on the
           next cycle once the running revision catches up to it:
             IMAGE_TAG=sha-<short> infra/scripts/deploy.sh
        3. Clear the marker without deploying, e.g. after fixing the
           underlying problem out of band:
             infra/scripts/deploy-watch.sh --clear-failed

Concretely, one of three things clears the marker:

- **A newer commit lands on `main`.** The watcher compares the failed
  marker against the *exact* SHA that failed, not "anything still pending",
  so a fix pushed as a new commit is a different target and deploys
  normally — nothing to clear by hand.
- **A human hand-deploys the failed commit (or something past it).** Once
  the running revision catches up to or passes it, the next cycle notices
  (the same staleness check the infra gate above already uses) and clears
  the marker on its own.
- **`infra/scripts/deploy-watch.sh --clear-failed`**, run as the
  `pluggedin` user, if neither of the above applies yet — e.g. the
  underlying problem (bad SOPS secret, registry outage) was fixed out of
  band and the same commit should simply be allowed to retry on the next
  poll.

## Verification timeout

After a deploy (and after a rollback attempt), `external_check` polls
`${SITE_URL}/api/health` every `EXTERNAL_CHECK_INTERVAL` seconds (default
`5`) until it returns HTTP 200 with `"status":"healthy"`, or until a
wall-clock deadline of `EXTERNAL_CHECK_TIMEOUT` seconds (default `90`)
passes — override either with those environment variables. The 90s default
covers the app healthcheck's own `start_period: 30s` plus Traefik's LB
healthcheck only re-polling backend health every 30s, so a freshly deployed
container can legitimately take up to ~60s to become both healthy and
reachable through Traefik before the deadline gives up on it.

If deploys keep getting rolled back and you suspect verification is racing
a slow container start rather than catching a real failure, check
`journalctl -u pluggedin-deploy-watch.service` for how close to the 90s
mark the failure landed. Near the deadline points at a slow start, not a
broken deploy — retry with a longer budget, e.g.
`EXTERNAL_CHECK_TIMEOUT=180 infra/scripts/deploy-watch.sh` for a one-off
manual run, or via `Environment=` in the systemd unit for the timer. A
failure early, well inside the default window, points at a genuinely broken
deploy instead, and raising the timeout would only delay finding that out.

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
