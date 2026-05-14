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

RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY scripts ./scripts
# Install. The package.json carries
#   pnpm.supportedArchitectures.{os,cpu} = ["current", "linux", "darwin"], …
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
# Diagnostic: separate steps so each part of the output is visible even
# under buildkit's aggressive log trimming around `||` short-circuits.
# Step A: dump what the binding needs vs what the image provides.
RUN apt-get update && apt-get install -y --no-install-recommends binutils \
 && rm -rf /var/lib/apt/lists/* \
 && echo '=== binding ldd ===' \
 && ldd node_modules/@zvec/bindings-linux-x64/zvec_node_binding.node 2>&1 || true \
 && echo '=== binding requires (max per family) ===' \
 && objdump -T node_modules/@zvec/bindings-linux-x64/zvec_node_binding.node 2>/dev/null | grep -oE '(GLIBC|GLIBCXX)_[0-9.]+' | sort -V -u | awk -F'_' '{a[$1]=$2}END{for(k in a)print k"_"a[k]}' \
 && echo '=== image provides (max per family) ===' \
 && ldd --version | head -1 \
 && strings /usr/lib/x86_64-linux-gnu/libstdc++.so.6 2>/dev/null | grep -oE 'GLIBCXX_[0-9.]+' | sort -V -u | tail -1
# Step B: actually require the binding. No `||`, so node's exit + stderr
# go straight to the build log.
RUN node -e "try{ \
  const b = require('@zvec/bindings-linux-x64'); \
  console.log('zvec binding loaded:', typeof b); \
} catch (e) { \
  console.error('zvec binding require failed:'); \
  console.error('  name:', e.name); \
  console.error('  code:', e.code); \
  console.error('  message:', e.message); \
  process.exit(1); \
}"

COPY . .
RUN pnpm build

# Note: dev dependencies are *not* pruned. drizzle-kit and tsx are listed as
# devDependencies but are needed at runtime by `pnpm db:migrate` and
# `pnpm reindex:rag` respectively. Keeping them adds ~80 MB to the runtime
# image, which is acceptable for a server image.

# ─── stage 2: runtime ─────────────────────────────────────────────────
FROM node:22-trixie-slim AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# bubblewrap: MCP sandboxing.
# tini:       PID-1 signal handling — without it stdio MCP zombies pile up.
# wget:       used by HEALTHCHECK.
# psql:       db:migrate one-shot.
RUN apt-get update && apt-get install -y --no-install-recommends \
      bubblewrap tini ca-certificates wget postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Non-root runtime user. Bind-mounted host dirs (zvec-data, uploads,
# mcp-packages, logs) must be owned by uid 1001 / gid 1001 on the host —
# documented in infra/README.md.
ARG APP_UID=1001
ARG APP_GID=1001
RUN groupadd -g ${APP_GID} app && useradd -m -u ${APP_UID} -g app app

WORKDIR /app

COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public

# Drizzle migrations and the reindex-rag script live outside of the
# standalone bundle but inside the image so we can:
#   docker compose run --rm pluggedin-app pnpm db:migrate
#   docker compose run --rm pluggedin-app pnpm reindex:rag
# without rebuilding the image.
COPY --from=builder --chown=app:app /app/drizzle ./drizzle
COPY --from=builder --chown=app:app /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=app:app /app/db ./db
COPY --from=builder --chown=app:app /app/lib ./lib
COPY --from=builder --chown=app:app /app/scripts ./scripts
COPY --from=builder --chown=app:app /app/package.json ./package.json
COPY --from=builder --chown=app:app /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder /root/.local/share/pnpm /usr/local/share/pnpm
RUN ln -s /usr/local/share/pnpm/pnpm /usr/local/bin/pnpm \
 && ln -s /usr/local/share/pnpm/tsx  /usr/local/bin/tsx

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
