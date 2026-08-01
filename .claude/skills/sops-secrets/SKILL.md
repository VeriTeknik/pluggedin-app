---
name: sops-secrets
description: Use when adding, changing, reading or rotating a secret in infra/sops/secrets.env.sops, adding an age recipient, or when sops reports "Error unmarshalling input json", "Config file not found", or "no matching creation rules found" in this repo.
---

# SOPS secrets for plugged.in

All production secrets live encrypted in `infra/sops/secrets.env.sops`, age-encrypted
and committed to a **public** repo. `deploy.sh` decrypts them to tmpfs at deploy time.

**Core rule: every sops command on this file needs explicit dotenv types.** The
filename ends `.sops`, which sops does not recognise, so it falls back to JSON and
dies on the first `#` comment:

```
Error unmarshalling input json: invalid character '#' looking for beginning of value
```

Seeing that error means you forgot `--input-type dotenv --output-type dotenv`.

## Quick reference

| Task | Command |
|---|---|
| Read a value | `sops -d --input-type dotenv --output-type dotenv infra/sops/secrets.env.sops \| grep '^KEY='` |
| Add / change a secret | `sops --input-type dotenv --output-type dotenv infra/sops/secrets.env.sops` |
| Add an age recipient | decrypt → re-encrypt, see below |
| Apply to production | `./infra/scripts/deploy.sh` — **required**, see below |

Always `export SOPS_AGE_KEY_FILE=/etc/sops/age/keys.txt` first.

## Adding or changing a secret

```bash
export SOPS_AGE_KEY_FILE=/etc/sops/age/keys.txt
sops --input-type dotenv --output-type dotenv infra/sops/secrets.env.sops
# $EDITOR opens the decrypted content; add KEY=value; save
git commit -am "ops: add KEY"
./infra/scripts/deploy.sh
```

**The deploy is not optional.** `env_file` is read when the container is *created*.
Editing the blob without deploying changes nothing that is running, and the next
unrelated deploy will silently pick the change up — which is how a config change
gets blamed on the wrong commit.

Do **not** pre-escape `$` in values. `deploy.sh` doubles them, because Compose
interpolates `env_file` contents and would otherwise truncate the value at the
first `$` (a bcrypt hash arrives as `ops:$2b$10`). Escaping twice corrupts it.

If the new secret is consumed via `*_FILE` indirection rather than the environment
(as Traefik's dashboard auth is), add an `extract_secret` line to `deploy.sh` too —
otherwise the file it points at never appears and the consumer fails closed.

## Adding an age recipient

`sops updatekeys` does **not** work in this repo. It reads recipients from
`.sops.yaml`, and that file sits in `infra/sops/` rather than the repo root:

- run from the repo root → `Config file not found`
- run from `infra/sops/` → config found, but the path it matches against is now a
  bare filename, so `no matching creation rules found`

Until `.sops.yaml` moves to the repo root (see Known issues), re-encrypt explicitly:

```bash
export SOPS_AGE_KEY_FILE=/etc/sops/age/keys.txt
TMP=$(mktemp -p /run/user/$(id -u))          # tmpfs, never disk
sops -d --input-type dotenv --output-type dotenv infra/sops/secrets.env.sops > "$TMP"

sops --encrypt --age "<deploy-pub>,<backup-pub>,<new-pub>" \
     --input-type dotenv --output-type dotenv \
     --output infra/sops/secrets.env.sops "$TMP"

shred -uf "$TMP"
```

Then update the recipient list in `infra/sops/.sops.yaml` so it stays accurate, and
verify (below) before committing.

## Verifying who can decrypt — isolate HOME or the test lies

sops falls back to the default keyring at `~/.config/sops/age/keys.txt`. If a copy
of the deploy key is there, **every** decryption test passes, including with a key
that is not a recipient at all. A stranger key appearing to read 91 secrets is that
false positive, not a breach.

```bash
EMPTY=$(mktemp -d)
# must succeed
HOME="$EMPTY" SOPS_AGE_KEY_FILE=/etc/sops/age/keys.txt \
  sops -d --input-type dotenv --output-type dotenv infra/sops/secrets.env.sops | grep -c '^[A-Z_0-9]*='
# must print 0 and "none were successful"
HOME="$EMPTY" SOPS_AGE_KEY_FILE=/path/to/non-recipient.txt \
  sops -d --input-type dotenv --output-type dotenv infra/sops/secrets.env.sops
```

Always include the negative case. A test that only checks the happy path cannot
tell "the key works" from "the keyring rescued me".

## What is and is not protected

Only **values** are encrypted. Key **names** are plaintext in the committed file —
`grep GITHUB infra/sops/secrets.env.sops` reveals which integrations exist. Never
encode anything sensitive in a variable name.

The repo is public and git history is append-only: once pushed, that ciphertext is
public permanently, and the age private key is the only thing protecting it. Rotating
a secret later protects you from that point forward; it does not unpublish the old
blob.

## Known issues

- **`.sops.yaml` is in `infra/sops/`, so creation rules can never match.** Harmless
  today only because every encrypt in this repo passes `--age` explicitly. Moving it
  to the repo root would make `updatekeys` and plain `sops <newfile>` work.
- **A duplicate deploy key sits at `~/.config/sops/age/keys.txt`**, byte-identical to
  `/etc/sops/age/keys.txt`. It is what breaks decryption tests. Delete it; `/etc` is
  group-readable by `pluggedin`.
- **Third-party credentials in the blob are un-rotated** (provider API keys, OAuth
  client secrets, GitHub tokens, SMTP, k8s) — a deliberate deferral, tracked in
  `docs/ops/docker-traefik-sops-migration.md`.

## Common mistakes

| Mistake | Result |
|---|---|
| Omitting `--input-type dotenv` | `Error unmarshalling input json` |
| Editing the blob without `deploy.sh` | Running containers keep the old value |
| Pre-escaping `$` in a value | Doubled twice, value corrupted |
| Testing decryption without isolating `HOME` | False pass — the default keyring answers |
| Using `sops updatekeys` | Fails; see Adding an age recipient |
| Adding a `*_FILE` secret without touching `deploy.sh` | Consumer fails closed |
