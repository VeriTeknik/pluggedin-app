# Cutover runbook — native stack → containerised stack

**Status:** ready to execute, blocked on two prerequisites (§0).
**Prepared:** 2026-07-31, after phases 0–4 completed and verified.
**Background:** [`docker-traefik-sops-migration.md`](docker-traefik-sops-migration.md).

This is the only step that takes the site down. Everything before it ran
alongside production without interruption.

Expected downtime: **2–5 minutes.** The database is 112 MiB, an order of
magnitude smaller than the <5 GiB the original 10-minute estimate assumed.
Budget a 30-minute window anyway.

---

## 0. Prerequisites

### 0.1 DNS — ✅ done and verified 2026-07-31

`traefik.plugged.in` A → `185.96.168.249`, which is this host's public IP.

Verified by more than a `dig`: with the record live, Traefik's ACME error
changed from `NXDOMAIN looking up A` to

```
403 unauthorized :: 185.96.168.249: Invalid response from
https://traefik.plugged.in/.well-known/acme-challenge/<token>: 404
```

That 404 is nginx answering, because it still owns `:80`. So the whole ACME
path — DNS resolution, Let's Encrypt reaching this host on port 80 — is
confirmed working, and the only thing left blocking issuance is port
ownership, which cutover resolves the instant nginx stops.

**The `plugged.in` TTL does *not* need dropping.** The original plan listed
it, and this runbook repeated it, but it does not apply to this cutover:
Traefik and nginx terminate on the same host IP, so no DNS record changes and
rollback never waits on propagation. It is currently 14400 and that is fine.
Leave it alone.

### 0.2 Root access — ⛔ the remaining blocker

Every step below needs `sudo`, and `sudo -n` on this host still prompts for a
password. Phases 0–4 were all done unprivileged; the cutover cannot be.

```bash
sudo -v          # confirm you can escalate before starting the window
```

Run the cutover from an interactive shell where you can authenticate — or
grant the scoped rule in §0.3 and it can run unattended.

### 0.3 Optional: scoped rule for unattended execution

Auditing the scripts, exactly **one** privileged operation exists in the
cutover path: `systemctl stop pluggedin nginx` (and its rollback partner).
Everything else either needs no privilege or needs two directories that root
must create once.

Note upfront: `pluggedin` is in the `docker` group, which is already
root-equivalent on this host — the docker socket can mount `/` and escalate.
So this rule grants strictly less than the account already has; it is about
keeping the *automated* path narrow and auditable, not about creating a new
boundary.

**One-time setup** (creates the directories, makes the reboot-safe tmpfiles
rule, and lets the deploy account read the age key at its canonical path so
the second copy under `~/.config` can be deleted):

```bash
sudo bash infra/scripts/setup-cutover-access.sh
```

**The rule**, installed with `visudo` so syntax is validated before it takes
effect — a malformed sudoers file can lock everyone out:

```bash
sudo visudo -f /etc/sudoers.d/pluggedin-cutover
```

Paste the contents of `infra/sudoers/pluggedin-cutover`. It permits four
exact command lines and a read-only probe, nothing more: argument lists are
matched literally by sudo, so it does not allow `systemctl stop <anything
else>`, `daemon-reload`, or a bare `systemctl`.

Confirm it works without stopping anything:

```bash
sudo -n systemctl show pluggedin --property=ActiveState
```

**Remove it once the cutover is done and stable:**

```bash
sudo rm /etc/sudoers.d/pluggedin-cutover
```

---

## 1. Pre-flight (T-30, no downtime)

```bash
cd /home/pluggedin/pluggedin-app
git checkout infra/sops-phase0        # or main, once merged

# Age key readable at its canonical path (group-readable after §0.3 setup).
test -r /etc/sops/age/keys.txt && echo "age key ok"

# The previous data-encryption key. Without it the restored dump cannot be
# migrated onto the rotated key and the app will not be able to read it.
# The handoff file is owned by `pluggedin` — no escalation needed here.
export OLD_KEY=$(grep '^OLD_NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=' \
    /home/pluggedin/backups/rotation-*/HANDOFF.env | head -1 | cut -d= -f2-)
[ -n "$OLD_KEY" ] && echo "OLD_KEY loaded (${#OLD_KEY} chars)"

# External PG password, for the dumps.
export PGPASSWORD='<password for postgres@185.96.168.246>'

# Image for the deploying commit must exist locally.
docker images ghcr.io/veriteknik/pluggedin-app --format '{{.Tag}}' | head
export IMAGE_TAG=cutover           # or sha-<short> from infra/scripts/build.sh
```

