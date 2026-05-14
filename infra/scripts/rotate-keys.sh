#!/usr/bin/env bash
# SOPS / age key rotation.
#
# Steps the operator through:
#   1. Generate a new age key.
#   2. Add it as an additional recipient to every encrypted file under
#      infra/sops/ (so old + new can decrypt).
#   3. Verify decryption works with the new key.
#   4. Remove the old recipient.
#   5. Print backup instructions for the new private key.
#
# Run from anywhere; this script cd's to repo root.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOPS_DIR="${REPO_ROOT}/infra/sops"
KEY_DIR="${KEY_DIR:-/etc/sops/age}"
NEW_KEY="${KEY_DIR}/keys.$(date -u +%Y%m%d).txt"

command -v sops    >/dev/null || { echo "sops not installed" >&2; exit 1; }
command -v age     >/dev/null || { echo "age not installed" >&2; exit 1; }
command -v age-keygen >/dev/null || { echo "age-keygen not installed" >&2; exit 1; }

read -rp "Generate new age key at ${NEW_KEY}? [y/N] " ans
[ "$ans" = "y" ] || { echo "aborted"; exit 1; }
sudo mkdir -p "$KEY_DIR"
sudo age-keygen -o "$NEW_KEY"
sudo chmod 0400 "$NEW_KEY"
NEW_PUB=$(sudo grep -oE 'age1[a-z0-9]+' "$NEW_KEY" | head -1)
echo "[rotate] new public key: $NEW_PUB"

OLD_KEY="${SOPS_AGE_KEY_FILE:-/etc/sops/age/keys.txt}"
[ -r "$OLD_KEY" ] || { echo "[rotate] old key $OLD_KEY missing; nothing to rotate from" >&2; exit 1; }
OLD_PUB=$(sudo grep -oE 'age1[a-z0-9]+' "$OLD_KEY" | head -1)
echo "[rotate] current public key: $OLD_PUB"

echo
echo "[rotate] step 1: re-encrypt every SOPS file with the new recipient added"
find "$SOPS_DIR" -type f \( -name '*.env.sops' -o -name '*.yaml.sops' -o -name '*.yml.sops' -o -name '*.json.sops' \) \
  -print0 | while IFS= read -r -d '' f; do
    sops updatekeys --age "$OLD_PUB,$NEW_PUB" -y "$f"
  done

echo
echo "[rotate] step 2: decrypt one file with the *new* key only, as a sanity check"
SOPS_AGE_KEY_FILE="$NEW_KEY" sops --decrypt "${SOPS_DIR}/secrets.env.sops" > /dev/null
echo "[rotate]   ok"

echo
read -rp "[rotate] step 3: now retire the old key (remove from recipients)? [y/N] " ans
if [ "$ans" = "y" ]; then
  find "$SOPS_DIR" -type f \( -name '*.env.sops' -o -name '*.yaml.sops' -o -name '*.yml.sops' -o -name '*.json.sops' \) \
    -print0 | while IFS= read -r -d '' f; do
      sops updatekeys --age "$NEW_PUB" -y "$f"
    done
  echo "[rotate]   old key removed from recipients."
  echo "[rotate]   make $NEW_KEY the default by symlinking:"
  echo "[rotate]     sudo ln -sf $NEW_KEY /etc/sops/age/keys.txt"
fi

echo
echo "[rotate] BACK UP THE NEW PRIVATE KEY OFFLINE:"
echo "[rotate]   $NEW_KEY"
echo "[rotate] anything encrypted by the new public key cannot be decrypted without it."
