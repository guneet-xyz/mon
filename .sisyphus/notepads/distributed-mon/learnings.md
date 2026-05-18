# Learnings

## 2026-05-18 Session Start

- Package manager: Bun 1.2.15. Use `bun i`, `bunx`, never npm/pnpm.
- Workspace imports: `@mon/config`, `@mon/db`, `@mon/db/schema`, `@mon/db/drizzle`, `@mon/env`
- `@/*` alias is website-only → `apps/website/src/*`
- Prettier: `semi: false`, import order `@mon → @/ → relative`
- Discriminated unions on `type` (zod `discriminatedUnion`) are canonical pattern
- Result-style returns: `{ success: true, ... } | { success: false, error: string }` for fallible ops
- DB table naming: every table via `pgTableCreator((name) => \`mon\_${name}\`)`
- No barrel `src/` — packages put source at workspace root
- Tailwind v4 — no tailwind.config.js; tokens in CSS via `@theme`
- No relative parent imports (`../`) — use `@/*` or `@mon/*`
- Drizzle delete/update without where is hard error
- Do NOT bypass `getConfig()` — it auto-creates config file
- No `@/`-style aliases in apps/docs or apps/daemon

## Schema field names (verified from packages/config/schema.ts)

- host monitor: `address` (NOT `host`)
- website monitor: `url`
- container monitor: `container_name`, `docker_socket`
- github monitor: `repo`

## DB exports (verified from packages/db/schema.ts)

