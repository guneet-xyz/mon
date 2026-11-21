# mon

Self-hosted status board. A TOML file on the website host declares what to watch (hosts, websites, Docker containers, GitHub repos, and the machines agents run on). Agents fetch their jobs from the website, run the checks and push the results back to it. The website stores them in Postgres and renders a responsive grid of tiles.

```
                        ┌──────────────────┐
                        │   config.toml    │
                        └────────┬─────────┘
                                 │ read (only by the website)
┌──────────────────┐    ┌────────▼─────────┐    ┌──────────────────┐
│  agent (Bun)     │───▶│  website (Next)  │───▶│  Postgres        │
│  one or more     │    │  tile grid +     │◀───│  (mon_* tables)  │
│                  │◀───│  agent HTTP API  │    └────────▲─────────┘
└──────────────────┘    └──────────────────┘             │ apply committed
   GET  /api/agent/jobs     (jobs for this agent)        │ migrations
   POST /api/agent/pings/*  (results)           ┌────────┴─────────┐
                                                │  migrator        │
                                                │  (one-shot)      │
                                                └──────────────────┘
```

- **Only the website reads the config.** It decides which tiles each agent runs and hands them out at `GET /api/agent/jobs`.
- **Agents hold no config and no database credentials.** Each agent polls the website for its job list, runs the checks and posts each result to `POST /api/agent/pings/<kind>`. Requests carry `Authorization: Bearer <token>` and `X-Agent-Id: <id>`; the config stores only the token's SHA-256 hash under `[agents.<id>]`. You can run several agents on different networks against one website.
- **Only the website touches Postgres.** It writes the pushed results and reads them back to render tiles.
- **The migrator applies the committed migrations** in [`packages/db/drizzle/`](./packages/db/drizzle) and exits.

## Repo layout

```
apps/
  agent/       # Bun agent: pulls jobs, runs checks, pushes results (esbuild-bundled CJS)
  website/     # Next.js status board + the agent HTTP API (the only Postgres client)
  docs/        # Next.js + Nextra docs site (config reference)
packages/
  config/      # TOML loader + Zod schema for config.toml (used by the website)
  contracts/   # Zod schemas for the agent ⇄ website API (jobs and pings)
  db/          # Drizzle schema, committed migrations, migrator image
  test-utils/  # test Postgres, mock GitHub/HTTP servers, config fixtures
```

See [`AGENTS.md`](./AGENTS.md) for conventions and where to look, and [`TESTING.md`](./TESTING.md) for tests.

## Configuration

The config reference lives in the docs site, under [`apps/docs/src/content/`](./apps/docs/src/content):

- [Configuration](./apps/docs/src/content/configuration/index.mdx): agents, tokens, assigning tiles to agents, intervals.
- [Tiles](./apps/docs/src/content/configuration/tiles/index.mdx): layout, the monitor tile types, groups, and the logo and theme tiles.

