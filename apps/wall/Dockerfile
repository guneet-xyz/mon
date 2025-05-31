FROM oven/bun:1 AS build

COPY package.json /src/package.json
COPY bun.lock /src/bun.lock
COPY apps/daemon/package.json /src/apps/daemon/package.json
COPY apps/wall/package.json /src/apps/wall/package.json
COPY packages/config/package.json /src/packages/config/package.json
COPY packages/env/package.json /src/packages/env/package.json
COPY packages/db/package.json /src/packages/db/package.json

RUN bun install --frozen-lockfile
COPY . /src
WORKDIR /src/apps/wall
RUN SKIP_ENV_VALIDATION=1 bun run build

FROM oven/bun:1

COPY --from=build /src/apps/wall/.next/standalone /app

ENTRYPOINT [ "bun", "run", "/app/apps/wall/server.js" ]
