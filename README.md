# mon

Self-hosted status board. A TOML file declares what to watch (hosts, websites, Docker containers, GitHub repos); a Bun daemon polls them every minute and writes pings to Postgres; a Next.js website renders the results as a responsive grid of tiles.

```
                                ┌──────────────────┐
                                │  config.toml     │
                                │  (single source) │
                                └────────┬─────────┘
                                         │ read
                       ┌─────────────────┴────────────────┐
                       ▼                                  ▼
              ┌──────────────────┐               ┌──────────────────┐
              │  daemon (Bun)    │── pings ─▶    │   Postgres       │
              │  node-schedule   │               │   (mon_* tables) │
              │  cron polling    │               └────────┬─────────┘
              └──────────────────┘                        │ query
                                                          ▼
                                                 ┌──────────────────┐
                                                 │  website (Next)  │
                                                 │  tile grid       │
                                                 └──────────────────┘
```

## Repo layout

```
apps/
  daemon/     # Bun cron poller → Postgres (esbuild-bundled CJS)
  website/    # Next 14 status board (the thing you put on a wall)
  docs/       # Next 15 + Nextra docs site
packages/
  config/     # TOML loader + Zod schema (single source of truth)
  db/         # Drizzle schema + postgres-js client (tables prefixed mon_*)
  env/        # @t3-oss/env-core wrapper (shared by all apps)
```

See [`AGENTS.md`](./AGENTS.md) for the full project knowledge base (conventions, anti-patterns, where-to-look table).

---

## Development

### Prerequisites

