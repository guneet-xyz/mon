# PROJECT KNOWLEDGE BASE

**Last reviewed:** 2026-11-21

## OVERVIEW

`@mon` — self-hosted status-board monorepo. A TOML config on the website host defines tiles (hosts, websites, containers, GitHub repos, agent machines). Agents pull their jobs from the website over HTTP, run the checks and push the results back; the Next.js website is the only component that reads the config or touches Postgres, and renders the responsive tile grid. The migrator image applies the committed migrations. See [README.md](README.md) for the architecture, env vars and dev setup.

Stack: **Bun** runtime (workspaces), **TypeScript 5.8**, **Next.js 16** (website and docs), **React 19**, **Drizzle + postgres-js**, **Tailwind v4**, **shadcn/ui (new-york)**, **Zod v4**, **smol-toml**, **@t3-oss/env-core** / **env-nextjs**.

## STRUCTURE

```
mon/
├── apps/
│   ├── agent/       # Bun agent: pulls jobs from the website, pushes results (esbuild-bundled to dist/agent.cjs)
│   ├── website/     # Next.js status board + agent HTTP API (/api/agent/*); only Postgres client
│   └── docs/        # Next.js + Nextra MDX docs site (the config reference)
├── packages/
│   ├── config/      # TOML loader + Zod schema (single source of truth for tile shape; website-only)
│   ├── contracts/   # Zod schemas for the agent ⇄ website API (job tiles, ping DTOs)
│   ├── db/          # Drizzle schema, committed migrations (drizzle/), migrator Dockerfile (table prefix mon_*)
│   └── test-utils/  # createTestDb, mock GitHub/HTTP servers, TOML fixtures
├── test/            # manual Docker Compose stack (see test/README.md)
└── .github/workflows/  # ci.yml (all checks, reusable) + release.yml (release-please + image publishing)
```

## WHERE TO LOOK

| Task                          | Location                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add a new tile type           | [packages/config/schema.ts](packages/config/schema.ts) → job tile + ping DTO in [packages/contracts/index.ts](packages/contracts/index.ts) → agent job in [apps/agent/src/jobs/](apps/agent/src/jobs) and [apps/agent/src/index.ts](apps/agent/src/index.ts) → job mapping in [api/agent/jobs/route.ts](apps/website/src/app/api/agent/jobs/route.ts) and an ingest route under [api/agent/pings/](apps/website/src/app/api/agent/pings) → DB table + migration in [packages/db/](packages/db) → tile component in [apps/website/src/components/tiles/](apps/website/src/components/tiles), registered in [tiles/index.tsx](apps/website/src/components/tiles/index.tsx) and [server/monitors/index.ts](apps/website/src/lib/server/monitors/index.ts) |
| Agent ⇄ website API           | [packages/contracts/index.ts](packages/contracts/index.ts) (shapes), [apps/agent/src/client/](apps/agent/src/client) (agent side), [apps/website/src/app/api/agent/](apps/website/src/app/api/agent) + [lib/server/agent-auth.ts](apps/website/src/lib/server/agent-auth.ts) (website side)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| New env var                   | the app's own `src/env.ts`: [apps/agent/src/env.ts](apps/agent/src/env.ts) or [apps/website/src/env.ts](apps/website/src/env.ts). Document it in the README runtime contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Config docs                   | [apps/docs/src/content/](apps/docs/src/content) — the user-facing schema reference; keep it in step with `packages/config/schema.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Grid layout / placement logic | [apps/website/src/lib/client/tile-generation.ts](apps/website/src/lib/client/tile-generation.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| DB migration                  | edit [packages/db/schema.ts](packages/db/schema.ts), then `bunx drizzle-kit generate --name <change>` in `packages/db` and commit the SQL + `meta/`. See [packages/db/AGENTS.md](packages/db/AGENTS.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| CI/CD                         | [.github/workflows/](.github/workflows) — `ci.yml` runs every check; `release.yml` runs release-please and publishes images only from a merged release PR. See README → Releases and images                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## CONVENTIONS

