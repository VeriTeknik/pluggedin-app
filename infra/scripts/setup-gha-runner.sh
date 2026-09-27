#!/usr/bin/env bash
# RETIRED. Use infra/scripts/isolate-gha-runner.sh instead:
#
#   sudo RUNNER_TOKEN=<token> bash infra/scripts/isolate-gha-runner.sh
#
# (token: Settings → Actions → Runners → New self-hosted runner; valid ~1h)
#
# This script used to install the self-hosted runner for
# .github/workflows/build-image.yml as the `pluggedin` account — the account
# that deploys production. That handed every workflow the runner executes:
#
#   - production secrets: `pluggedin` can read the SOPS age key
#     (/etc/sops/age/keys.txt) and the decrypted /run/sops/secrets.env;
#   - root: it added the account to the `docker` group, and the system Docker
#     socket is root-equivalent (`docker run -v /:/host ...`);
#   - root again, later: it ran the runner's own svc.sh with sudo, from a
#     directory the runner account can rewrite.
#
# isolate-gha-runner.sh provisions the runner as a dedicated account that is
# NOT in the docker group, gives it a rootless Docker daemon, verifies it
# cannot read the age key or the decrypted secrets, and installs the systemd
# unit with its own root-owned code instead of the runner's svc.sh.
#
# This file stays so existing links and runbooks land somewhere useful. It
# changes nothing and always exits non-zero.

set -euo pipefail

cat >&2 <<'MSG'
[setup-runner] FATAL: this installer is retired. It ran the Actions runner as
the production deploy account, in the system docker group — giving any
workflow the production secrets and root on the host.

Provision the runner with the isolated installer instead (as root):

  sudo RUNNER_TOKEN=<registration token> bash infra/scripts/isolate-gha-runner.sh

It creates a dedicated unprivileged runner account with a rootless Docker
daemon and verifies that account cannot read the age key or /run/sops.
Nothing has been changed.
MSG
exit 1