The phase 2–4 validation stack has already been torn down (`docker compose
-p pluggedin-pre down`, volumes preserved), so nothing holds :8080/:8443. If
you re-ran it since, take it down again before starting — and never with
`-v`, which would drop `pgdata`.

```bash
docker ps --format '{{.Names}}'    # expect empty
```

---

## 2. Cutover (T-0, downtime starts)

```bash
sudo -E infra/scripts/cutover-from-native.sh --switch
```

`-E` matters: the script needs `OLD_KEY`, `PGPASSWORD` and `IMAGE_TAG` from
your environment.

The script, in order:

1. `systemctl stop pluggedin nginx` — **downtime starts**, writes quiesce.
2. Backs up the host crontab to `/home/pluggedin/crontab.pre-ofelia.backup`
   and removes it. This has to happen here, not in Phase 7: the crontab
   hardcodes the pre-rotation `CRON_SECRET`, so leaving it live would mean
   seven jobs failing auth against the new stack.
3. Final `pg_dump` of the external PG, now quiet, into
   `/var/backups/pluggedin/cutover-final.dump`.
4. Restores it into the containerised Postgres.
5. Runs drizzle migrations.
6. **Re-encrypts** all 5,305 encrypted values from the old data key onto the
   rotated one, then verifies every row reads back. Refuses to continue if
   `OLD_KEY` is unset. Takes ~2 minutes.
7. Brings the full stack up with Traefik on **:80/:443** (nginx has released
   them by now).
8. Runs `verify.sh`.

---

## 3. Verify before declaring done

```bash
# Certificate is real, not Traefik's self-signed default.
echo | openssl s_client -connect plugged.in:443 -servername plugged.in 2>/dev/null \
  | openssl x509 -noout -issuer -dates

curl -sI https://plugged.in/ | head -1
curl -s  https://plugged.in/api/health          # expect "status":"healthy"

# The RAG canary — the exact failure that motivated this migration.
CANARY_API_KEY=<a real api key> infra/scripts/verify.sh
```

`verify.sh` without `CANARY_API_KEY` skips the canary. Run it *with* the key
at least once here; "GSLB" must return the VeriTeknik document.

### If the certificate does not issue

`infra/traefik/traefik.yml` points at the **production** Let's Encrypt CA,
which allows only **5 certificates per registered domain per week**. Do not
loop on a failing issuance — you can exhaust the week's budget in minutes and
then be unable to get a real certificate at all.

If the first attempt fails, switch the `caServer:` line to the staging CA
(the commented line directly above it), debug there where limits are
effectively unbounded, then switch back for the real issuance:

```bash
docker compose -f infra/docker-compose.yml logs traefik | grep -i acme
```

Confirm nothing else is holding `:80` — that is the failure mode this
runbook's §0.1 verification isolated.

Then watch for 15 minutes:

```bash
docker compose -f infra/docker-compose.yml logs -f --tail=50 pluggedin-app traefik
```

Two things to watch specifically, because both were rotated:

- **Users are all logged out.** `NEXTAUTH_SECRET` changed; every existing
  session is invalid. Expect a login spike, not an incident.
- **Unsubscribe links in already-sent email no longer validate.**
  `UNSUBSCRIBE_TOKEN_SECRET` changed. Nothing to fix, just don't be
  surprised by reports.

---

## 4. Rollback (target: under 2 minutes)

```bash
docker compose -f infra/docker-compose.yml stop traefik
sudo systemctl start nginx pluggedin
crontab /home/pluggedin/crontab.pre-ofelia.backup
```

DNS does not change — Traefik and nginx terminate on the same host IP.

What rollback does **not** undo: writes made against the containerised DB
after cutover stay there, encrypted with the rotated key. They are not
replayed to the external PG. If the window ran long enough to matter, the
dumps in `/var/backups/pluggedin/` are the reconciliation input, and
`infra/scripts/reencrypt-data-key.mjs` can move them back with `OLD_KEY` and
`NEW_KEY` swapped.

---

## 5. After the window

Not urgent, but don't lose track:

- [ ] Rotate the deferred third-party credentials (model providers, OAuth
      client secrets, GitHub tokens, SMTP, k8s). Listed in the migration doc.
      Until this happens the published SOPS blob holds live values.
- [ ] Move the offsite age backup key off this host. Both private keys are
      currently in `~/.config/sops/age/`, which gives the second recipient no
      independent value.
- [ ] Destroy `/home/pluggedin/backups/rotation-*/HANDOFF.env` once the
      re-encryption has verified against production — it holds the old data
      key.
- [ ] Switch the ACME resolver in `infra/traefik/traefik.yml` back to the
      production CA if it is still pointed at staging.
- [ ] `systemctl disable pluggedin nginx` after a week of stable running.
      Keep the unit files; they are the documented rollback path.
