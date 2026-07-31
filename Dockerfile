# Plugged.in production image.
#
# Multi-stage. Debian *trixie*-slim (not bookworm) because the
# @zvec/bindings-linux-x64 prebuilt .node requires GLIBC ≥ 2.38 and
# GLIBCXX ≥ 3.4.32. Bookworm ships GLIBC 2.36 — dlopen of the binding
# fails there, but zvec's own catch block masks the dlopen error and
# rethrows the generic "Prebuilt binary not found for linux-x64",
# which sent a previous build down the wrong rabbit hole. Trixie has
# GLIBC 2.41.
#
# Build:  infra/scripts/build.sh
# Tag:    ghcr.io/veriteknik/pluggedin-app:{latest,sha-XXXX}

# ─── stage 1: deps + build ────────────────────────────────────────────
FROM node:22-trixie-slim AS builder

ENV PNPM_HOME=/root/.local/share/pnpm \
    PATH=/root/.local/share/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ git ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.5.1 --activate

WORKDIR /app

# pnpm-workspace.yaml is REQUIRED here: pnpm 11 reads overrides, supportedArchitectures
# and onlyBuiltDependencies from it (the package.json `pnpm` field is no longer read).
# Without it, `pnpm install --frozen-lockfile` fails with ERR_PNPM_LOCKFILE_CONFIG_MISMATCH.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts ./scripts
# Install. pnpm-workspace.yaml carries
#   supportedArchitectures.{os,cpu} = ["current", "linux", "darwin"], …
# so the linux-x64 binding for @zvec/zvec is installed inside buildkit even
# when pnpm's default platform-filter would have skipped it. Without that
# config, `pnpm install` inside buildkit was placing zero @zvec/bindings-*
# packages, and `pnpm build` later died with
#   Error: zvec Error: Prebuilt binary not found for linux-x64
# during Next.js's "Collecting page data" pass.
RUN pnpm install --frozen-lockfile

# Two-level fail-fast on the zvec binding. The file-exists check catches
# "pnpm skipped the optional dep" (fixed once via supportedArchitectures).
# The require() check catches "binding is present but dlopen fails on this
# base image" (e.g., wrong GLIBC, ABI mismatch) — the original symptom of
# both classes is the same zvec-side generic error, so we surface the real
# dlopen failure here instead of letting `pnpm build` blame zvec 90 seconds
# from now.
RUN test -e node_modules/@zvec/bindings-linux-x64/zvec_node_binding.node \
  || (echo "FATAL: @zvec/bindings-linux-x64 missing after pnpm install — check supportedArchitectures in package.json" \
        && ls -la node_modules/@zvec/ && exit 1)
# Light verification only: file exists. We deliberately do NOT `require` the
# binding here. The .node ships SIMD code paths (the host's prod CPU has
# them) but GitHub Actions runners vary across job assignments — some hit
# SIGILL on an AVX-512 instruction the runner doesn't support. The binding
# is only ever loaded at production runtime, not during `next build`,
# because all zvec-touching routes are marked `dynamic = 'force-dynamic'`
# (see lib/vectors/vector-service.ts callers).

COPY . .
# Raise V8's heap limit for the build. `next build` on this app exceeds V8's
# default old-space cap and aborts with "JavaScript heap out of memory"
# (exit 134) on memory-constrained Docker engines (e.g. an 8 GB Docker Desktop).
# Scoped to this RUN so it doesn't affect the runtime process.
RUN NODE_OPTIONS=--max-old-space-size=6144 pnpm build

# Note: dev dependencies are *not* pruned. drizzle-kit and tsx are listed as
# devDependencies but are needed at runtime by `pnpm db:migrate` and
# `pnpm reindex:rag` respectively. Keeping them adds ~80 MB to the runtime
# image, which is acceptable for a server image.

# ─── stage 2: runtime ─────────────────────────────────────────────────
FROM node:22-trixie-slim AS runtime

