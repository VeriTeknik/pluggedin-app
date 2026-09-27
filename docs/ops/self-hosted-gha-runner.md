# Self-hosted GitHub Actions runner

A self-hosted runner on the prod host lets CI build the docker image
without hitting the SIGILL footgun that bit us on standard GitHub-hosted
runners. The `@zvec/zvec` binding's SIMD code paths require AVX2/AVX-512
that the prod CPU has and Actions runners sometimes don't.

The runner is provisioned by `infra/scripts/isolate-gha-runner.sh`. It runs
as a dedicated account (`ghrunner` by default, `RUNNER_USER` to override)
that is **not** in the `docker` group and has **no** sudo rights, and it
builds with that account's own **rootless** Docker daemon. It installs under
`/home/ghrunner/actions-runner/`, registers as `ghrunner-rootless` with the
`VeriTeknik/pluggedin-app` repo, and carries the labels
`self-hosted, linux, x64, plugged-in-prod`. The `build` job's `runs-on:`
targets that set.

`infra/scripts/setup-gha-runner.sh` is **retired**: it ran the runner as the
`pluggedin` deploy account, in the system `docker` group, which handed every
workflow the SOPS age key, the decrypted secrets and root on the host. It now
prints a pointer to `isolate-gha-runner.sh` and exits non-zero. Do not
resurrect it, and never add a runner account to the `docker` group: the
system Docker socket is root-equivalent
(`docker run -v /etc/sops/age:/host:ro alpine cat /host/keys.txt`).

## One-time setup

1. **Install the prerequisites** (the script checks for them first and
   changes nothing if any are missing):

   ```bash
   sudo apt-get update
   sudo apt-get install -y docker-ce-rootless-extras uidmap rootlesskit
   ```

   Unprivileged user namespaces must be enabled. `fuse-overlayfs` is only
   needed on kernels older than 5.11; without it there the rootless daemon
   falls back to the slow `vfs` storage driver.

2. **Get a registration token.** Open
   <https://github.com/VeriTeknik/pluggedin-app/settings/actions/runners/new>
   on a browser logged in as a repo admin. Pick **Linux** → **x64**.
   Copy the `--token …` value from the displayed `./config.sh` line. The
   token is single-use and expires in an hour.

3. **Run the isolation script as root on the prod host:**

   ```bash
   cd /home/pluggedin/pluggedin-app
   sudo RUNNER_TOKEN=<token from step 2> bash infra/scripts/isolate-gha-runner.sh
   ```

   What it does, in order:

   1. Stops every `actions.runner.VeriTeknik-pluggedin-app.*` unit and removes
      the old runner's unit (with `systemctl`/`rm`, never by running the old
      runner's `svc.sh` as root). The old registration stays on GitHub — remove
      it under Settings → Actions → Runners, or as `pluggedin`:
      `cd /home/pluggedin/actions-runner && ./config.sh remove --token <REMOVE_TOKEN>`.
      The old directory is kept for rollback.
   2. Creates the runner account, enables lingering, and allocates free
      subuid/subgid ranges.
   3. Verifies the account cannot read `/etc/sops/age/keys.txt` or
      `/run/sops/secrets.env` and is not in the `docker` group — and stops if
      any of that fails.
   4. Installs the rootless Docker daemon for the account.
   5. Downloads and registers the runner **as the runner account**
      (`RUNNER_VERSION`, default in the script; optional
      `RUNNER_TARBALL_SHA256` pin), then writes the systemd unit
      `actions.runner.VeriTeknik-pluggedin-app.ghrunner-rootless.service` from
      a fixed template (root-owned, 0644) plus a drop-in setting
      `DOCKER_HOST=unix:///run/user/<uid>/docker.sock`.
   6. Verifies the unit is active, that it points at the rootless daemon, and
      that the rootless daemon **cannot** read the age key.

   Re-running is safe. If the runner is already registered (`.runner`
   exists) the registration is kept and only the unit is rewritten; no token
   is needed in that case.