- **Package manager: Bun**, version pinned in CI to `1.2.15`. Use `bun i`, `bunx`, never `npm`/`pnpm`.
- **Workspace imports**: `@mon/config`, `@mon/db`, `@mon/db/schema`, `@mon/db/drizzle`, `@mon/contracts`, `@mon/test-utils`. Each app owns its own `src/env.ts` (no shared env package). The `@/*` alias is **website-only** and points at `apps/website/src/*` (see root [tsconfig.json](tsconfig.json)).
- **The agent depends only on `@mon/contracts`.** It never imports `@mon/config` or `@mon/db`; everything it needs arrives in its job list. Keep it that way so agents need no config file or database credentials.
- **Prettier** is repo-wide ([prettier.config.mjs](prettier.config.mjs), following the [workspace Prettier standard](https://git.guneet.dev/guneet/workspace/src/branch/main/decisions/prettier-configuration.md)): `semi: false`, import order `built-ins/third-party → @mon/* → @/ → relative`. Tailwind class sort + package.json sort plugins are active. Run via `bun run format:write`.
- **Lint = repo-wide `tsc --noEmit` + eslint for website and docs**. Root `tsc` config **excludes** `apps/website` and `apps/docs` (they have their own `tsconfig.json` driven by Next). The agent and packages have no eslint, only `tsc`.
- **Discriminated unions** are the canonical pattern for variants: config tiles on `type` (`packages/config/schema.ts`), job tiles and ping DTOs on `kind` (`packages/contracts`). Both schema and runtime dispatch use this.
- **Agent jobs return DTOs, not throws**: each `apps/agent/src/jobs/*.ts` function returns a ping DTO with `error: null` on success or an error string on failure (see [host.ts pingHost](apps/agent/src/jobs/host.ts)), and the agent pushes it either way. No throwing for expected failure modes.
- **DB table naming**: every table goes through `createTable` (`pgTableCreator((name) => \`mon\_${name}\`)`) — never declare a raw `pgTable`.
- **No barrel `src/`**: packages put source at the package root (`packages/db/index.ts`, `packages/config/index.ts`) — only `apps/*/src/` is nested.
- **UI changes get a product-owner review**: run the `product-owner` subagent ([.opencode/agents/product-owner.md](.opencode/agents/product-owner.md)) before merging anything users see, and use it to write acceptance criteria before building. It reviews the screenshot tour (`bun run screenshots` from the repo root → `apps/website/screenshots/`), which seeds a representative board and captures desktop/phone, light/dark, nested groups and dialogs. Extend the tour (`apps/website/e2e/board.tour.ts`) when you add something it doesn't show. CI uploads the shots as the `screenshots` artifact.
- **TESTING**: unit + integration via `bun:test` (`bun run test`), E2E via Playwright (`bun run test:e2e`, which builds the agent bundle and then runs `cd apps/website && bun run e2e` — do NOT call `bunx playwright test` directly). Mock servers (`createMockGithubServer`, `createMockHttpHost`) live in [packages/test-utils/index.ts](packages/test-utils/index.ts) and run in-process (not Docker). Full reference: [TESTING.md](TESTING.md).

## ANTI-PATTERNS (THIS PROJECT)

- **No relative parent imports in the website.** `eslint` flags `../*` and `../**/*` (warn) — use `@/*` or `@mon/*` instead. See [apps/website/eslint.config.mjs](apps/website/eslint.config.mjs).
- **Drizzle `delete`/`update` without `where`** is a hard `error` via `eslint-plugin-drizzle`.
- **Do not parse the TOML yourself** — load it through `@mon/config` (`getConfig()`; in the website always the config cache in `lib/server/config-cache.ts`, which keeps the last good config when the file breaks), which creates a missing file and Zod-validates. Reading the TOML directly skips defaults and validation.
- **Do not introduce `@/`-style aliases in `apps/docs` or `apps/agent`** — only `apps/website` defines that path mapping.
- **Do not break older agents or websites.** Agents and websites upgrade independently: new job kinds and DTO fields must be optional or skippable (the agent's `parseJobs` skips job kinds it does not know), and migrations must be additive.
- **`as Type` casts on Zod parses** are unnecessary — schemas return inferred types; cast only on the `findMonitor` discriminated-extract pattern.

## UNIQUE STYLES

- **Tile location uses 1-indexed grid coords**, with **negative `col_start`/`row_start` meaning "from the end"** (e.g. `theme` tile defaults to `col_start: -1`). See [tile-generation.ts placeTile](apps/website/src/lib/client/tile-generation.ts).
- **Agents authenticate with a bearer token + `X-Agent-Id`**; the config stores only the token's SHA-256 (`[agents.<id>].token_hash`). An agent exits with code `78` on `401`, and backs off (5 s doubling to 5 min) while the website is unreachable.
- **The agent is bundled by esbuild to a single CJS file** (`apps/agent/dist/agent.cjs`) and run via `bun dist/agent.cjs`. Workspace symlinks are inlined at build time — do not assume runtime resolution of `@mon/*`.
- **Tailwind v4** (no `tailwind.config.js`) — theme tokens live in CSS via `@theme` inside `apps/website/src/styles/globals.css`. The shadcn `components.json` has `"config": ""` intentionally.
- **Monorepo is named `@mon`** (the literal scope) — not a typo. Workspace packages are `@mon/website`, `@mon/agent`, etc.

## COMMANDS

```bash
# repo-wide
bun i                          # install all workspaces
bun run lint                   # tsc --noEmit + eslint (website + docs)
bun run format:check           # prettier check
bun run format:write           # prettier write
bun run test                   # unit + integration (needs Docker)
bun run test:e2e               # agent bundle + Playwright (set E2E_PORT to avoid clashes; default 3055)
bun run screenshots            # screenshot tour → apps/website/screenshots/

# per-app (from apps/<name>)
bun run dev                    # next dev | bun src/main.ts (agent)
bun run build                  # next build | esbuild bundle (agent)

# db (from packages/db, with DATABASE_URL set)
bunx drizzle-kit generate --name <change>  # write a migration from schema.ts changes
bunx drizzle-kit migrate                   # apply the committed migrations
```

## NOTES

- **Auto-create on first run**: `getConfig()` creates the config's directory and an empty file if missing. Inside containers, mount a writable volume or an existing config.
- **Config edits apply without restarts**: the website rereads the file when it changes and agents get their new job list on their next poll.
- **Docs**: the root [README.md](README.md) covers architecture, env vars, dev setup and releases; the config reference lives in [apps/docs/src/content/](apps/docs/src/content). `apps/website/README.md` and `apps/docs/README.md` are unmodified create-t3-app templates; ignore them.
- **`_base.tsx` in `apps/website/src/components/tiles/`** (underscore-prefixed) is the shared composition primitive used by every tile, not a private file.
- **Releases = merging the release-please PR.** Use Conventional Commits; on `0.x` a breaking change bumps only the minor version, and `1.0.0` is cut deliberately with a `Release-As: 1.0.0` commit footer. Never edit `CHANGELOG.md`, `.release-please-manifest.json` or the root `package.json` version by hand. Images are published only from releases as `cr.guneet.dev/mon/<component>:vX.Y.Z` (+ `vX.Y`, `vX` from 1.0, `latest`; no `edge` or `sha-…` tags); there is no manual publish path and CI deploys nothing. Pin every action in `.github/workflows/` to a full commit SHA with a version comment.
