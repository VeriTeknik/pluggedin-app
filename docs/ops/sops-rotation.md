# SOPS / age key rotation

Rotate the age key the production stack uses to decrypt
`infra/sops/secrets.env.sops` (and any future `infra/sops/*.sops` files).

## When to rotate

- **Quarterly drill** — even if nothing happened, prove the procedure works.
- **A laptop with the private key on it is lost or compromised.**
- **An operator with access to the private key leaves the team.**
- **The current key's algorithm has a published weakness.** (None known
  today for X25519/age; this is here for completeness.)

## Prerequisites

- `age`, `age-keygen`, and `sops` installed locally and on prod.
- The current `SOPS_AGE_KEY_FILE` (default `/etc/sops/age/keys.txt`) is
  readable.
- A working copy of the repo.

## Procedure

Run `./infra/scripts/rotate-keys.sh` and answer the prompts. The script
implements the steps below; this document is its specification.

### 1. Generate a new key on prod

```bash
sudo age-keygen -o /etc/sops/age/keys.$(date -u +%Y%m%d).txt
sudo chmod 0400 /etc/sops/age/keys.*.txt
```

The new public key (the `age1…` line in the file) is safe to commit.

### 2. Add the new public key as an additional recipient

This step does **not** remove the old key yet. Both keys can decrypt during
the transition.

```bash
NEW_PUB=$(grep -oE 'age1[a-z0-9]+' /etc/sops/age/keys.<date>.txt | head -1)
OLD_PUB=$(grep -oE 'age1[a-z0-9]+' /etc/sops/age/keys.txt        | head -1)

for f in infra/sops/*.sops; do
  sops updatekeys --age "$OLD_PUB,$NEW_PUB" -y "$f"
done

git diff infra/sops/    # the only changes should be the recipients block of each file
git commit -am "ops: rotate SOPS recipients — add $NEW_PUB"
```

### 3. Verify decryption with the new key in isolation

```bash
SOPS_AGE_KEY_FILE=/etc/sops/age/keys.<date>.txt \
  sops --decrypt infra/sops/secrets.env.sops | head
```

If this fails the rotation aborts here — nothing was destructive yet.

### 4. Switch the default key

```bash
sudo ln -sf /etc/sops/age/keys.<date>.txt /etc/sops/age/keys.txt
```

`/etc/sops/age/keys.txt` is what `deploy.sh` and the compose stack reach
for. The symlink swap is atomic; the next `deploy.sh` uses the new key.

### 5. Retire the old key

After at least one verified deploy on the new key:

```bash
for f in infra/sops/*.sops; do
  sops updatekeys --age "$NEW_PUB" -y "$f"      # remove the old recipient
done
git commit -am "ops: rotate SOPS recipients — retire $OLD_PUB"
```

### 6. Archive the old private key

Keep the old key offline for one quarter in case of a backup older than
step 4 that's still encrypted to the old recipient. Then destroy it.

```bash
sudo mv /etc/sops/age/keys.<old>.txt /var/lib/sops/archive/
```

## Disaster: lost the only copy of the current private key

Without the private key, every SOPS file is permanently unrecoverable. This
is why `.sops.yaml` lists **two** recipients: a primary on the prod host and
a secondary stored offline. To recover:

1. Restore the secondary key from offline storage to a clean host.
2. Use it to decrypt + re-encrypt every `*.sops` file with a freshly
   generated primary recipient.
3. Push the re-encrypted files. Run `deploy.sh`. Then immediately rotate
   again so the compromised state never deploys.

If neither recipient is recoverable: every secret in `secrets.env.sops`
must be regenerated and re-issued at the source (CloudFlare token,
NEXTAUTH_SECRET, every API key, the PG password). Plan for ~half a day of
secret rotation across the platform.

## Audit trail

`updatekeys` writes a change to the file's `sops` metadata block. The git
history of `infra/sops/` is the canonical record of who held which key
when.
