# `infra/` — production stack

Everything in this directory together defines how `plugged.in` runs in
production. There is no other source of truth; if you change deployment,
change it here.

> Background, decisions, and the full migration plan from the native
> nginx+systemd stack live in
> [`docs/ops/docker-traefik-sops-migration.md`](../docs/ops/docker-traefik-sops-migration.md).
> Read that first if you've never touched this stack.

## Layout

```
infra/
├── docker-compose.yml     # the stack (traefik, app, postgres, redis, ofelia)
├── Dockerfile             # at repo root, not here — single image for the prod app
├── postgres/init.sql      # extensions + privilege tightening, runs once on first start
├── traefik/
│   ├── traefik.yml        # static config (entrypoints, ACME, providers)
│   └── dynamic/middlewares.yml   # hot-reloaded middleware + dashboard router
├── sops/
│   ├── .sops.yaml         # creation rules — which age recipients encrypt what
│   ├── secrets.env.sops   # encrypted; the only env source for the running stack
│   └── secrets.env.sops.example   # template to copy at Phase 0
├── ofelia/config.ini      # cron schedules — replaces /etc/crontab
└── scripts/
    ├── deploy.sh          # decrypt → pull → up → verify
    ├── build.sh           # local image build (CI does the official one)
    ├── verify.sh          # smoke test, runs the "GSLB" RAG canary
    ├── backup.sh          # PG + zvec + uploads → age-encrypted tarball
    ├── restore.sh         # inverse of backup
    ├── cutover-from-native.sh   # the one-time Phase-5 dance
    └── rotate-keys.sh     # age key rotation
```

## Host prerequisites (one-time)

```bash
# Docker Engine ≥ 24, compose plugin
docker version
docker compose version

# SOPS + age
sudo apt-get install -y age
curl -fsSL https://github.com/getsops/sops/releases/download/v3.9.4/sops_3.9.4_amd64.deb -o /tmp/sops.deb
sudo dpkg -i /tmp/sops.deb

# age key for SOPS decryption
sudo mkdir -p /etc/sops/age
sudo age-keygen -o /etc/sops/age/keys.txt
sudo chmod 0400 /etc/sops/age/keys.txt
# Add the public key (`age1...`) to infra/sops/.sops.yaml
# BACK UP THE PRIVATE KEY OFFLINE.

# UID/GID alignment for bind-mounted host dirs.
# The container's `app` user is uid 1001 / gid 1001.
sudo chown -R 1001:1001 /home/pluggedin/zvec-data /home/pluggedin/uploads /var/log/pluggedin
# /var/mcp-packages is 88 GiB — only chown if it isn't already.
```

## Day-2 ops

### Deploy a new release

```bash
cd /opt/pluggedin-stack            # or wherever this repo is checked out
git pull
./infra/scripts/deploy.sh
```

`deploy.sh` is idempotent and re-runnable. If a smoke test fails, the deploy
exits non-zero before swapping; nothing is left in a half-deployed state.

### Edit a secret

```bash
sops infra/sops/secrets.env.sops    # $EDITOR opens the decrypted content
git commit -am "ops: rotate FOO"
./infra/scripts/deploy.sh
```

The decrypted file never touches disk in the encrypted-at-rest sense; SOPS
writes it back encrypted on save. At deploy time the script decrypts into
`/run/sops/` (tmpfs) and removes it on exit.

### Read logs

```bash
docker compose -f infra/docker-compose.yml logs -f --tail=200 pluggedin-app
# or, since /var/log/pluggedin is still bind-mounted into the container:
tail -f /var/log/pluggedin/pluggedin_app.log
```

### Take a backup

```bash
./infra/scripts/backup.sh                       # → /var/backups/pluggedin/<ts>.tar.age
./infra/scripts/backup.sh --dest s3://my-bucket # also upload
```

A cron entry in `infra/ofelia/config.ini` runs this nightly at 02:30 UTC.

### Restore a backup

```bash
./infra/scripts/restore.sh /var/backups/pluggedin/20260514T030000Z.tar.age
```

Refuses to run against a non-empty target unless you pass `--force`.

### Rotate the age key

See [`docs/ops/sops-rotation.md`](../docs/ops/sops-rotation.md) for the full
procedure. tl;dr `./infra/scripts/rotate-keys.sh`.

### Roll back to the native stack (emergency)

```bash
docker compose -f infra/docker-compose.yml stop traefik
sudo systemctl start nginx pluggedin
```

DNS doesn't change; Traefik and nginx both terminated on the same host IP.
Anything written to the containerised PG since cutover lives in
`/var/backups/pluggedin/cutover-delta-*.sql` for re-apply if needed.

## Bringing a new env var into the stack

1. Edit `infra/sops/secrets.env.sops` (`sops` opens an editor).
2. If the value is non-secret and you want it visible in compose config,
   add it to `services.pluggedin-app.environment` in
   `docker-compose.yml` instead.
3. If the app reads it at runtime via `process.env.FOO`, nothing else to
   do — `env_file:` makes it available.
4. `./infra/scripts/deploy.sh`.

## Don't do this

- **Don't put secrets in `docker-compose.yml`'s `environment:` block.**
  That ends up in `docker inspect`, in `compose config`, and in shell
  history. Always go through `secrets.env.sops`.
- **Don't bind-mount `/run/sops` writable.** It's tmpfs intentionally; the
  decrypted file should die with the deploy.
- **Don't `docker compose down -v`.** The `-v` flag drops named volumes
  including `pgdata`. If you have to fully reset the stack, take a backup
  first.
- **Don't edit `infra/sops/secrets.env.sops` with a normal text editor.**
  It's encrypted. Always go through `sops`.
