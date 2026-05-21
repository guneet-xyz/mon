# Migrator image. Runs `drizzle-kit migrate` against $DATABASE_URL and exits.
# Build from repo root:  docker build -f packages/db/Dockerfile -t mon-migrator .

FROM oven/bun:1 AS install

COPY package.json /src/package.json
COPY bun.lock /src/bun.lock
COPY apps/agent/package.json /src/apps/agent/package.json
COPY apps/website/package.json /src/apps/website/package.json
COPY apps/docs/package.json /src/apps/docs/package.json
COPY packages/config/package.json /src/packages/config/package.json
COPY packages/contracts/package.json /src/packages/contracts/package.json
COPY packages/db/package.json /src/packages/db/package.json
COPY packages/env/package.json /src/packages/env/package.json
COPY packages/test-utils/package.json /src/packages/test-utils/package.json
COPY patches /src/patches

WORKDIR /src
RUN bun install --frozen-lockfile

COPY packages/db /src/packages/db
COPY packages/env /src/packages/env

FROM oven/bun:1-alpine AS base
WORKDIR /app

# Carry the resolved workspace tree as-is. Bun's workspace symlinks live in
# /src/node_modules → packages/*, so we keep the same layout under /app.
COPY --from=install /src/node_modules /app/node_modules
COPY --from=install /src/packages /app/packages
COPY --from=install /src/package.json /app/package.json

WORKDIR /app/packages/db

ENTRYPOINT ["bunx", "drizzle-kit", "migrate"]
