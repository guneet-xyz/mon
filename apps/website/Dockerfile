FROM oven/bun:1 AS build

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
WORKDIR /src/apps/website
RUN SKIP_ENV_VALIDATION=1 bun run build

FROM oven/bun:1

COPY --from=build /src/apps/website/.next/standalone /app
COPY --from=build /src/apps/website/.next/static /app/.next/static
COPY --from=build /src/apps/website/public /app/public

EXPOSE 3000
WORKDIR /app
ENTRYPOINT [ "bun", "run", "apps/website/server.js" ]
