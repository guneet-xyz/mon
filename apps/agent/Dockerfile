FROM oven/bun:1 AS install

COPY package.json /src/package.json
COPY bun.lock /src/bun.lock
COPY apps/agent/package.json /src/apps/agent/package.json
COPY apps/website/package.json /src/apps/website/package.json
COPY apps/docs/package.json /src/apps/docs/package.json
COPY packages/config/package.json /src/packages/config/package.json
COPY packages/contracts/package.json /src/packages/contracts/package.json
COPY packages/db/package.json /src/packages/db/package.json
COPY packages/test-utils/package.json /src/packages/test-utils/package.json
COPY patches /src/patches

WORKDIR /src
RUN bun install --frozen-lockfile
COPY . /src
WORKDIR /src/apps/agent
RUN bun run build

FROM oven/bun:1-alpine AS base
RUN apk add curl docker iputils-ping
COPY --from=install /src/apps/agent/dist/agent.cjs /app/agent.cjs
ENTRYPOINT [ "bun", "/app/agent.cjs" ]
