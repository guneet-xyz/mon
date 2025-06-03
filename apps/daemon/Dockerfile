FROM oven/bun:1 AS install

COPY package.json /src/package.json
COPY bun.lock /src/bun.lock
COPY apps/daemon/package.json /src/apps/daemon/package.json
COPY apps/website/package.json /src/apps/website/package.json
COPY packages/config/package.json /src/packages/config/package.json
COPY packages/env/package.json /src/packages/env/package.json
COPY packages/db/package.json /src/packages/db/package.json

WORKDIR /src
RUN bun install --frozen-lockfile
COPY . /src
WORKDIR /src/apps/daemon
RUN bun run build

FROM oven/bun:1 AS base
COPY --from=install /src/apps/daemon/dist/daemon.cjs /app/daemon.cjs
ENTRYPOINT [ "bun", "/app/daemon.cjs" ]
