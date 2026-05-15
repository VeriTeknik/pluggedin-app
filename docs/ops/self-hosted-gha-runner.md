# Self-hosted GitHub Actions runner

A self-hosted runner on the prod host lets CI build the docker image
without hitting the SIGILL footgun that bit us on standard GitHub-hosted
runners. The `@zvec/zvec` binding's SIMD code paths require AVX2/AVX-512
that the prod CPU has and Actions runners sometimes don't.

The runner installs under `/home/pluggedin/actions-runner/`, runs as the
`pluggedin` user (same as the app), and registers with the
`VeriTeknik/pluggedin-app` repo with the labels
`self-hosted, linux, x64, plugged-in-prod`. The image-build workflow's
`runs-on:` already targets that set.

## One-time setup

1. **Get a registration token.** Open
   <https://github.com/VeriTeknik/pluggedin-app/settings/actions/runners/new>
   on a browser logged in as a repo admin. Pick **Linux** → **x64**.
   Copy the `--token …` value from the displayed `./config.sh` line. The
   token is single-use and expires in an hour.

2. **Run the setup script as the `pluggedin` user on the prod host:**

   ```bash
   ssh pluggedin@prod-host
   cd /home/pluggedin/pluggedin-app
   RUNNER_TOKEN=<token from step 1> infra/scripts/setup-gha-runner.sh
   ```

   The script downloads the runner tarball into
   `/home/pluggedin/actions-runner/`, registers with GitHub, and installs
   a systemd unit (`actions.runner.VeriTeknik-pluggedin-app.<host>.service`).
   `sudo` is required for the systemd-install step only; passing
   `NO_SYSTEMD=1` to the script lets you skip that and run
   `./run.sh` under your own supervision.

3. **Docker socket access** (one-time, only needed if the setup script's
   automatic add was skipped or `pluggedin` is somehow not in the `docker`
   group). `setup-buildx-action` talks to `/var/run/docker.sock`, which is
   `root:docker` 660; the runner user must be in the `docker` group or
   every build dies with `permission denied while trying to connect to
   the docker API`.

   ```bash
   sudo usermod -aG docker pluggedin
   sudo systemctl restart actions.runner.VeriTeknik-pluggedin-app.*.service
   ```

   The group change only takes effect after the runner process is
   restarted — the runsvc.sh shell inherits the old supplementary groups
   otherwise.

4. **Verify**:

   ```bash
   systemctl status actions.runner.VeriTeknik-pluggedin-app.*.service
   # and on the GitHub UI: the runner appears as "online" under Settings → Actions → Runners.
   ```

5. **Trigger a test build** of the current branch:

   ```bash
   gh workflow run build-image.yml --ref main
   gh run watch
   ```

   First image build takes 4–6 min (no warm cache yet); subsequent ones
   are ~2 min thanks to the registry-cache mounts in the workflow.

## Day-2 operations

- **Logs**: `journalctl -u actions.runner.VeriTeknik-pluggedin-app.<host>.service -f`,
  and `/home/pluggedin/actions-runner/_diag/`.
- **Update**: GitHub auto-updates the runner agent. If it ever falls
  behind for some reason, stop the service, run `./config.sh remove`,
  bump `RUNNER_VERSION` in `infra/scripts/setup-gha-runner.sh`, and
  re-run the script with a fresh registration token.
- **De-register**: stop the service, `./config.sh remove --token <REMOVAL_TOKEN>`,
  then `rm -rf /home/pluggedin/actions-runner`.

## Why labels, not the bare `self-hosted`

A repo can have many self-hosted runners — staging, ARM, etc. Pinning
the workflow to the explicit label set `[self-hosted, linux, x64,
plugged-in-prod]` means our build never accidentally runs on the wrong
host. Add more runners under the same label to scale; remove the label
to take a runner out of rotation without de-registering it.

## Security — required posture

