# Digital Twin Airport API
#
#   docker build -t digital-twin-airport-api .
#   docker run --env-file .env -p 5050:5050 digital-twin-airport-api
#
# Database migrations run from their own target (no Prisma CLI in the runtime image):
#   docker build --target migrate -t digital-twin-airport-api-migrate .
#   docker run --rm --env-file .env digital-twin-airport-api-migrate

ARG NODE_VERSION=22

# --- Base: Debian slim + OpenSSL (Prisma engines are built for this exact platform) ---
FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- Builder: full dependencies, generate the Prisma client, compile TypeScript ---
FROM base AS builder
# A placeholder URL lets prisma.config.ts load; generate never connects to it
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall runs `prisma generate` (downloads the engine for this platform)
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
# clean -> prisma generate -> tsc -> tsc-alias -> copy generated client into dist
RUN npm run build

# --- Migrate: one-off job that applies pending migrations (prisma migrate deploy) ---
FROM builder AS migrate
ENV DATABASE_URL=
CMD ["npx", "prisma", "migrate", "deploy"]

# --- Production dependencies only. Scripts are skipped (the client is already generated).
# --omit=optional also drops "devOptional" packages: prisma / typescript are dev deps that are
# optional peers of @prisma/client, and would otherwise pull the whole Prisma CLI + Studio in ---
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --omit=optional --no-audit --no-fund --ignore-scripts

# --- Runtime ---
FROM base AS runtime
ENV NODE_ENV=production \
  PORT=5050
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 5050
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5050) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/src/server.js"]
