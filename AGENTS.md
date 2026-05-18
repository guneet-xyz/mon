# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-18
**Commit:** f80b96e
**Branch:** main

## OVERVIEW

`@mon` — self-hosted status-board monorepo. A TOML config defines tiles (hosts, websites, containers, GitHub repos); a Bun daemon polls them on cron and writes pings to Postgres; a Next.js website renders a responsive tile grid from the same config + DB.

Stack: **Bun** runtime (workspaces), **TypeScript 5.8**, **Next.js** (14 website, 15 docs), **Drizzle + postgres-js**, **Tailwind v4**, **shadcn/ui (new-york)**, **Zod v4**, **smol-toml**, **@t3-oss/env-core**.

## STRUCTURE

```
mon/
├── apps/
│   ├── daemon/      # Bun cron poller → Postgres (esbuild-bundled to dist/daemon.cjs)
│   ├── website/     # Next 14 status board (consumer of daemon's data)
│   └── docs/        # Next 15 + Nextra MDX docs site
├── packages/
│   ├── config/      # TOML loader + Zod schema (single source of truth for tile shape)
│   ├── db/          # Drizzle schema + postgres-js client (table prefix mon_*)
│   └── env/         # @t3-oss/env-core wrapper — used by ALL apps
└── .github/workflows/  # per-app deploy + test + repo-wide formatting/linting
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add a new tile type | [packages/config/schema.ts](file:///Users/guneet/projects/mon/packages/config/schema.ts) → daemon job in [apps/daemon/src/jobs/](file:///Users/guneet/projects/mon/apps/daemon/src/jobs) → DB table in [packages/db/schema.ts](file:///Users/guneet/projects/mon/packages/db/schema.ts) → tile component in [apps/website/src/components/tiles/](file:///Users/guneet/projects/mon/apps/website/src/components/tiles) → register in [tiles/index.tsx](file:///Users/guneet/projects/mon/apps/website/src/components/tiles/index.tsx) and [server/monitors/index.ts](file:///Users/guneet/projects/mon/apps/website/src/lib/server/monitors/index.ts) |
| New env var | [packages/env/index.ts](file:///Users/guneet/projects/mon/packages/env/index.ts) (single shared env for all workspaces) |
| Grid layout / placement logic | [apps/website/src/lib/client/tile-generation.ts](file:///Users/guneet/projects/mon/apps/website/src/lib/client/tile-generation.ts) |
| DB migration | run `drizzle-kit` against [packages/db/drizzle.config.ts](file:///Users/guneet/projects/mon/packages/db/drizzle.config.ts) |
| CI/CD | [.github/workflows/](file:///Users/guneet/projects/mon/.github/workflows) — `deploy-*.yml` pushes Docker over Tailscale + SSH |

## CONVENTIONS

- **Package manager: Bun**, version pinned in CI to `1.2.15`. Use `bun i`, `bunx`, never `npm`/`pnpm`.
- **Workspace imports**: `@mon/config`, `@mon/db`, `@mon/db/schema`, `@mon/db/drizzle`, `@mon/env`. The `@/*` alias is **website-only** and points at `apps/website/src/*` (see root [tsconfig.json](file:///Users/guneet/projects/mon/tsconfig.json#L29-L31)).
- **Prettier** is repo-wide and opinionated: `semi: false`, import order `@mon → @/ → relative`. Tailwind class sort + package.json sort plugins are active. Run via `bun run format:write`.
- **Lint = website + docs + repo-wide `tsc --noEmit`**. Root `tsc` config **excludes** `apps/website` and `apps/docs` (they have their own `tsconfig.json` driven by Next).
- **Discriminated unions on `type`** (zod `discriminatedUnion`) are the canonical pattern for tile/monitor variants — both schema and runtime dispatch use this.
- **Result-style returns** for fallible ops: `{ success: true, ... } | { success: false, error: string }` (see [host.ts pingHost](file:///Users/guneet/projects/mon/apps/daemon/src/jobs/host.ts#L31-L56)). No throwing for expected failure modes.
- **DB table naming**: every table goes through `pgTableCreator((name) => \`mon_${name}\`)` — never declare a raw `pgTable`.
- **No barrel `src/`**: most apps/packages put source at workspace root (`packages/db/index.ts`, `packages/config/index.ts`) — only `apps/*/src/` is nested.

## ANTI-PATTERNS (THIS PROJECT)

- **No relative parent imports.** `eslint` flags `../*` and `../**/*` (warn) — use `@/*` or `@mon/*` instead. See [apps/website/.eslintrc.cjs](file:///Users/guneet/projects/mon/apps/website/.eslintrc.cjs#L50-L55).
- **Drizzle `delete`/`update` without `where`** is a hard `error` via `eslint-plugin-drizzle`.
- **Do not bypass `getConfig()`** — it auto-creates the empty config file at `env.CONFIG_PATH` and Zod-validates. Reading the TOML directly skips defaults.
- **Do not introduce `@/`-style aliases in `apps/docs` or `apps/daemon`** — only `apps/website` defines that path mapping.
- **`as Type` casts on Zod parses** are unnecessary — schemas return inferred types; cast only on the `getMonitorConfig` discriminated-extract pattern.

## UNIQUE STYLES

- **Tile location uses 1-indexed grid coords**, with **negative `col_start`/`row_start` meaning "from the end"** (e.g. `theme` tile defaults to `col_start: -1`). See [tile-generation.ts placeTile](file:///Users/guneet/projects/mon/apps/website/src/lib/client/tile-generation.ts#L60-L113).
- **Cron string is six-field** (with seconds): `"0 * * * * *"` = top of every minute. node-schedule, not BullMQ.
- **The daemon is bundled by esbuild to a single CJS file** (`apps/daemon/dist/daemon.cjs`) and run via `bun dist/daemon.cjs`. Workspace symlinks are inlined at build time — do not assume runtime resolution of `@mon/*`.
- **Tailwind v4** (no `tailwind.config.js`) — theme tokens live in CSS via `@theme` inside `apps/website/src/styles/globals.css`. The shadcn `components.json` has `"config": ""` intentionally.
- **Monorepo is named `@mon`** (the literal scope) — not a typo. Workspace packages are `@mon/website`, `@mon/daemon`, etc.

## COMMANDS

```bash
# repo-wide
bun i                          # install all workspaces
bun run lint                   # tsc --noEmit + next lint (website + docs)
bun run format:check           # prettier check
bun run format:write           # prettier write

# per-app (from apps/<name>)
bun run dev                    # next dev | bun src/index.ts (daemon)
bun run build                  # next build | esbuild bundle (daemon)

# db
bunx drizzle-kit generate      # from packages/db
bunx drizzle-kit push          # apply to env.DATABASE_URL
```

## NOTES

- **Drift hazard**: `apps/daemon/src/jobs/host.ts` imports `Host` from `"packages/config/schema"` (relative-ish bare path) instead of `@mon/config/schema` like its siblings. This works because Bun resolves it via the workspace root, but it's inconsistent — prefer the `@mon/*` alias when touching this file.
- **Auto-mkdir on startup**: `getConfig()` will create `/etc/mon/` and an empty config file on first run if missing. Inside containers, mount a writable volume.
- **README.md at repo root is a config example, not docs.** Real docs live in [apps/docs/src/content/](file:///Users/guneet/projects/mon/apps/docs/src/content).
- **Two `LoadingTile` etc. live in `apps/website/src/components/tiles/`** — `_base.tsx` (underscore-prefixed) is the shared composition primitive used by every tile, not a private file.
- **Deployments go over Tailscale** to a single SSH host (`secrets.SSH_HOST`) — there is no Kubernetes, Vercel, or PaaS in the loop.