This is a **self-hosted runner on a public repo's production host**. GitHub
warns explicitly against this setup because a fork PR can run arbitrary
code on the runner. The threat is real and the consequences here are
specifically: SOPS-decrypted secrets (when present in `/run/sops`),
PostgreSQL credentials, the docker socket, and the entire prod state
become accessible to whatever the workflow runs. We carry that risk
because the alternative is GitHub-hosted runners that SIGILL on the
zvec binding's SIMD instructions; the trade is conscious but only
acceptable with every guard below in place.

### Defense in depth

1. **Workflow-level fork guard** (in `.github/workflows/build-image.yml`):

   ```yaml
   if: >-
     github.event_name != 'pull_request' ||
     github.event.pull_request.head.repo.full_name == github.repository
   ```

   PRs from forks skip the `build` job entirely. The build never runs
   on untrusted code unless someone with push access to the repo opens
   the PR from an internal branch.

2. **Repo-level approval gate** in GitHub UI. Verify in
   <https://github.com/VeriTeknik/pluggedin-app/settings/actions>:

   - **Fork pull request workflows from outside collaborators**:
     `Require approval for all outside collaborators` (most strict).
   - **Workflow permissions**: `Read repository contents and packages
     permissions` (least privilege). Individual jobs re-grant
     `packages: write` where needed.
   - **Allow GitHub Actions to create and approve pull requests**:
     unchecked.

3. **Token least-privilege** at the workflow level:

   ```yaml
   permissions:
     contents: read
   ```

   The build job re-grants `packages: write` explicitly. Other jobs
   inherit read-only.

4. **Runner sandboxing** (operational, not yet automated):
   - Runner registered with **a labelled allow-list**, not bare
     `self-hosted`. Other workflows in the repo can't accidentally
     land on this host.
   - Service runs as the `pluggedin` user; the user is in the `docker`
     group, but no `sudo` rights for the runner specifically. (The
     setup script needed sudo only for `svc.sh install`; the running
     service never invokes sudo.)
   - Logs at `/home/pluggedin/actions-runner/_diag/` and via
     `journalctl -u actions.runner.…`. Watch the journal periodically
     for unexpected jobs.

### Manual checks before every release

- `gh api repos/VeriTeknik/pluggedin-app/actions/permissions` confirms
  `default_workflow_permissions: read` (write should never appear
  here unless a job opts in).
- `gh api repos/VeriTeknik/pluggedin-app/actions/runners` returns
  exactly the runners you expect — no stale entries, all `online`.

### If the host is ever suspected compromised

1. Stop the runner service: `sudo systemctl stop
   actions.runner.VeriTeknik-pluggedin-app.*.service`.
2. De-register: `cd /home/pluggedin/actions-runner && ./config.sh
   remove --token <REMOVAL_TOKEN_FROM_SETTINGS>`.
3. Rotate every secret reachable from the host: all entries in
   `infra/sops/secrets.env.sops`, the PostgreSQL password, NEXTAUTH_SECRET,
   API_KEY_ENCRYPTION_SECRET, every API token. The SOPS-rotation
   runbook covers the SOPS-side; non-SOPS secrets need rotation at
   their respective consoles (CloudFlare, Gemini, etc.).
4. Re-image the host if confidence in cleanup isn't high. The
   `infra/scripts/restore.sh` script is the path back from a backup.

### Long-term hardening (out of scope for the initial migration)

The right answer for a public repo with native deps is **not** "runner
on the prod host". Better topology:

- **A separate build host** with the same CPU profile but no prod
  credentials. Build images there, push to GHCR, deploy elsewhere.
  Reduces blast radius from "all of prod" to "throwaway builder VM".
- **Ephemeral runners** (Actions Runner Controller on K8s, or
  GitHub's `runs-on` SaaS) that disappear after each job. No
  long-lived state for a compromise to survive in.

Tracked as a follow-up. The current posture is acceptable for now
because (a) the fork guard makes the threat surface "internal PRs
from people with push access", which is the same trust boundary as
direct pushes to main, and (b) the prod box doesn't run anything
internet-exposed beyond what nginx already proxies.
