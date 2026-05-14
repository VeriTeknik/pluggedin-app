# Plugged.in production image.
#
# Multi-stage. Debian-slim base because the Alpine + native zvec/sharp/bcrypt
# combination has historically been fragile across pnpm versions; the extra
# image size (≈ 200 MB) is acceptable for a server image deployed once per
# release.
#
# Build:  infra/scripts/build.sh
# Tag:    ghcr.io/veriteknik/pluggedin-app:{latest,sha-XXXX}

# ─── stage 1: deps + build ────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

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
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Prune dev dependencies so the runtime stage only needs what's left.
RUN pnpm prune --prod

# ─── stage 2: runtime ─────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

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