4. **Verify** (the script already did; this is the manual equivalent):

   ```bash
   systemctl status actions.runner.VeriTeknik-pluggedin-app.ghrunner-rootless.service
   systemctl show actions.runner.VeriTeknik-pluggedin-app.ghrunner-rootless.service -p Environment
   #   → must contain DOCKER_HOST=unix:///run/user/<uid>/docker.sock
   id -nG ghrunner
   #   → must NOT contain docker
   ```

   On the GitHub UI the runner appears as "online" under
   Settings → Actions → Runners. Remove the stale `pluggedin` runner there
   once a build has gone green.

5. **Trigger a test build** of `main` (a manual dispatch of `main` or a
   `v*` tag is the only non-push event that reaches this runner):

   ```bash
   gh workflow run build-image.yml --ref main
   gh run watch
   ```

   First image build takes 4–6 min (no warm cache yet); subsequent ones
   are ~2 min thanks to the registry-cache mounts in the workflow.

## Day-2 operations

- **Logs**: `journalctl -u actions.runner.VeriTeknik-pluggedin-app.ghrunner-rootless.service -f`,
  and `/home/ghrunner/actions-runner/_diag/`.
- **Update**: GitHub auto-updates the runner agent. To reinstall a specific
  version, stop the service, run `./config.sh remove --token <REMOVE_TOKEN>`
  **as `ghrunner`**, then re-run the script with a fresh registration token
  and `RUNNER_VERSION=<version>` (and ideally `RUNNER_TARBALL_SHA256`).
- **Rewrite the unit only** (e.g. after the script changed): re-run the
  script; an existing registration is kept.
- **De-register**: `sudo systemctl disable --now
  actions.runner.VeriTeknik-pluggedin-app.ghrunner-rootless.service`, then
  as `ghrunner` `cd ~/actions-runner && ./config.sh remove --token <REMOVAL_TOKEN>`,
  then as root remove the unit file and its `.d/` drop-in from
  `/etc/systemd/system/`, `systemctl daemon-reload`, and
  `rm -rf /home/ghrunner/actions-runner`.

## Why labels, not the bare `self-hosted`

A repo can have many self-hosted runners — staging, ARM, etc. Pinning
the workflow to the explicit label set `[self-hosted, linux, x64,
plugged-in-prod]` means our build never accidentally runs on the wrong
host. Add more runners under the same label to scale; remove the label
to take a runner out of rotation without de-registering it.

Labels are **scheduling selectors, not authorization**: any workflow that
can run in this repo can ask for them. What keeps untrusted code off the
runner is the workflow and platform configuration below.

## Security — required posture

This is a **persistent self-hosted runner on a public repo's production
host**. GitHub warns explicitly against this setup because a fork PR can run
arbitrary code on the runner. We carry that risk because the alternative is
GitHub-hosted runners that SIGILL on the zvec binding's SIMD instructions;
the trade is conscious but only acceptable with every guard below in place.

### Defense in depth

1. **The self-hosted job never runs for pull requests**
   (`.github/workflows/build-image.yml`). The `build` job runs only for
   pushes (`main` and `v*` tags) and for manual dispatches of `main` or a
   `v*` tag:

   ```yaml
   if: >-
     github.event_name == 'push' ||
     (github.event_name == 'workflow_dispatch' &&
      (github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')))
   ```

   Pull requests (including forks) and dispatches of any other branch are
   built by the `pr-build` job on a throwaway GitHub-hosted `ubuntu-24.04`
   VM: load-only, nothing pushed, registry cache read but never written, so a
   PR cannot poison what `build` ships.

   The old guard (`github.event.pull_request.head.repo.full_name ==
   github.repository`) is gone on purpose. For `pull_request` events GitHub
   evaluates the workflow file from the PR's merge ref, so a fork can simply
   delete that `if:` — or add its own job with these runner labels. Nothing
   written in the workflow file can stop that; only the platform controls in
   the next item can.