Run the docs site locally (see [Running](#running)) to browse it.

Each monitor tile's `agent` field says which agent runs it (default `"default"`). How often tiles are checked is also set in the config; see the docs.

**Config edits apply without restarts.** The website rereads the file when it changes: the next page load shows the new layout, and each agent picks up its new job list on its next poll.

---

## Development

### Prerequisites

- **[Bun](https://bun.sh/) `1.2.15`** (pinned in CI; newer versions are fine locally)
- **Docker**, for a local Postgres and for the tests (`createTestDb()` starts throwaway Postgres containers). Container tiles also need the agent to reach a Docker socket.

### One-time setup

```bash
git clone https://github.com/guneet-xyz/mon.git && cd mon
bun install

# Postgres for local dev
docker run -d --name mon-dev-db -p 5432:5432 \
  -e POSTGRES_USER=mon -e POSTGRES_PASSWORD=mon -e POSTGRES_DB=mon \
  postgres:16

# Apply the committed migrations (what the migrator image does)
cd packages/db
DATABASE_URL=postgres://mon:mon@localhost:5432/mon bunx drizzle-kit migrate
cd ../..
```

Mint a token for the dev agent and hash it for the config:

```bash
token=$(openssl rand -hex 32)
echo "$token"                     # AGENT_TOKEN for apps/agent/.env
echo -n "$token" | sha256sum      # token_hash for config.dev.toml
```

Create `config.dev.toml` at the repo root (git-ignored):

```toml
[agents.default]
token_hash  = "<sha256 of the token>"
description = "Local dev agent"

[[tiles]]
type    = "host"
key     = "localhost"
name    = "Localhost"
address = "127.0.0.1"

[[tiles]]
type = "website"
key  = "example"
name = "Example"
url  = "https://example.com"

[[tiles]]
type = "logo"

[[tiles]]
type = "theme"
```

Create the env files (both git-ignored). `next dev` and `bun` load `.env` from the app's directory:

```bash
# apps/website/.env
DATABASE_URL=postgres://mon:mon@localhost:5432/mon
CONFIG_PATH=../../config.dev.toml   # relative to apps/website

# apps/agent/.env
WEBSITE_URL=http://localhost:3000
AGENT_ID=default
AGENT_TOKEN=<the token>
AGENT_POLL_INTERVAL_SECONDS=10      # optional, default 60
```

### Running

```bash
# terminal 1: website (start it first; the agent backs off until it is up)
cd apps/website && bun run dev                    # http://localhost:3000

# terminal 2: agent
cd apps/agent && bun run dev

# terminal 3: docs (optional)
cd apps/docs && bun run dev -- --port 3001        # http://localhost:3001/docs
```

Edit `config.dev.toml` while they run; no restart is needed.

### Day-to-day commands

```bash
bun run lint              # tsc --noEmit + eslint (website + docs)
bun run format:check      # prettier check (semi: false, sorted imports)
bun run format:write      # apply formatting
bun run test              # unit + integration tests (needs Docker)
bun run test:e2e          # builds the agent, then Playwright E2E
bun run screenshots       # screenshot tour of a seeded board → apps/website/screenshots/

# DB (from packages/db, with DATABASE_URL set)
bunx drizzle-kit generate --name <change>   # write a migration after editing schema.ts
bunx drizzle-kit migrate                    # apply the committed migrations
bunx drizzle-kit studio                     # browse data in the browser

# Agent: build the production bundle locally
cd apps/agent && bun run build   # → apps/agent/dist/agent.cjs
```

[`test/`](./test/README.md) has a Docker Compose stack (Postgres, migrator, website, agent) built from your checkout.

### Adding a new monitor type

See [`AGENTS.md` → WHERE TO LOOK](./AGENTS.md#where-to-look) for the full path. In short: the config schema in [`packages/config/schema.ts`](./packages/config/schema.ts), the job and ping contracts in [`packages/contracts/index.ts`](./packages/contracts/index.ts), the job in [`apps/agent/src/jobs/`](./apps/agent/src/jobs), the website's jobs route and an ingest route under [`apps/website/src/app/api/agent/`](./apps/website/src/app/api/agent), a table and a migration in [`packages/db/`](./packages/db), and the tile in [`apps/website/src/components/tiles/`](./apps/website/src/components/tiles).

---

## Production

Each component builds to its own Docker image. There is no PaaS. Releases publish multi-arch (`linux/amd64`, `linux/arm64`) images to `cr.guneet.dev/mon/{website,agent,docs,migrator}`; see [Releases and images](#releases-and-images). CI does not deploy anything. The compose file is yours to write; the apps only need env vars and, for the website, a config file.

### Releases and images

Releases are managed by [release-please](https://github.com/googleapis/release-please) ([`release-please-config.json`](./release-please-config.json), [`.release-please-manifest.json`](./.release-please-manifest.json)). The whole repository shares **one version**: the root `package.json` version, Git tag `vX.Y.Z` and all four image tags always match.

1. Commits on `main` (squash-merge PR titles) follow [Conventional Commits](https://www.conventionalcommits.org/). `fix:` bumps the patch version, `feat:` the minor version, and `!` / `BREAKING CHANGE:` the major version, except that while the version is `0.x` a breaking change only bumps the minor version (`bump-minor-pre-major`). `1.0.0` is released deliberately, with a commit whose body has a `Release-As: 1.0.0` footer. `ci:`, `docs:`, `test:` and `chore:` don't cause a release on their own.
2. On every push to `main`, the [`release`](./.github/workflows/release.yml) workflow updates a single release PR that bumps `package.json` and `.release-please-manifest.json` and updates the generated `CHANGELOG.md` (don't edit it by hand). Because the PR is opened with `GITHUB_TOKEN`, the workflow dispatches [`ci`](./.github/workflows/ci.yml) on the release-PR branch so the PR gets checks.
3. **Merging the release PR is the release.** release-please creates the `vX.Y.Z` tag and GitHub Release. The workflow then:
   - runs the full `ci` suite (format, lint, actionlint, unit/integration, E2E, image builds + smoke test) on the exact release commit;
   - builds each image natively on `ubuntu-24.04` (amd64) and `ubuntu-24.04-arm` (arm64) with SBOM and provenance attestations and pushes it **by digest only**, without tags;
   - pulls those digests and runs [`.github/scripts/smoke-test-images.sh`](./.github/scripts/smoke-test-images.sh) on each architecture: a throwaway PostgreSQL, the migrator (twice), the website, an agent whose ping must reach the database through the website, and the docs site;
   - only then creates the multi-arch index for each image, tags it, and records a GitHub build-provenance attestation for the index digest.

For release `vX.Y.Z` each image gets these tags:

| Tag      | Meaning                                                 |
| -------- | ------------------------------------------------------- |
| `vX.Y.Z` | The release. Pin this, ideally with its digest.         |
| `vX.Y`   | Newest release in that minor line.                      |
| `vX`     | Newest release in that major line (only from `v1.0.0`). |
| `latest` | Newest release.                                         |

`vX.Y`, `vX` and `latest` only move when the release is the repository's latest GitHub Release. Nothing is published from ordinary pushes, pull requests or other branches, and no workflow can publish manually. If publishing fails after the release was created, fix the cause and use **Re-run failed jobs** on that `release` run. There are no `edge` or `sha-…` tags. Tags published before release-please (unprefixed `0.2.1`, `0.2`, `0` and `sha-<commit sha>`) stay in the registry and are not moved or deleted; new releases only get the `v`-prefixed tags above and `latest`.

Registry credentials are a Dockyard automation key (pull + push on the `mon` project) stored as the `DOCKER_USERNAME` / `DOCKER_PASSWORD` secrets of the `release` GitHub environment; only the build, smoke-test and tagging jobs use them, and they are never passed into image builds. Publishing a release doesn't change any deployment: deployments pin `vX.Y.Z@sha256:…` and are upgraded separately.

Owner setup: **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** must be enabled for release-please to open its PR.

### Build images

```bash
# from repo root
docker build -t mon/agent    -f apps/agent/Dockerfile    .
docker build -t mon/website  -f apps/website/Dockerfile  .
docker build -t mon/docs     -f apps/docs/Dockerfile     .
docker build -t mon/migrator -f packages/db/Dockerfile   .
```

The website and docs Dockerfiles build with `SKIP_ENV_VALIDATION=1`: environment validation happens at runtime, not at build time, so images are portable across databases.

### Runtime contract

**website** (`cr.guneet.dev/mon/website`, a Next.js standalone server):

| Env var        | Required | Default                | Notes                                                                     |
| -------------- | -------- | ---------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL` | yes      | —                      | Postgres URL. The website is the only component that reads or writes it.  |
| `CONFIG_PATH`  | no       | `/etc/mon/config.toml` | Path to the TOML config inside the container.                             |
| `NODE_ENV`     | no       | `development`          | Set to `production` in real deployments.                                  |
| `PORT`         | no       | `3000`                 | Listen port (Next.js standalone).                                         |
| `HOSTNAME`     | no       | `0.0.0.0`              | Listen address. Set it in containers: Docker sets it to the container ID. |

**agent** (`cr.guneet.dev/mon/agent`):

| Env var                       | Required                       | Default                  | Notes                                                                                     |
| ----------------------------- | ------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------- |
| `WEBSITE_URL`                 | yes                            | —                        | Base URL of the website, e.g. `https://mon.example.com`.                                  |
| `AGENT_ID`                    | yes                            | —                        | Matches an `[agents.<id>]` block in the website's config.                                 |
| `AGENT_TOKEN`                 | yes, unless `AGENT_TOKEN_FILE` | —                        | Plaintext bearer token, at least 32 characters. Its SHA-256 is the agent's `token_hash`.  |
| `AGENT_TOKEN_FILE`            | instead of `AGENT_TOKEN`       | —                        | File containing the token (e.g. a Compose secret). Used only when `AGENT_TOKEN` is unset. |
| `AGENT_POLL_INTERVAL_SECONDS` | no                             | `60`                     | How often the agent fetches its job list from the website.                                |
| `GITHUB_API_BASE_URL`         | no                             | `https://api.github.com` | GitHub API base URL (tests point it at a mock). GitHub tokens are set per tile.           |
| `NODE_ENV`                    | no                             | `development`            | Set to `production` in real deployments.                                                  |

The agent needs no config file and no database access. Container tiles need the Docker socket mounted into the agent (`/var/run/docker.sock` by default; override per tile with `docker_socket`). Agent tiles report the machine the agent runs on.

**migrator** needs only `DATABASE_URL`. The **docs** site needs no runtime env vars (`PORT` and `HOSTNAME` work as for the website).

### Example Compose file

```yaml
# illustrative, not committed; see test/compose.yml for a runnable local stack
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: mon
      POSTGRES_PASSWORD: mon
      POSTGRES_DB: mon
    volumes:
      - mon-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mon -d mon"]
      interval: 2s
      retries: 20
    restart: unless-stopped

  migrator:
    image: cr.guneet.dev/mon/migrator:vX.Y.Z
    environment:
      DATABASE_URL: postgres://mon:mon@db:5432/mon
    depends_on:
      db:
        condition: service_healthy
    restart: "no"

  website:
    image: cr.guneet.dev/mon/website:vX.Y.Z
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://mon:mon@db:5432/mon
      CONFIG_PATH: /etc/mon/config.toml
      HOSTNAME: 0.0.0.0
    volumes:
      - ./config:/etc/mon:ro
    ports:
      - "3000:3000"
    depends_on:
      migrator:
        condition: service_completed_successfully
    restart: unless-stopped

  agent:
    image: cr.guneet.dev/mon/agent:vX.Y.Z
    environment:
      NODE_ENV: production
      WEBSITE_URL: http://website:3000
      AGENT_ID: default
      AGENT_TOKEN_FILE: /run/secrets/agent_token
    secrets: [agent_token]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro # only for container tiles
    restart: unless-stopped

secrets:
  agent_token:
    file: ./agent_token

volumes:
  mon-pgdata:
```

Put your usual reverse proxy and TLS in front of the website. Agents on other networks only need to reach its URL.

Notes on the config mount:

- Mount the directory rather than the file. Editors and deploy tools often replace the file, and a single-file bind mount keeps showing the old one.
- If `CONFIG_PATH` doesn't exist, the website creates an empty config there on first boot, which needs a writable mount. Mount an existing config if you mount read-only.

### Migrations

Schema changes ship as committed migrations in [`packages/db/drizzle/`](./packages/db/drizzle). The `migrator` image runs `drizzle-kit migrate` against `$DATABASE_URL` and exits; run it before starting a new website release.

```bash
docker run --rm \
  -e DATABASE_URL=postgres://mon:mon@db.example.com:5432/mon \
  cr.guneet.dev/mon/migrator:vX.Y.Z
```

- Requires only `DATABASE_URL`. No config file, no other env vars.
- Exit code `0` means the database is up to date and running it again is a no-op. Non-zero means a migration failed; fix the cause and run it again.
- In Compose, run it as a one-shot service (`restart: "no"`) and gate the website on `depends_on: { migrator: { condition: service_completed_successfully } }`.
- Migrations are kept additive, so older agents and websites keep working against a newer schema. Tables are prefixed `mon_` (`tablesFilter: ["mon_*"]` in [`drizzle.config.ts`](./packages/db/drizzle.config.ts)), so the database can be shared.
- Don't `drizzle-kit push` against a deployed database; `push` is for throwaway databases (the tests use it).

### Editing the board in place

Edit the mounted `config.toml`; nothing needs restarting. The website picks up the change within a few seconds, open boards show a changed layout once reloaded, and each agent gets its new job list on its next poll (`AGENT_POLL_INTERVAL_SECONDS`). Adding an agent means adding its `[agents.<id>]` block and starting the agent with the matching `AGENT_ID` and token.

### Health

- There is no separate `/health` endpoint. The website is a normal Next.js server; `GET /` returns `200` when it is up.
- Agents log to stdout. An agent exits with code `78` when the website rejects its token (`401`): check `AGENT_ID`, the token and the `token_hash`. When the website is unreachable it keeps retrying with backoff (5 s doubling up to 5 min).
- Agents push a result for every check, success or failure, so a tile whose data stops updating means its agent is down or can't reach the website.

---

## License

Private. See [`package.json`](./package.json).