- `hostPings` (line 17), `websitePings` (line 31), `containerPings` (line 45)
- `githubCheckRun` (line 77) — has `_id` serial PK + `id` bigint (GitHub's ID)
- `githubPings` (line 101) — FK `checkRunId → githubCheckRun.id` (after T3 migration)
- Tables have NO `id` column by default (except githubCheckRun.\_id)
- T3 adds `pingId uuid PK defaultRandom()` to all ping tables

## DTO conventions (from T2 plan)

- All DTOs have `kind` discriminator literal
- Success = `error === null` (NO `success: boolean` field)
- `check_run_id` in GithubPingDTO = GitHub's bigint ID (not internal serial)
- ContainerPingDTO has NO `latency_ms` field

## 2026-05-18 @mon/contracts Package Created

- Created `packages/contracts/` with HTTP DTO Zod schemas and JobTile types
- Package structure: `package.json` + `index.ts` (no src/ subdirectory)
- Exports 4 JobTile schemas (Host, Website, Container, GitHub) + discriminated union
- Exports 5 Ping DTO schemas (Host, Website, Container, GitHub, GithubCheckRun)
- Exports 2 Ingest response schemas (Success, Error)
- All schemas have inferred TypeScript types exported
- GithubPingDTO has `.refine()` validation: either (commit_hash + check_run_id) or error must be non-null
- ContainerPingDTO intentionally has NO latency_ms field (matches DB schema)
- GithubCheckRunDTO status/conclusion enums match packages/db/schema.ts enums
- Root package.json workspaces array updated to include "packages/contracts"
- `bun i` succeeds; contracts package TypeScript check passes
- No dependencies beyond zod (v3.25.41)

## 2026-05-18 Schema Extension (Daemons)

- Added `DaemonSchema` with `token_hash` (sha256 hex) and optional `description`
- Added `daemons` field to `ConfigSchema` as optional record, defaults to `{}`
- Extended `MonitorSchema` with `daemon` (default "default") and `interval_seconds` (optional positive int)
- Added `github_token` field to github variant only (per-tile PAT override)
- Exported `Daemon` type from schema
- Implemented `getDaemonAssignments(config, daemonId)` — filters MonitorTiles by daemon assignment
- Implemented `verifyDaemonToken(config, daemonId, presentedToken)` — constant-time token verification using Node crypto
- All 4 monitor variants (host, website, container, github) inherit daemon + interval_seconds from MonitorSchema
- Non-monitor tiles (empty, hidden, logo, theme) do NOT have daemon/interval_seconds fields
- `bun run lint` passes; no test files exist yet in packages/config

## Schema migration: daemon_id + ping_id PK + FK re-point (initial baseline)

- `packages/db` had no prior `drizzle/` migrations folder, so `drizzle-kit generate` produced a single baseline `0000_strong_bullseye.sql` with full CREATE TABLE statements (no `ADD COLUMN`). Populated-DB safety concerns from the spec do not apply to this generated SQL — fresh tables with `DEFAULT gen_random_uuid() NOT NULL` are safe.
- `drizzle-kit generate` needs env vars from `@mon/env`. Use `SKIP_ENV_VALIDATION=1` to bypass (DATABASE_URL etc.).
- `drizzle-kit check` fails with `SKIP_ENV_VALIDATION=1` because the unvalidated `env.DATABASE_URL` becomes literal `"postgresql"` — run check only with real env in CI.
- `githubCheckRun.id` (the GitHub-supplied bigint) now has `uniqueIndex("github_check_run_id_unique")` so it can serve as FK target for `githubPings.checkRunId`. `_id serial` remains the internal PK.
- `pingId: uuid("ping_id").notNull().unique().defaultRandom()` on `githubCheckRun` (NOT primaryKey — coexists with `_id` PK). All other ping tables use `pingId` as the primary key directly.

## 2026-05-18 Playwright setup (task 5)

- `@playwright/test ^1.40.0` added to apps/website devDependencies
- `apps/website/playwright.config.ts` created (chromium only, workers=1, fullyParallel=false)
- webServer reuses dev server in non-CI; sets SKIP_ENV_VALIDATION=1 + test DB/config paths
- `bun run e2e` script wired
- `bunx playwright install chromium` (no `--with-deps` needed on macOS)
- `bunx playwright test --list` exits 0 with no tests found (expected — e2e/ is empty)

## 2026-05-18 T7 Docs + Tests

- packages/config now has schema.test.ts (17 tests, all passing) covering: daemon block parsing, default daemon="default", interval_seconds optional/positive-int, github_token optional, getDaemonAssignments filtering (matches, unknown id → [], excludes non-monitor tiles), verifyDaemonToken (correct/wrong/unknown/empty)
- Test pattern: `if (tile.type !== "host") throw new Error(...)` for type narrowing inside discriminated union tests (avoids `as` casts per project convention)
- bun:test imports: `import { describe, expect, test } from "bun:test"` — same pattern as other workspaces
- apps/docs uses Nextra; no frontmatter required, just MDX. Build via `bun run build` (next build) succeeds with 12 static pages.
- Docs config page is `apps/docs/src/content/configuration/index.mdx` — added "## Distributed daemons" section with subsections (Declaring, Generating, Assigning, interval, github_token, fetching, migration checklist)
- README example TOML updated with `[daemons.default]` block + `daemon = "default"` on tiles, with link to docs section

## 2026-05-18 T10–T13: Website Ingest Helpers Created

- Created 4 ingest helper files in `apps/website/src/lib/server/ingest/`:
  - `host.ts` — insertHostPing(HostPingDTO) → { ok: true, deduplicated: boolean }
  - `website.ts` — insertWebsitePing(WebsitePingDTO) → same pattern
  - `container.ts` — insertContainerPing(ContainerPingDTO) → NO latency field
  - `github.ts` — insertGithubCheckRun + insertGithubPing (2 functions)
- All use Drizzle `.onConflictDoNothing({ target: table.pingId })` for deduplication
- Return `{ ok: true, deduplicated: rows.length === 0 }` (empty array = duplicate)
- All DTOs use snake_case (ping_id, daemon_id, recorded_at, latency_ms, etc.)
- DB columns use camelCase (pingId, daemonId, timestamp, latency, etc.)
- GithubCheckRun: do NOT pass `_id` (auto-generated serial PK)
- GithubPing: `checkRunId` is FK to `githubCheckRun.id` (GitHub's bigint ID)
- Created 4 test files using `bun:test` + `mock.module("@mon/db", ...)`
- All 10 tests pass; files properly formatted (Prettier: `semi: false`, import order `@mon → @/ → relative`)

## 2026-05-18 T14/T15 Daemon Client

- `bun:test` mocks: `mock(async () => ...)` returns `{ mock: { calls } }` for assertions
- `mock(fn) as unknown as typeof fetch` is needed to satisfy fetch type signature
- AbortSignal-aware sleep: check `signal.aborted` BEFORE setTimeout to short-circuit
- pull-loop pattern: pass `exit` as injectable param (default `process.exit.bind(process)`) for testability
- 409 from ingest endpoints = deduplicated success; treat as 2xx for body-parsing purposes
- Pre-existing TSC errors on `main` in packages/config/schema.test.ts and apps/daemon/src/jobs/github.ts — not introduced by this work

## T8/T9 (2026-05-18)

- `bun test` from repo root loads `@mon/env` at module-import time → DATABASE_URL required
- Solution: root `bunfig.toml` with `[test] preload = ["./apps/website/test-setup.ts"]`
- test-setup.ts sets `SKIP_ENV_VALIDATION=1` + dummy `DATABASE_URL` before any test imports
- `getConfig()` with empty file fails Zod (`tiles` required) — tests must write `tiles = []`
- `verifyDaemonToken` already exists in `packages/config/schema.ts` — `daemon-auth.ts` is the website-facing wrapper that also parses request headers and returns Result-style discriminated union
- `Config` type's `daemons` field is non-optional after Zod parse (defaults to `{}`) but use `config.daemons?.[id]` for safety

## 2026-05-18 GET /api/daemon/jobs route

- Created `apps/website/src/app/api/daemon/jobs/route.ts` (Next 14 App Router handler)
- `getDaemonAssignments` is in `@mon/config/schema` (NOT re-exported from `@mon/config` index)
- Config monitor tiles use `key` (NOT `id`) — must map `tile.key → JobTile.id`
- Tiles have NO `cron` field — only optional `interval_seconds`; route derives 6-field cron:
  - `< 60s` → `*/N * * * * *`
  - `>= 60s` → `0 */M * * * *` (minutes)
  - fallback uses `options.ping_interval_ms / 1000`
- Response uses `Response.json(JobsResponseSchema.parse(...))` to strip extra fields → guarantees no `token_hash`/`daemons` leakage
- Test pattern: `mock.module("@/lib/server/config-cache", () => ({ getCachedConfig: async () => currentConfig }))` + dynamic `await import("./route")` after mock
- Real `verifyBearerToken` + real `getDaemonAssignments` exercised end-to-end (only filesystem-touching `config-cache` mocked)
- 7/7 tests pass; lsp clean on both files
- Pre-existing lint failures in apps/daemon (missing exports) are unrelated to this change

## Daemon orchestrator rewrite

- `apps/daemon/src/index.ts` now uses `WebsiteApiClient` + `startPullLoop` only. No `@mon/config`/`@mon/db`/`smol-toml`.
- Package.json was already clean (no postgres/drizzle/smol-toml/config/db deps); only daemon source needed change.
- Job files (`host.ts`, `website.ts`, `container.ts`, `github.ts`) still export `scheduleXxxJob` (cron-based, unused by new index) AND `pingXxx` (used). Kept both — pull-loop is the only scheduler invoked.
- `pingGithub` returns `{ ping, checkRuns }`; push ping then iterate checkRuns via `pushGithubPing`.
- Catch errors inside `executeJob` to keep pull loop alive — only `UnauthorizedError` (handled in pull-loop) exits.