2. **Platform controls in the GitHub UI** — required. Verify in
   <https://github.com/VeriTeknik/pluggedin-app/settings/actions>:

   - **Approval for running fork pull request workflows from
     contributors**: `Require approval for all external contributors`.
     Never approve a fork run whose diff touches `.github/`.
   - **Workflow permissions**: `Read repository contents and packages
     permissions` (least privilege). Individual jobs re-grant what they
     need.
   - **Allow GitHub Actions to create and approve pull requests**:
     unchecked.
   - **Preferably**, register the runner in an organisation runner group
     restricted to "Selected workflows":
     `VeriTeknik/pluggedin-app/.github/workflows/build-image.yml@refs/heads/main`,
     so no other workflow file or ref can schedule onto it at all. (Tag
     builds run on this runner too; if they must keep working, the allowed
     list has to cover those refs as well — decide that deliberately.)

3. **Token least-privilege** at the workflow level:

   ```yaml
   permissions:
     contents: read
   ```

   `build` re-grants `packages: write`; `pr-build` gets `packages: read`
   only (for the cache); other jobs inherit read-only. `build` checks out
   with `persist-credentials: false` so the token is not left in
   `.git/config` on a persistent runner.

4. **Runner isolation** (automated by `infra/scripts/isolate-gha-runner.sh`):
   - Dedicated `ghrunner` account: not `pluggedin`, not in the `docker`
     group, no sudo rights.
   - Rootless Docker daemon owned by that account; a container it starts
     cannot read files the account cannot read. The script verifies the
     account (and its daemon) cannot read the SOPS age key or
     `/run/sops/secrets.env`.
   - The systemd unit and its `DOCKER_HOST` drop-in are written by root from
     a fixed template; root never executes the runner's own `svc.sh` or
     anything else from a runner-writable directory.
   - Watch the journal periodically for unexpected jobs.

   This removes the secret-and-root exposure. It does **not** remove the
   runner's presence on the machine that serves production (shared kernel,
   local network reach) — treat it as the interim step it is.

### Manual checks before every release

- `gh api repos/VeriTeknik/pluggedin-app/actions/permissions` confirms
  `default_workflow_permissions: read` (write should never appear
  here unless a job opts in).
- `gh api repos/VeriTeknik/pluggedin-app/actions/runners` returns
  exactly the runners you expect — `ghrunner-rootless`, `online`, no stale
  `pluggedin` entry.
- On the host: `id -nG ghrunner` does not list `docker`, and the unit's
  environment still carries the rootless `DOCKER_HOST`.

### If the host is ever suspected compromised

1. Stop the runner service: `sudo systemctl stop
   actions.runner.VeriTeknik-pluggedin-app.*.service`.
2. De-register: as `ghrunner`, `cd ~/actions-runner && ./config.sh
   remove --token <REMOVAL_TOKEN_FROM_SETTINGS>`.
3. Rotate every secret reachable from the host: all entries in
   `infra/sops/secrets.env.sops`, the PostgreSQL password, NEXTAUTH_SECRET,
   API_KEY_ENCRYPTION_SECRET, every API token. The isolation makes the
   secrets unreadable to the runner account, not to an attacker who escaped
   it — rotate anyway. The SOPS-rotation runbook covers the SOPS side;
   non-SOPS secrets need rotation at their respective consoles
   (CloudFlare, Gemini, etc.).
4. Re-image the host if confidence in cleanup isn't high. The
   `infra/scripts/restore.sh` script is the path back from a backup.

### Long-term hardening

The right answer for a public repo with native deps is **not** "runner
on the prod host". Better topology:

- **A separate build host** with the same CPU profile but no prod
  credentials. Build images there, push to GHCR, deploy elsewhere.
  Reduces blast radius from "the prod box" to "throwaway builder VM".
- **Ephemeral runners** (Actions Runner Controller on K8s, or
  GitHub's `runs-on` SaaS) that disappear after each job. No
  long-lived state for a compromise to survive in.

Tracked as a follow-up. The current posture is acceptable for now
because (a) only code already on a protected ref (`main`, `v*` tags) is
scheduled onto the runner by this workflow, with fork runs gated by the
approval setting, and (b) the runner account can reach neither the
production secrets nor root through Docker.
