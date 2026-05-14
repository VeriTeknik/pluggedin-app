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

3. **Verify**:

   ```bash
   systemctl status actions.runner.VeriTeknik-pluggedin-app.*.service
   # and on the GitHub UI: the runner appears as "online" under Settings → Actions → Runners.
   ```

4. **Trigger a test build** of the current branch:

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

## Security notes

- The runner is a regular process with the `pluggedin` user's permissions.
  Anything that pluggedin can do, a malicious workflow run from this
  runner can do — including reading the workspace, the SOPS-decrypted
  secrets under `/run/sops`, and the docker socket. **Don't run forks'
  PRs on this runner.** GitHub blocks that by default for self-hosted
  runners attached to public repos; verify the repo's
  Settings → Actions → "Fork pull request workflows" is still set to
  the safe default.
- The runner pulls workflow code at job-start. Code execution comes from
  whatever ref the workflow is dispatched on. Treat write access to the
  repo as effectively root on this host.
- Rotate the runner if the host is ever suspected compromised: stop the
  service, `./config.sh remove`, register again with a fresh token.
