#!/usr/bin/env bash
# Move the self-hosted Actions runner off the `pluggedin` account and onto a
# dedicated user with a ROOTLESS Docker daemon.
#
#   sudo bash infra/scripts/isolate-gha-runner.sh
#
# WHY ROOTLESS, and why "separate user" alone is not enough:
#
#   The runner executes workflow code on the production host. Today it runs as
#   `pluggedin`, which can read /etc/sops/age/keys.txt (mode 0440 root:pluggedin),
#   read /run/sops/secrets.env in plaintext, and is in the `docker` group.
#
#   Moving it to a new user in the `docker` group closes the first two and
#   NOTHING else, because the docker group is root-equivalent:
#
#       docker run -v /etc/sops/age:/host:ro alpine cat /host/keys.txt
#
#   That one line defeats the whole exercise, and it is available to any member
#   of the group. Verified on this host before writing this script.
#
#   A rootless daemon has no such escape: it runs as the runner user inside a
#   user namespace, so a container it starts cannot read files that user cannot
#   read. That is a real boundary rather than a cosmetic one.
#
# The build still works: buildx runs fine rootless, the image is pushed to GHCR,
# and the production stack keeps using the system daemon as before.
#
# NOT a substitute for moving the runner to a separate machine. It removes the
# secret-and-root exposure; it does not remove the runner's presence on the box
# that serves production. Treat it as the interim step it is.

set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "run me with sudo" >&2; exit 1; }

RUNNER_USER="${RUNNER_USER:-ghrunner}"
OLD_HOME="/home/pluggedin/actions-runner"
NEW_HOME="/home/${RUNNER_USER}/actions-runner"

command -v dockerd-rootless-setuptool.sh >/dev/null \
  || { echo "docker-ce-rootless-extras missing; apt-get install -y docker-ce-rootless-extras" >&2; exit 1; }

echo "==> 1. stop and unregister the existing runner"
OLD_SVC=$(systemctl list-units --all --plain --no-legend 'actions.runner.*' | awk '{print $1}' | head -1)
if [ -n "$OLD_SVC" ]; then
  systemctl stop "$OLD_SVC" || true
  if [ -x "${OLD_HOME}/svc.sh" ]; then ( cd "$OLD_HOME" && ./svc.sh uninstall ) || true; fi
  echo "    stopped ${OLD_SVC}"
fi
cat <<'MSG'
    NOTE: the old runner is still registered with GitHub. Remove it at
    Settings -> Actions -> Runners, or run, as pluggedin:
      cd /home/pluggedin/actions-runner && ./config.sh remove --token <REMOVE_TOKEN>
    A fresh registration token is needed below either way; tokens expire in 1h.
MSG

echo "==> 2. create ${RUNNER_USER} — deliberately NOT in the docker group"
if ! id -u "$RUNNER_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$RUNNER_USER"
fi
# Lingering lets the rootless daemon run without an active login session.
loginctl enable-linger "$RUNNER_USER"
# Subuid/subgid ranges are what make the user namespace possible.
grep -q "^${RUNNER_USER}:" /etc/subuid || usermod --add-subuids 200000-265535 "$RUNNER_USER"
grep -q "^${RUNNER_USER}:" /etc/subgid || usermod --add-subgids 200000-265535 "$RUNNER_USER"

echo "==> 3. confirm the isolation actually holds"
fail=0
sudo -u "$RUNNER_USER" test -r /etc/sops/age/keys.txt && { echo "    FAIL: can read the age key"; fail=1; } || echo "    ok: cannot read /etc/sops/age/keys.txt"
sudo -u "$RUNNER_USER" test -r /run/sops/secrets.env && { echo "    FAIL: can read decrypted secrets"; fail=1; } || echo "    ok: cannot read /run/sops/secrets.env"
id -nG "$RUNNER_USER" | tr ' ' '\n' | grep -qx docker && { echo "    FAIL: in the docker group — this defeats the point"; fail=1; } || echo "    ok: not in the docker group"
[ "$fail" -eq 0 ] || { echo "isolation checks failed; not continuing" >&2; exit 1; }

echo "==> 4. install the rootless docker daemon for ${RUNNER_USER}"
sudo -u "$RUNNER_USER" XDG_RUNTIME_DIR="/run/user/$(id -u "$RUNNER_USER")" \
  dockerd-rootless-setuptool.sh install --skip-iptables || {
    echo "    rootless install failed — see the output above" >&2; exit 1; }

echo "==> 5. install the runner under ${RUNNER_USER}"
cat <<MSG

    Finish as ${RUNNER_USER}, with a fresh registration token from
    Settings -> Actions -> Runners -> New self-hosted runner:

      sudo -iu ${RUNNER_USER}
      mkdir -p ${NEW_HOME} && cd ${NEW_HOME}
      curl -fsSL -o runner.tar.gz \\
        https://github.com/actions/runner/releases/download/v2.328.0/actions-runner-linux-x64-2.328.0.tar.gz
      tar xzf runner.tar.gz && rm runner.tar.gz
      export DOCKER_HOST=unix:///run/user/\$(id -u)/docker.sock
      ./config.sh --url https://github.com/VeriTeknik/pluggedin-app \\
                  --token <REGISTRATION_TOKEN> \\
                  --labels self-hosted,linux,x64,plugged-in-prod \\
                  --unattended
      sudo ./svc.sh install ${RUNNER_USER} && sudo ./svc.sh start

    DOCKER_HOST must be set for the service too, or the build will talk to the
    system daemon and undo the isolation. After ./svc.sh install:

      sudo systemctl edit actions.runner.*.service
      # [Service]
      # Environment=DOCKER_HOST=unix:///run/user/<UID>/docker.sock

    Then push any branch and confirm the build job runs and pushes to GHCR.
MSG

echo
echo "==> done. Old runner directory left at ${OLD_HOME} for rollback; remove it"
echo "    once the new runner has completed a green build."