- **[Bun](https://bun.sh/) `1.2.15`** (pinned in CI; newer minor versions are fine locally)
- **Postgres 15+** running somewhere reachable
- **Docker** — only needed if you want to monitor containers from the daemon

### One-time setup

```bash
git clone <repo> mon && cd mon
bun install
```

Create env files (each one is git-ignored):

```bash
# packages/db/.env  — used by drizzle-kit
DATABASE_URL=postgres://mon:mon@localhost:5432/mon

# apps/daemon/.env
APP=daemon
DATABASE_URL=postgres://mon:mon@localhost:5432/mon
CONFIG_PATH=./config.dev.toml
GITHUB_TOKEN=ghp_xxx     # optional, only if you have github tiles

# apps/website/.env
APP=website
DATABASE_URL=postgres://mon:mon@localhost:5432/mon
CONFIG_PATH=./config.dev.toml
```

Push the schema to your DB:

```bash
cd packages/db
bunx drizzle-kit push
```

Drop a `config.dev.toml` at the repo root (path is up to you; match `CONFIG_PATH`):

```toml
[[tiles]]
type = "host"
key  = "router"
name = "Home Router"
address = "192.168.1.1"

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

See [`apps/docs/src/content/configuration/`](./apps/docs/src/content/configuration) or run the docs site for the full schema reference.

### Running

```bash
# terminal 1 — daemon (writes pings every minute)
cd apps/daemon && bun run dev

# terminal 2 — website
cd apps/website && bun run dev    # http://localhost:3000

# terminal 3 — docs (optional)
cd apps/docs && bun run dev       # http://localhost:3000
```

### Day-to-day commands

```bash
bun run lint              # tsc --noEmit + next lint (website + docs)
bun run format:check      # prettier check (semi: false, sorted imports)
bun run format:write      # apply formatting

# DB
cd packages/db
bunx drizzle-kit push     # apply schema.ts to DATABASE_URL
bunx drizzle-kit studio   # browse data in the browser

# Daemon — build the production bundle locally
cd apps/daemon && bun run build   # → apps/daemon/dist/daemon.cjs
```

### Adding a new monitor type

This touches five files; the path is documented in [`AGENTS.md` → WHERE TO LOOK](./AGENTS.md#where-to-look). In short: add the variant to the Zod discriminated union in [`packages/config/schema.ts`](./packages/config/schema.ts), add a table in [`packages/db/schema.ts`](./packages/db/schema.ts), add the job file under [`apps/daemon/src/jobs/`](./apps/daemon/src/jobs), then the tile component + register it in [`apps/website/src/components/tiles/index.tsx`](./apps/website/src/components/tiles/index.tsx) and [`apps/website/src/lib/server/monitors/index.ts`](./apps/website/src/lib/server/monitors/index.ts).

---

## Production

Each app builds to its own Docker image. There is no PaaS; CI pushes images to a private registry over Tailscale and runs them via SSH on a single host. The compose file is yours to write — the apps don't care, they only need env vars and a config file.

### Build images

```bash
# from repo root
docker build -t mon/daemon  -f apps/daemon/Dockerfile  .
docker build -t mon/website -f apps/website/Dockerfile .
docker build -t mon/docs    -f apps/docs/Dockerfile    .
```

The website and docs Dockerfiles build with `SKIP_ENV_VALIDATION=1` — environment validation happens at runtime, not at build time, so images are portable across DBs.

### Runtime contract

Both `daemon` and `website` need:

| Env var        | Required         | Default                | Notes                                            |
| -------------- | ---------------- | ---------------------- | ------------------------------------------------ |
| `APP`          | yes              | —                      | `daemon` or `website`. Zod-validated on boot.    |
| `DATABASE_URL` | yes              | —                      | Postgres URL. Daemon writes, website reads.      |
| `CONFIG_PATH`  | no               | `/etc/mon/config.toml` | Path to the TOML config inside the container.    |
| `GITHUB_TOKEN` | only if gh tiles | —                      | A PAT with read access to the repos you monitor. |
| `NODE_ENV`     | no               | `development`          | Set to `production` in real deployments.         |

The docs site builds to a fully static set of pages and needs **no runtime env vars**.

### Mounting the config

Both daemon and website must read **the same** TOML. The typical layout:

```yaml
# docker-compose snippet (illustrative — not committed)
services:
  daemon:
    image: mon/daemon
    environment:
      APP: daemon
      DATABASE_URL: postgres://mon:mon@db:5432/mon
      CONFIG_PATH: /etc/mon/config.toml
      GITHUB_TOKEN: ${GITHUB_TOKEN}
    volumes:
      - ./config.toml:/etc/mon/config.toml:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro # only if container tiles
    restart: unless-stopped

  website:
    image: mon/website
    environment:
      APP: website
      DATABASE_URL: postgres://mon:mon@db:5432/mon
      CONFIG_PATH: /etc/mon/config.toml
    volumes:
      - ./config.toml:/etc/mon/config.toml:ro
    ports:
      - "3000:3000"
    restart: unless-stopped

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: mon
      POSTGRES_PASSWORD: mon
      POSTGRES_DB: mon
    volumes:
      - mon-pgdata:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  mon-pgdata:
```

Notes on the volume mount:

- If `CONFIG_PATH` points at a non-existent file, `getConfig()` will **create an empty one** on first boot. Mount a writable directory or mount the file read-only with an existing config.
- The container-tile job requires the Docker socket mounted into the daemon (`/var/run/docker.sock`). Override per-tile with `docker_socket = "..."` in the config if needed.

### Schema migrations

There are no committed migration files — schema management is `drizzle-kit push` against the live DB. In production:

```bash
# from a host with DATABASE_URL pointing at production
cd packages/db
bunx drizzle-kit push
```

Review the diff prompt before confirming. The `tablesFilter: ["mon_*"]` in [`drizzle.config.ts`](./packages/db/drizzle.config.ts) keeps `push` scoped to this project's tables, so it is safe to run against a shared Postgres.

### Editing the wall in place

The config file is read on every request to the website (`force-dynamic` on `app/page.tsx`) and re-read by the daemon on its next tick. To add/remove tiles in production:

1. Edit the mounted `config.toml`.
2. **Daemon**: restart the container so the new tile gets a scheduled job (jobs are registered once at startup).
3. **Website**: no restart needed — next page load picks it up.

### Health

- The daemon writes a row **every tick**, success or failure. If you see no new rows in `mon_host_ping` etc., the daemon is down. There is no separate `/health` endpoint.
- The website is a normal Next.js standalone server on port `3000`. Put your usual reverse proxy + TLS in front of it.

---

## License

Private. See [`package.json`](./package.json).
