FROM oven/bun:1 AS build

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
COPY . /src
WORKDIR /src/apps/docs
RUN SKIP_ENV_VALIDATION=1 bun run build

FROM oven/bun:1

COPY --from=build /src/apps/docs/.next/standalone /app
COPY --from=build /src/apps/docs/.next/static /app/apps/docs/.next/static
# COPY --from=build /src/apps/docs/public /app/apps/docs/public

EXPOSE 3000
WORKDIR /app
ENTRYPOINT [ "bun", "run", "apps/docs/server.js" ]