# HOSTNAME=0.0.0.0: Next.js standalone binds to process.env.HOSTNAME. Docker
# sets HOSTNAME to the container id, so without this the server binds to the
# eth0 IP only and the loopback HEALTHCHECK (127.0.0.1:3000) is refused →
# the container is reported "unhealthy" even though the app serves fine.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# bubblewrap: MCP sandboxing.
# tini:       PID-1 signal handling — without it stdio MCP zombies pile up.
# wget:       used by HEALTHCHECK.
# psql:       db:migrate one-shot.
RUN apt-get update && apt-get install -y --no-install-recommends \
      bubblewrap tini ca-certificates wget postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Non-root runtime user, matched to the host `pluggedin` account (1000:1000)
# that already owns the bind-mounted directories: zvec-data, uploads,
# /var/mcp-packages and /var/log/pluggedin.
#
# This defaulted to 1001, which would have required `chown -R 1001:1001` over
# those paths at cutover. Two problems with that: /var/mcp-packages is 88 GiB,
# and — worse — the native systemd service runs as `pluggedin` (uid 1000), so
# re-owning the directories would have broken the documented rollback path.
# Matching the host uid costs nothing and keeps rollback a one-liner.
#
# The node base image already ships a `node` account at 1000:1000, so that
# has to be released before `app` can claim the id — plain groupadd exits 4.
ARG APP_UID=1000
ARG APP_GID=1000
RUN set -eux; \
    if id -u node >/dev/null 2>&1; then userdel -r node 2>/dev/null || userdel node; fi; \
    if getent group node >/dev/null 2>&1; then groupdel node; fi; \
    groupadd -g ${APP_GID} app; \
    useradd -m -u ${APP_UID} -g app app

WORKDIR /app

COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public

# Drizzle migrations and the reindex-rag script live outside of the
# standalone bundle but inside the image so we can:
#   docker compose run --rm pluggedin-app node_modules/.bin/drizzle-kit migrate
#   docker compose run --rm pluggedin-app node_modules/.bin/tsx scripts/reindex-rag.ts
# without rebuilding the image.
#
# Invoke the binaries directly rather than through `pnpm <script>`: a runtime
# image has no reason to carry a package manager, and going through one added
# a dependency that silently did not exist (see the symlink note below).
COPY --from=builder --chown=app:app /app/drizzle ./drizzle
COPY --from=builder --chown=app:app /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=app:app /app/db ./db
COPY --from=builder --chown=app:app /app/lib ./lib
COPY --from=builder --chown=app:app /app/scripts ./scripts
COPY --from=builder --chown=app:app /app/package.json ./package.json
COPY --from=builder --chown=app:app /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
# `pnpm` and `tsx` on PATH, pointing at binaries that actually exist.
#
# This previously copied /root/.local/share/pnpm and symlinked pnpm+tsx out
# of it. That directory only ever contained pnpm's content-addressable
# `store/` — corepack keeps the pnpm shim elsewhere — so both symlinks
# dangled. `ln -s` does not validate its target, so the build passed and the
# breakage only surfaced when something tried to exec them:
#
#   [FATAL tini (7)] exec pnpm failed: No such file or directory
#
# which is precisely what `pnpm db:migrate` hit mid-cutover. tsx and
# drizzle-kit are real executables under /app/node_modules/.bin (both kept
# out of the devDependency prune above for exactly this reason), so link
# there instead. The `test -x` guard makes a future regression fail the
# build rather than ship a dangling link.
RUN set -eux; \
    test -x /app/node_modules/.bin/tsx; \
    test -x /app/node_modules/.bin/drizzle-kit; \
    ln -sf /app/node_modules/.bin/tsx         /usr/local/bin/tsx; \
    ln -sf /app/node_modules/.bin/drizzle-kit /usr/local/bin/drizzle-kit; \
    tsx --version; \
    drizzle-kit --version

# Directories the app writes into. Bind-mounts will override these at
# runtime; chown'ing here means the container still works on a fresh
# `docker run` for local dev.
RUN mkdir -p /app/data/vectors /app/uploads /app/logs /app/.cache/mcp-packages \
 && chown -R app:app /app

USER app
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=30s \
  CMD wget -q -O- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1
