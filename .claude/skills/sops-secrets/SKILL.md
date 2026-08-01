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

Add the public key to the `age:` list in **`.sops.yaml` at the repo root**, then
re-wrap the data key from the repo root:

```bash
export SOPS_AGE_KEY_FILE=/etc/sops/age/keys.txt
sops updatekeys --input-type dotenv -y infra/sops/secrets.env.sops
```

`--input-type dotenv` is required here as everywhere else. Verify with the negative
test below before committing.

`.sops.yaml` must stay at the repo root. sops searches upward from the working
directory and matches `path_regex` against the path as given, so with the config
inside `infra/sops/` neither location worked — the repo root gave `Config file not
found`, and running from inside the directory found the config but matched a bare
filename and gave `no matching creation rules found`.

## Verifying who can decrypt — isolate HOME or the test lies

sops falls back to the default keyring at `~/.config/sops/age/keys.txt`. If a copy of
the deploy key is there, **every** decryption test passes, including with a key that is
not a recipient at all — a stranger key appearing to read 91 secrets is that false
positive, not a breach. That copy has since been removed from this host, but isolate
`HOME` anyway: the test should not depend on a file's continued absence.

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
| Adding a `*_FILE` secret without touching `deploy.sh` | Consumer fails closed |
