# Distributed @mon: Config-on-Website, Daemons-as-Workers

## TL;DR

> **Quick Summary**: Invert the @mon architecture — make the website the single source of truth for config + DB writes, and turn daemons into stateless workers that pull their assigned jobs over HTTP and push results back. Add a full test pyramid.
>
> **Deliverables**:
>
> - New TOML schema with `[daemons.<id>]` registration block + per-tile `daemon` assignment field
> - `daemon_id` column added to all 5 ping tables (drizzle migration)
> - 5 new website API routes: `GET /api/daemon/jobs` + `POST /api/daemon/pings/{host,website,container,github}`
> - Daemon rewritten as a stateless pull/push worker (no `@mon/config` file read, no `@mon/db` import)
> - Bearer-token auth (SHA-256 digest of high-entropy 32-byte daemon tokens, constant-time compared) on every daemon→website request
> - Idempotency keys on every ping ingest (daemon-generated UUID + unique constraint)
> - Bun test unit coverage for schema, auth, jobs, route handlers
> - Postgres-backed integration tests for ingest pipeline
> - Playwright e2e: real website + real daemon child process + real Postgres → ping appears in UI
> - Updated docs (`apps/docs`) and root README example
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 4 waves + final verification wave
> **Critical Path**: T1 (config schema) → T3 (DB migration) → T6 (DTOs) → T10 (auth) → T13 (jobs endpoint) → T17 (daemon orchestrator) → T22 (e2e) → F1-F4 → user okay

---

## Context

### Original Request

> Can we cleanup the architecture for mon? I want the mon-website to be the one where we provide the config. And in the config, we should be able to configure which daemon should do which job. And we shouldn't need to provide a config to the daemon. Daemon should pull config from the website that which job it needs to do. Then they should push to a website endpoint and website should push to db. Also create tests to validate all of this in unit and end to end tests.

### Interview Summary

**Confirmed Decisions**:

- **Config storage**: TOML on the **website's** filesystem at `env.CONFIG_PATH`. No new DB table for config. Operator edits TOML the same way they do today; on the website now instead of the daemon.
- **Daemon assignment**: each tile gets a `daemon` field (string, references a daemon ID). New top-level `[daemons.<id>]` block declares known daemons and their hashed tokens.
- **Auth**: shared secret per daemon. `Authorization: Bearer <token>` on every daemon→website request. The website stores **`sha256(token)` as hex** in the TOML's `[daemons.<id>].token_hash` field, computes `sha256(presented_token)` on each request, and compares with `crypto.timingSafeEqual`. No HMAC key is involved — the security relies on the 32-byte (256-bit) random entropy of the token itself, which makes precomputation/brute-force infeasible. Fast enough on the hot path that no token-verification cache is needed.
- **Work distribution**: poll-pull. Daemon polls `GET /api/daemon/jobs` every `DAEMON_POLL_INTERVAL_SECONDS` (default 60), caches assignment, schedules cron locally with `node-schedule`, POSTs each ping to `/api/daemon/pings/{type}`.
- **Migration**: hard cut. Daemon's TOML loader and DB client are deleted in this PR.
- **DB attribution**: nullable `daemon_id text` column on all 5 ping tables.
- **Test pyramid**: full — bun test unit, postgres-backed integration, Playwright e2e.

### Research Findings

- **Current daemon jobs** (apps/daemon/src/jobs/): `host.ts` (ICMP via execa), `website.ts` (HTTP HEAD via curl), `container.ts` (Docker API via curl), `github.ts` (GitHub API).
- **Daemon writes to 5 tables** directly via `@mon/db`: `mon_host_ping`, `mon_website_ping`, `mon_container_ping`, `mon_github_ping`, `mon_github_check_run`. All writes use Drizzle `insert()`.
- **Daemon entry point** (apps/daemon/src/index.ts): calls `getConfig()`, filters tiles by `type`, calls `node-schedule.scheduleJob(cron, () => job(tile))` once per monitor.
- **Daemon ships as a single esbuild CJS bundle** (apps/daemon/dist/daemon.cjs) — workspace symlinks inlined at build time.
- **Website routing** (apps/website): Next 14 app router. Existing server actions in `src/lib/server/actions/` query DB via `src/lib/server/monitors/{host,website,container,github}.ts`. **Zero existing API routes**, **zero middleware**, **zero auth**.
- **Website already calls `getConfig()`** server-side in `app/page.tsx` — works at request time; no caching today.
- **Zero tests** in the repo. No `bun test` config, no Playwright, no `@testing-library`.
- **`@mon/env`** is shared across all workspaces — config now belongs on the website side, so `CONFIG_PATH` must remain valid for the website and become **unused** in the daemon (replaced by `WEBSITE_URL`, `DAEMON_ID`, `DAEMON_TOKEN`).

### Metis Review

**Critical gaps surfaced & resolved**:

- **C1 (token hashing)**: Default to **plain SHA-256 digest** of a high-entropy (32-byte / 256-bit random) token, compared in constant time via `crypto.timingSafeEqual`. No HMAC (no key needed — security comes from token entropy). No argon2 (unnecessary at this entropy; avoids hot-path cost). Documented in T8 and T10.
- **C2 (idempotency)**: All ping ingest endpoints accept a daemon-generated `ping_id` UUID. Each ping table gets a **`UNIQUE` index on `ping_id`**. POST with duplicate ID returns 200 + `{ deduplicated: true }`. Documented in T6/T13/T14.
- **C3 (config reload)**: Per-request `getConfig()` with a **5-second in-memory TTL cache** keyed on TOML file mtime. Acceptable for self-hosted single-operator scale. Manual reload via process restart documented. No file watcher.
- **C4 (daemon error states)**: `UNAUTH` (401) = log + exit code 78 (immediate; supervisor restarts with backoff). `UNREACHABLE` (network err) = exponential backoff capped at 5 min. `EMPTY_JOBS` = warn + keep polling. Documented in T17.

---

## Work Objectives

### Core Objective

Move config ownership + DB write ownership from the daemon to the website. Daemons become stateless workers that authenticate, pull their assigned jobs, and push timestamped results. Cover the new contract with unit + integration + e2e tests.

### Concrete Deliverables

- `packages/config/schema.ts`: extended Zod schema (daemons block, per-tile daemon field, optional `interval_seconds` per tile, `ping_id` in DTOs)
- `packages/db/schema.ts`: `daemon_id text` column on all 5 ping tables + `ping_id uuid unique` constraint
- `packages/db/migrations/*.sql`: drizzle-kit generated migration
- `packages/contracts/` (new workspace): shared HTTP DTO Zod schemas + types — single source for daemon ↔ website wire format
- `apps/website/src/app/api/daemon/jobs/route.ts`: `GET` — returns auth'd daemon's job list
- `apps/website/src/app/api/daemon/pings/host/route.ts`: `POST` — ingest host ping
- `apps/website/src/app/api/daemon/pings/website/route.ts`: `POST`
- `apps/website/src/app/api/daemon/pings/container/route.ts`: `POST`
- `apps/website/src/app/api/daemon/pings/github/route.ts`: `POST` (incl. check runs)
- `apps/website/src/lib/server/daemon-auth.ts`: token hashing + bearer-auth helper
- `apps/website/src/lib/server/config-cache.ts`: 5s-TTL config cache
- `apps/website/src/lib/server/ingest/{host,website,container,github}.ts`: DB insert logic (moved from daemon)
- `apps/daemon/src/client/{api-client.ts,pull-loop.ts}`: HTTP client + poll loop
- `apps/daemon/src/jobs/*.ts`: rewritten to **return a DTO** instead of inserting
- `apps/daemon/src/index.ts`: new orchestrator (no `getConfig`, no DB, no `@mon/config` reads, no `@mon/db` imports)
- Test infrastructure: `bun test` config, ephemeral Postgres test harness (testcontainers-style via Docker), Playwright config + browsers
- Unit tests: schema, auth, every job's executor (network mocked), every route handler (DB mocked)
- Integration tests: each ingest endpoint against a real ephemeral Postgres
- E2E test: spawn website + daemon child processes, real Postgres, verify ping flows end-to-end and renders in UI
- Updated docs in `apps/docs/src/content/` covering new config format + daemon deployment
- Updated root `README.md` example
- Updated `.github/workflows/deploy-daemon.yml` (new env vars) and `deploy-website.yml` (CONFIG_PATH now matters here)

### Definition of Done

- [ ] `bun run lint` passes (root + all apps)
- [ ] `bunx drizzle-kit generate` produces a clean migration with no drift
- [ ] `bun test` from the repo root runs all unit + integration tests, **>90% statement coverage on new code** (`packages/contracts`, `packages/config`, `apps/daemon/src`, `apps/website/src/lib/server/ingest`, `apps/website/src/lib/server/daemon-auth`, route handlers)
- [ ] Playwright e2e (`apps/website/e2e/distributed-mon.spec.ts`) passes against a real Postgres + real daemon process
- [ ] `apps/daemon/dist/daemon.cjs` builds via esbuild and contains no reference to `pg`, `postgres`, `drizzle-orm`, `smol-toml`, or `@mon/db`
- [ ] Daemon container starts with only `WEBSITE_URL`, `DAEMON_ID`, `DAEMON_TOKEN` env vars (no `CONFIG_PATH`, no `DATABASE_URL`, no `GITHUB_TOKEN` — GitHub credentials provided per-tile from website's config)
- [ ] All 4 final-verification agents (F1–F4) approve and user explicitly accepts

### Must Have

- TOML-only config, **on the website**, with the new `[daemons.<id>]` block and per-tile `daemon` field
- 5 ping tables with `daemon_id` + `ping_id` unique columns
- Bearer-token auth on all 5 daemon API routes
- Daemon polls + pushes; never reads filesystem config; never imports `@mon/db`
- Idempotent ingest (duplicate `ping_id` ⇒ no-op + 200)
- Full test pyramid as listed above
- Hard cut migration (no dual-mode flag)
- `daemon` field on every tile is **optional**, defaulting to `"default"` (back-compat for single-daemon setups)
- Clean daemon error states: 401 ⇒ exit 78; network error ⇒ exponential backoff (max 5 min); empty job list ⇒ warn + keep polling

### Must NOT Have (Guardrails)

- **NO web UI for editing config** — TOML edits remain out-of-band (operator edits the file on the website host)
- **NO multi-tenant / RBAC / user accounts** — single-operator self-hosted tool
- **NO queue / broker** between daemon and website (RabbitMQ, Redis, etc.) — direct HTTP only
- **NO service mesh / mTLS / cert rotation** — shared bearer secret is sufficient
- **NO observability overhaul** — no Prometheus, no OpenTelemetry, no new logging framework. `console.log` remains the daemon's log mechanism
- **NO server-driven execution** — website never calls daemon
- **NO config-in-DB** — TOML stays as the source format
- **NO file watcher** on the website for config changes — 5s TTL cache is enough; operator restarts website to force-pick-up
- **NO new abstractions over Drizzle** — direct `db.insert()` in ingest helpers
- **NO mocking framework beyond bun:test's built-in `mock()`** — keep dependencies minimal
- **NO premature splitting** of `packages/contracts` into per-monitor sub-packages — single flat package
- **NO `as any` / `@ts-ignore`** — Zod inference + discriminated unions handle everything
- **NO commented-out code** left behind from the migration
- **NO retention of daemon's `@mon/db` import**, `@mon/config` import, `getConfig` call, `CONFIG_PATH` reference, `DATABASE_URL` reference, or `smol-toml` dependency

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: NO (zero tests in the repo today)
- **Automated tests**: YES — **TDD** for new code where practical, **tests-after** for migration-style refactors of existing files
- **Framework**: **bun test** (unit + integration), **@playwright/test** (e2e), **testcontainers** or docker-compose for ephemeral Postgres
- **Coverage target**: ≥ 90% statements on new code (`packages/contracts`, ingest helpers, daemon client/loop, route handlers, auth helper)

### QA Policy

Every task includes Agent-Executed QA Scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{slug}.{ext}`.

- **Frontend/UI tiles**: Playwright — navigate, screenshot, assert DOM
- **Daemon process**: `interactive_bash` via tmux — start daemon, send signals, capture logs
- **API endpoints**: `Bash` + `curl` — POST/GET, assert status + response body shape
- **Daemon library**: `Bash` + `bun` REPL — import module, call function, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — start immediately, all parallel):
├── T1:  Extend packages/config/schema.ts (daemons block, per-tile daemon field, interval_seconds)
├── T2:  Create packages/contracts/ workspace (HTTP DTO Zod schemas)
├── T3:  Drizzle schema additions (daemon_id, ping_id unique) + generate migration
├── T4:  Bun test config + ephemeral Postgres harness (packages/test-utils/)
├── T5:  Playwright install + apps/website/playwright.config.ts
├── T6:  Update packages/env: split into website-env and daemon-env consumers
└── T7:  Update root README.md + apps/docs config example (new TOML shape)

Wave 2 (Server primitives + worker primitives — after Wave 1):
├── T8:  Website: src/lib/server/daemon-auth.ts (SHA-256 verify, bearer parser) [deps: T2, T6]
├── T9:  Website: src/lib/server/config-cache.ts (5s TTL) [deps: T1]
├── T10: Website: src/lib/server/ingest/host.ts (DB insert + idempotency) [deps: T3]
├── T11: Website: src/lib/server/ingest/website.ts [deps: T3]
├── T12: Website: src/lib/server/ingest/container.ts [deps: T3]
├── T13: Website: src/lib/server/ingest/github.ts (incl. check_runs) [deps: T3]
├── T14: Daemon: src/client/api-client.ts (typed HTTP client) [deps: T2, T6]
└── T15: Daemon: src/client/pull-loop.ts (poll + cron scheduler) [deps: T14]

Wave 3 (Endpoints + job rewrites + integration tests — after Wave 2):
├── T16: Website: GET /api/daemon/jobs route + tests [deps: T8, T9]
├── T17: Website: POST /api/daemon/pings/host route + integration test [deps: T8, T10]
├── T18: Website: POST /api/daemon/pings/website route + integration test [deps: T8, T11]
├── T19: Website: POST /api/daemon/pings/container route + integration test [deps: T8, T12]
├── T20: Website: POST /api/daemon/pings/github route + integration test [deps: T8, T13]
├── T21: Daemon: rewrite jobs/host.ts to return DTO (unit test mocks execa) [deps: T2, T14]
├── T22: Daemon: rewrite jobs/website.ts to return DTO (unit test mocks fetch) [deps: T2, T14]
├── T23: Daemon: rewrite jobs/container.ts to return DTO (unit test mocks fetch) [deps: T2, T14]
└── T24: Daemon: rewrite jobs/github.ts to return DTO (unit test mocks fetch) [deps: T2, T14]

Wave 4 (Integration + cleanup — after Wave 3):
├── T25: Daemon: new src/index.ts orchestrator (delete getConfig/db imports) [deps: T15, T21-T24]
├── T26: Verify esbuild bundle has no pg/drizzle/smol-toml/@mon/db [deps: T25]
├── T27: Update .github/workflows/deploy-daemon.yml + deploy-website.yml env vars [deps: T25]
├── T28: Playwright e2e: daemon child process + website + real Postgres [deps: T16-T20, T25]
└── T29: Delete dead code: apps/daemon/src/jobs/* old DB writes, packages/config from daemon, etc. [deps: T25, T28]

Wave FINAL (after ALL tasks — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: T1 → T3 → T10 → T16 → T25 → T28 → F1-F4 → user okay
Parallel Speedup: ~70% vs sequential
Max Concurrent: 9 (Wave 3)
```

### Dependency Matrix

| Task    | Depends On       | Blocks                               |
| ------- | ---------------- | ------------------------------------ |
| T1      | —                | T9, T16, T21-T24, T25                |
| T2      | —                | T8, T10-T13, T14, T17-T24            |
| T3      | —                | T10-T13, T17-T20                     |
| T4      | —                | All integration tests (T17-T20, T28) |
| T5      | —                | T28                                  |
| T6      | —                | T8, T14, T25, T27                    |
| T7      | T1               | —                                    |
| T8      | T2, T6           | T16-T20                              |
| T9      | T1               | T16                                  |
| T10-T13 | T3               | T17-T20                              |
| T14     | T2, T6           | T15, T21-T24                         |
| T15     | T14              | T25                                  |
| T16     | T8, T9           | T28                                  |
| T17-T20 | T8, T10-T13, T4  | T28                                  |
| T21-T24 | T2, T14          | T25                                  |
| T25     | T15, T21-T24     | T26, T27, T28, T29                   |
| T26     | T25              | F1, F2                               |
| T27     | T25              | F1                                   |
| T28     | T16-T20, T25, T5 | F1-F4                                |
| T29     | T25, T28         | F1-F4                                |

### Agent Dispatch Summary

- **Wave 1** (7): T1, T2, T6 → `quick`; T3 → `unspecified-high`; T4, T5 → `unspecified-high`; T7 → `writing`
- **Wave 2** (8): T8 → `unspecified-high`; T9 → `quick`; T10-T13 → `quick`; T14, T15 → `unspecified-high`
- **Wave 3** (9): T16 → `unspecified-high`; T17-T20 → `unspecified-high`; T21-T24 → `quick`
- **Wave 4** (5): T25 → `deep`; T26 → `quick`; T27 → `quick`; T28 → `unspecified-high` + `playwright` skill; T29 → `quick`
- **FINAL** (4): F1 → `oracle`; F2 → `unspecified-high`; F3 → `unspecified-high` + `playwright`; F4 → `deep`

---

## TODOs

- [x] 1. Extend `packages/config/schema.ts` with daemons block + per-tile daemon field + optional `github_token`

  **What to do**:

  - Add a new top-level `daemons` field to `ConfigSchema`: `z.record(z.string(), DaemonSchema).optional().default({})` where `DaemonSchema = z.object({ token_hash: z.string().regex(/^[0-9a-f]{64}$/), description: z.string().optional() })`.
  - Add `daemon: z.string().default("default")` to each of the 4 monitor variants of the discriminated union (`host`, `website`, `container`, `github`) — leave non-monitor tile types (`empty`, `hidden`, `logo`, `theme`) unchanged.
  - Add `interval_seconds: z.number().int().positive().optional()` to each of the 4 monitor variants. Daemon will use this to derive a cron string if present; otherwise fall back to `options.ping_interval_ms` (the existing global default — confirmed present at `packages/config/schema.ts` line 4).
  - Add `github_token: z.string().optional()` to the `github` monitor variant only — this becomes the per-tile credential that flows in the jobs response. **Reason**: the daemon must not read `env.GITHUB_TOKEN` (it would re-introduce a global env), so the website passes per-tile tokens it knows about.
  - Export a new helper `getDaemonAssignments(config, daemonId)` that returns `{ tiles: Array<MonitorTile>, daemon: Daemon | undefined }` — used by the website's `/api/daemon/jobs` route.
  - Export a new helper `verifyDaemonToken(config, daemonId, presentedToken): boolean` using `crypto.timingSafeEqual` over the SHA-256 hex of the presented token vs the stored `token_hash`. Wrap both buffers via `Buffer.from(..., "hex")`; return `false` if lengths differ before compare.

  **Must NOT do**:

  - Do NOT change the existing tile discriminator (`type`); just add fields.
  - Do NOT change the existing `address` / `url` / `container_name` / `repo` field names — they are the source of truth (confirmed by reading `packages/config/schema.ts` lines 38, 42, 46-47, 51).
  - Do NOT introduce a new file — keep the schema in `schema.ts`.
  - Do NOT add JSDoc bloat. Single-line `// why` comments only.
  - Do NOT cast Zod parse outputs (`as Type`).

  **Recommended Agent Profile**:

  - **Category**: `quick` — single file, well-scoped schema additions.
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T4, T5, T6, T7)
  - **Blocks**: T7, T9, T16, T21-T24, T25
  - **Blocked By**: None

  **References**:

  - `packages/config/schema.ts` lines 32-81 — existing discriminated union; the 4 monitor variants are at lines 36-52. Each gets the new fields. The 4 non-monitor variants (lines 53-78) stay untouched.
  - `packages/config/index.ts` — `getConfig()` reads the TOML; no changes here.
  - Pattern: existing tile variants use snake_case for TOML compatibility — match it.
  - External: [Zod discriminated unions](https://zod.dev/?id=discriminated-unions).

  **WHY each reference matters**:

  - `schema.ts` is the single source of truth for both website and daemon (until T25 deletes the daemon's dependency). Field names MUST match the existing `address`/`url`/`container_name`/`repo` — these become the keys in the jobs response payload.
  - The discriminator (`type`) is also the discriminator for runtime dispatch on the website (`src/components/tiles/index.tsx`) and daemon (`src/jobs/*`), so don't break it.

  **Acceptance Criteria**:

  - [ ] `bun run lint` passes
  - [ ] Parse a TOML containing `[daemons.default]` + a host tile with `daemon = "default"` succeeds
  - [ ] Parse a TOML with a host tile missing the `daemon` field — `daemon` defaults to `"default"` (backwards-compat)
  - [ ] Parse a TOML with a GitHub tile + `github_token = "ghp_xxx"` succeeds; tile without `github_token` also succeeds (field is optional)

  **QA Scenarios**:

  ```
  Scenario: Valid daemons block + host tile parses successfully
    Tool: Bash (bun)
    Preconditions: schema changes applied
    Steps:
      1. Create temp TOML at /tmp/mon-test.toml with:
         [[tiles]]
         type = "host"
         key = "h1"
         address = "1.1.1.1"
         daemon = "primary"

         [daemons.primary]
         token_hash = "0000000000000000000000000000000000000000000000000000000000000000"
      2. Run: CONFIG_PATH=/tmp/mon-test.toml bun -e 'import { getConfig } from "@mon/config"; console.log(JSON.stringify(getConfig(), null, 2))'
      3. Assert: exit 0; JSON output contains daemons.primary.token_hash AND tiles[0].daemon === "primary" AND tiles[0].address === "1.1.1.1"
    Expected Result: Process exits 0; stdout JSON contains all three fields.
    Failure Indicators: ZodError, missing daemon field, non-zero exit
    Evidence: .sisyphus/evidence/task-1-valid-toml.txt

  Scenario: Backwards-compat — host tile with no daemon field defaults to "default"
    Tool: Bash (bun)
    Steps:
      1. Create TOML with [[tiles]] type="host" key="h1" address="1.1.1.1" (no daemon field, no [daemons] table)
      2. Run getConfig() and assert tiles[0].daemon === "default"
    Expected Result: Exit 0; default applied.
    Evidence: .sisyphus/evidence/task-1-default.txt

  Scenario: GitHub tile with optional github_token parses
    Tool: Bash (bun)
    Steps:
      1. TOML with [[tiles]] type="github" key="g1" repo="owner/repo" github_token="ghp_test"
      2. Run getConfig(); assert tiles[0].github_token === "ghp_test"
    Expected Result: Exit 0; field present.
    Evidence: .sisyphus/evidence/task-1-gh-token.txt

  Scenario: Tile assigned to nonexistent daemon parses; helper returns undefined daemon
    Tool: Bash (bun)
    Steps:
      1. TOML with [[tiles]] daemon = "ghost-daemon" but no [daemons.ghost-daemon] block
      2. getConfig() — must NOT throw
      3. getDaemonAssignments(config, "ghost-daemon") — returns { tiles: [<tile>], daemon: undefined }
    Expected Result: Parse succeeds; helper returns the tile but undefined daemon (caller's responsibility to 404).
    Evidence: .sisyphus/evidence/task-1-ghost-daemon.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-1-valid-toml.txt`
  - [ ] `.sisyphus/evidence/task-1-default.txt`
  - [ ] `.sisyphus/evidence/task-1-gh-token.txt`
  - [ ] `.sisyphus/evidence/task-1-ghost-daemon.txt`

  **Commit**: YES

  - Message: `feat(config): add daemons block, per-tile daemon assignment, per-tile github_token`
  - Files: `packages/config/schema.ts`, `packages/config/index.ts` (only if helpers added there)
  - Pre-commit: `bun run lint && bun test packages/config`

- [x] 2. Create `packages/contracts/` workspace with HTTP DTO Zod schemas

  **What to do**:

  - Create `packages/contracts/package.json` with `"name": "@mon/contracts"`, peerDep on `zod`, type: module, exports field for `.` and `./types`.
  - Create `packages/contracts/index.ts` exporting Zod schemas + inferred TS types for: `JobsResponse`, the per-type job tile schemas (`HostJobTile`, `WebsiteJobTile`, `ContainerJobTile`, `GithubJobTile` — these are the daemon-visible subset of fields the website serializes into `JobsResponse`; T16 maps `packages/config` tiles into these), `HostPingDTO`, `WebsitePingDTO`, `ContainerPingDTO`, `GithubPingDTO`, `GithubCheckRunDTO`, `IngestSuccessResponse` (`{ ok: true, deduplicated: boolean }`), `IngestErrorResponse` (`{ error: string }`).
  - Every ping DTO MUST include `ping_id: z.string().uuid()` and `daemon_id: z.string().min(1)` and `recorded_at: z.string().datetime()`.
  - Register the workspace in root `package.json` `"workspaces"` array.
  - No per-package `tsconfig.json` — packages in this repo inherit from the root `tsconfig.json` (confirmed: `packages/config`, `packages/db`, `packages/env` have none). Follow that convention.

  **Must NOT do**:

  - Do NOT depend on `@mon/db` or `@mon/config` from this package — it's the wire format, deliberately decoupled.
  - Do NOT add runtime fetch code here — only schemas + types.

  **Recommended Agent Profile**:

  - **Category**: `quick` — new package scaffold; pattern matches `packages/config`.
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: T8, T10-T13, T14, T17-T24
  - **Blocked By**: None

  **References**:

  - `packages/config/package.json` — mirror this shape exactly (workspace style, exports).
  - `packages/config/index.ts` / `packages/config/schema.ts` — Zod usage pattern.
  - `packages/db/schema.ts` lines 17/31/45/77/101 — existing ping table columns are the **insert target** (DTOs are daemon-friendly wire format; ingest helpers in T10-T13 do the mapping).

  **WHY each reference matters**:

  - DTOs use daemon-friendly names (`recorded_at`, `latency_ms`, `key`, `daemon_id`, `ping_id`). The DB has shorter names (`timestamp`, `latency`, `key`, `daemonId`, `pingId`). T10-T13 maps DTO → DB column explicitly at insert time. The wire format is **stable contract**; the DB columns can evolve.
  - DTO shape (canonical, per ping type) — all have a `kind` literal as the discriminator for `z.discriminatedUnion`:

    - **HostPingDTO**: `{ kind: "host", ping_id: uuid, daemon_id: string, recorded_at: ISO datetime, key: string, latency_ms: number | null, error: string | null }` — `key` is `host:<address>` matching how the daemon currently builds keys. No `success` field — success ≡ `error === null`.
    - **WebsitePingDTO**: `{ kind: "website", ...same fields as HostPingDTO }`. `key` is `website:<url>`. Same `error === null` convention.
    - **ContainerPingDTO**: `{ kind: "container", ping_id, daemon_id, recorded_at, key, error: string | null }` — NO `latency_ms` (the DB table has no latency column). `key` is `container:<container_name>`.
    - **GithubPingDTO**: `{ kind: "github_ping", ping_id, daemon_id, recorded_at, key, commit_hash: string | null, check_run_id: number | null, error: string | null }`. `check_run_id` is GitHub's bigint check-run ID (matches `githubCheckRun.id` after T3's FK re-point — daemons have this from the GitHub API directly; no DB round-trip needed). The Zod schema MUST enforce the DB's `github_ping_valid` check at parse time using `.refine(...)`: `(commit_hash !== null && check_run_id !== null) || error !== null`. `key` is `github:<owner>/<repo>`.
    - **GithubCheckRunDTO**: `{ kind: "github_check_run", ping_id, daemon_id, recorded_at, key, id: number (GitHub's check-run ID), name: string, status: <see enum>, conclusion: <see enum> | null, details_url: string | null, started_at: ISO datetime | null, completed_at: ISO datetime | null }`. `id` is GitHub's check-run ID (bigint); `ping_id` is our idempotency key. **Enum source of truth**: the Zod enums for `status` and `conclusion` MUST be derived from / kept identical to `ghCheckRunStatusEnum` and `ghCheckRunConclusionEnum` in `packages/db/schema.ts` (read those values directly and reuse the literal list — if the DB has values like "waiting"/"requested"/"pending"/"skipped" etc., include all of them). Document in a code comment that updating one requires updating the other.

  - JobTile shapes (the per-type tile subset the website serializes for daemons; T16 maps `packages/config` tiles into these):
    - **HostJobTile**: `{ kind: "host", id: string, cron: string, address: string }`.
    - **WebsiteJobTile**: `{ kind: "website", id: string, cron: string, url: string }`.
    - **ContainerJobTile**: `{ kind: "container", id: string, cron: string, container_name: string, docker_socket?: string }`.
    - **GithubJobTile**: `{ kind: "github", id: string, cron: string, repo: string, github_token?: string }`.
    - **JobsResponse**: `{ tiles: Array<HostJobTile | WebsiteJobTile | ContainerJobTile | GithubJobTile> }` via `z.discriminatedUnion("kind", ...)`.
    - These do NOT include UI-only fields from `packages/config/schema.ts` (col_start, row_start, name, etc.) — daemons don't need them.
  - Matching `packages/config/package.json` ensures Bun's workspace resolver picks this up without surprises.

  **Acceptance Criteria**:

  - [ ] `bun i` from repo root completes; `@mon/contracts` resolvable from both apps and other packages
  - [ ] `bun -e 'import { HostPingDTO } from "@mon/contracts"; console.log(HostPingDTO.shape)'` prints the schema shape
  - [ ] All 4 ping DTOs include `ping_id`, `daemon_id`, `recorded_at`

  **QA Scenarios**:

  ```
  Scenario: All DTOs parse a representative payload
    Tool: Bash (bun)
    Preconditions: package installed in workspace
    Steps:
      1. Write a tiny script that constructs one example payload per DTO and runs `.parse()` on each.
      2. Run with bun.
    Expected Result: Exit 0; all 4 parses succeed.
    Failure Indicators: any ZodError
    Evidence: .sisyphus/evidence/task-2-dto-parse.txt

  Scenario: Missing ping_id is rejected
    Tool: Bash (bun)
    Preconditions: package installed
    Steps:
      1. Run a script that calls HostPingDTO.parse({ daemon_id: "d", recorded_at: new Date().toISOString(), key: "host:1.1.1.1", latency_ms: 12 }) — no ping_id provided.
    Expected Result: ZodError mentioning ping_id; non-zero exit.
    Evidence: .sisyphus/evidence/task-2-missing-pingid.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-2-dto-parse.txt`
  - [ ] `.sisyphus/evidence/task-2-missing-pingid.txt`

  **Commit**: YES

  - Message: `feat(contracts): add @mon/contracts workspace with HTTP DTO schemas`
  - Files: `packages/contracts/**`, `package.json` (workspaces array)
  - Pre-commit: `bun i && bun run lint`

- [x] 3. Drizzle schema: add `daemon_id` + `ping_id` (PRIMARY KEY) to all 5 ping tables; re-point `githubPings.check_run_id` FK to `githubCheckRun.id`

  **What to do**:

  - In `packages/db/schema.ts`: add the following columns to **each** of the 5 ping tables (`hostPings`, `websitePings`, `containerPings`, `githubPings`, `githubCheckRun`):
    - `daemonId: text("daemon_id")` (nullable, no default — fills going forward; pre-existing rows have NULL)
    - `pingId: uuid("ping_id").primaryKey().defaultRandom()` — **becomes the primary key** for ping tables that previously had no PK (host/website/container/githubPings), and a unique-not-null column for `githubCheckRun` which already has `_id serial primary key` (so for that table use `uuid("ping_id").notNull().unique().defaultRandom()` instead — do NOT change its existing PK).
  - **Re-point the `githubPings.check_run_id` FK**: it currently references `githubCheckRun._id` (internal serial). Change it to reference `githubCheckRun.id` (GitHub's bigint check-run ID) so the daemon — which only has GitHub's ID — can populate it directly without a round-trip to fetch the inserted serial. Steps:
    1. Add a UNIQUE constraint on `githubCheckRun.id` (the bigint GitHub ID): `uniqueIndex("github_check_run_id_unique").on(t.id)` (drizzle currently only has a non-unique `index("github_check_run_id_idx")` — keep both or replace the non-unique with the unique one).
    2. Drop the existing FK from `githubPings.check_run_id → githubCheckRun._id` and re-add it as `githubPings.check_run_id → githubCheckRun.id`. In drizzle: `.references(() => githubCheckRun.id)`.
    3. The data type already matches (both are `bigint({ mode: "number" })`).
  - Generate the migration: `cd packages/db && bunx drizzle-kit generate`.
  - **Inspect the generated SQL**. Because tables may already have rows in production, ensure the migration uses `DEFAULT gen_random_uuid()` on the new NOT NULL `ping_id` column (drizzle-kit emits this when `.defaultRandom()` is set). If for any reason it doesn't, hand-edit the migration to the three-step form:
    1. `ALTER TABLE mon_X ADD COLUMN ping_id uuid DEFAULT gen_random_uuid();` (nullable but with default; existing rows backfilled)
    2. `ALTER TABLE mon_X ALTER COLUMN ping_id SET NOT NULL;`
    3. `ALTER TABLE mon_X ADD CONSTRAINT mon_X_pkey PRIMARY KEY (ping_id);` (or `ADD CONSTRAINT mon_X_ping_id_unique UNIQUE (ping_id);` for `githubCheckRun`)
  - For the FK swap, expect drizzle-kit to emit `ALTER TABLE mon_github_ping DROP CONSTRAINT ...; ALTER TABLE mon_github_ping ADD CONSTRAINT ... FOREIGN KEY (check_run_id) REFERENCES mon_github_check_run(id);`. If existing rows have `check_run_id` values that don't satisfy the new FK (because the old FK pointed to `_id`), the migration MUST first remap those values: `UPDATE mon_github_ping SET check_run_id = (SELECT id FROM mon_github_check_run WHERE _id = mon_github_ping.check_run_id);`. Hand-edit if drizzle-kit doesn't generate this remap step.
  - Ensure `CREATE EXTENSION IF NOT EXISTS "pgcrypto";` appears at the top of the migration (drizzle-kit usually emits this; confirm).
  - Update `packages/db/index.ts` exports to surface any new `$inferInsert` types if other ingest code needs them (it shouldn't — Drizzle column types are inferred from `monX.$inferInsert` at use-site).

  **Must NOT do**:

  - Do NOT rename `hostPings`, `websitePings`, `containerPings`, `githubPings`, or `githubCheckRun` — these are the exported symbol names (verified at `packages/db/schema.ts` lines 17, 31, 45, 77, 101).
  - Do NOT change `githubCheckRun`'s existing `_id serial primary key` — that table already has a PK; the new `ping_id` is just a unique idempotency key there, and `id` (the GitHub bigint) becomes UNIQUE so it can be FK'd from `githubPings`.
  - Do NOT emit `ADD COLUMN ping_id uuid NOT NULL` without a default on a table that may have rows — it WILL fail with `column "ping_id" of relation "mon_X" contains null values`.
  - Do NOT make `daemon_id` `NOT NULL` — existing rows have no daemon and the column must accept NULL during migration.
  - Do NOT drop or rename existing columns (`_id` on `githubCheckRun` stays as PK; we only re-point the FK from `githubPings`).
  - Do NOT swap the FK without first remapping existing data — orphan FK values will cause migration failure.

  **Recommended Agent Profile**:

  - **Category**: `unspecified-high` — schema change requires inspecting generated SQL and handling the existing-rows backfill case AND the FK remap.
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: T10-T13, T17-T20
  - **Blocked By**: None

  **References**:

  - `packages/db/schema.ts` line 17 (`hostPings`), 31 (`websitePings`), 45 (`containerPings`), 77 (`githubCheckRun`), 101 (`githubPings`) — exported symbol names AS-IS, no renames.
  - `packages/db/schema.ts` line 110-112 — current FK `checkRunId → githubCheckRun._id` is the one being re-pointed.
  - `packages/db/schema.ts` line 81 — `githubCheckRun.id` is `bigint("id", { mode: "number" }).notNull()` — currently has only a non-unique index; we add UNIQUE so it can be FK target.
  - `packages/db/drizzle.config.ts` — drizzle-kit config for migration generation.
  - Existing `mon_*` table for pattern: `pgTableCreator((name) => \`mon\_${name}\`)` (line 15) is mandatory.
  - External: [drizzle-orm `defaultRandom()`](https://orm.drizzle.team/docs/column-types/pg#uuid).
  - External: [drizzle-orm unique / primary keys](https://orm.drizzle.team/docs/indexes-constraints).
  - Postgres docs: `gen_random_uuid()` requires `pgcrypto` extension (PG 13+ has it built-in).

  **Acceptance Criteria**:

  - [ ] `bunx drizzle-kit generate` succeeds; produced SQL contains `DEFAULT gen_random_uuid()` on the new `ping_id` column for all 5 tables
  - [ ] Produced SQL adds UNIQUE on `mon_github_check_run.id` (or equivalent constraint)
  - [ ] Produced SQL drops the old FK from `mon_github_ping.check_run_id → mon_github_check_run._id` and adds the new FK → `mon_github_check_run.id`
  - [ ] `bunx drizzle-kit check` returns no errors
  - [ ] Applying the migration to a **fresh** Postgres succeeds (`bunx drizzle-kit push`)
  - [ ] Applying the migration to a **populated** Postgres succeeds: seed 3 check-runs + 3 github_ping rows on the OLD schema (where `check_run_id` referenced `_id`), run the migration, verify all `check_run_id` values now match `id` (GitHub bigint) and the FK constraint holds

  **QA Scenarios**:

  ```
  Scenario: Migration applies cleanly to a fresh DB
    Tool: Bash
    Preconditions: docker available
    Steps:
      1. docker run -d --rm -e POSTGRES_PASSWORD=t -p 15432:5432 --name mon-mig-fresh postgres:16
      2. Loop pg_isready until ready
      3. DATABASE_URL=postgres://postgres:t@localhost:15432/postgres bunx drizzle-kit push --config=packages/db/drizzle.config.ts
      4. psql -c "\d mon_host_ping" — assert daemon_id and ping_id columns present, ping_id is PRIMARY KEY
      5. psql -c "\d mon_github_check_run" — assert ping_id present, UNIQUE; _id still PRIMARY KEY; id has UNIQUE constraint
      6. psql -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'mon_github_ping'::regclass AND contype = 'f'" — assert FK on check_run_id references mon_github_check_run(id), NOT (_id)
      7. docker rm -f mon-mig-fresh
    Expected Result: All assertions pass.
    Evidence: .sisyphus/evidence/task-3-migration-fresh.txt

  Scenario: Migration applies cleanly to a populated DB with FK remap
    Tool: Bash
    Preconditions: docker available
    Steps:
      1. docker run -d --rm -e POSTGRES_PASSWORD=t -p 15433:5432 --name mon-mig-populated postgres:16
      2. Apply ONLY the pre-existing schema migrations (checkout previous commit's schema and `drizzle-kit push`)
      3. Insert 3 rows into each of hostPings, websitePings, containerPings; insert 3 githubCheckRun rows with GitHub IDs (e.g., 100, 200, 300) and let `_id` auto-assign (e.g., 1, 2, 3); insert 3 githubPings rows where check_run_id references the OLD FK target (_id: 1, 2, 3)
      4. Switch to the new schema and run `bunx drizzle-kit push`
      5. SELECT count(*), count(ping_id), count(DISTINCT ping_id) FROM mon_host_ping — assert all three equal 3
      6. Repeat assertion for websitePings, containerPings, githubPings, githubCheckRun
      7. SELECT check_run_id FROM mon_github_ping ORDER BY ping_id — assert values are now 100, 200, 300 (GitHub IDs), NOT 1, 2, 3 (old _id values)
      8. Attempt INSERT INTO mon_github_ping with check_run_id=999 (non-existent) — assert FK violation
      9. docker rm -f mon-mig-populated
    Expected Result: All assertions pass.
    Evidence: .sisyphus/evidence/task-3-migration-populated.txt

  Scenario: Duplicate ping_id insert is rejected on fresh schema
    Tool: Bash
    Steps:
      1. Insert a host ping with a fixed UUID via psql
      2. Insert again with the same UUID
      3. Assert second insert errors with unique violation
    Expected Result: First INSERT succeeds, second errors.
    Evidence: .sisyphus/evidence/task-3-dup-ping-id.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-3-migration-fresh.txt`
  - [ ] `.sisyphus/evidence/task-3-migration-populated.txt`
  - [ ] `.sisyphus/evidence/task-3-dup-ping-id.txt`

  **Commit**: YES

  - Message: `feat(db): add daemon_id, ping_id PK, and re-point github_ping FK to github_check_run.id`
  - Files: `packages/db/schema.ts`, `packages/db/migrations/*.sql`
  - Pre-commit: `bun run lint && bunx drizzle-kit check`

- [x] 4. Bun test config + ephemeral Postgres test harness (`packages/test-utils/`)

  **What to do**:

  - Create `packages/test-utils/package.json` (`"name": "@mon/test-utils"`, devDep on `@types/pg`, dep on `postgres`).
  - Create `packages/test-utils/postgres-harness.ts` exporting `startTestPostgres(): Promise<{ url: string, stop: () => Promise<void> }>`. Implementation: spawn `docker run --rm -d -e POSTGRES_PASSWORD=test -p 0:5432 postgres:16`, poll `pg_isready`, run drizzle migrations via `migrate()` from `drizzle-orm/postgres-js/migrator`, return the dynamic port URL.
  - Add `bunfig.toml` at repo root with `[test] preload = ["./packages/test-utils/preload.ts"]` if needed.
  - Create `packages/test-utils/cleanup.ts` for truncating all `mon_*` tables between tests.
  - Document usage in `packages/test-utils/README.md` (short).

  **Must NOT do**:

  - Do NOT use pglite or in-memory shims — tests must run against real Postgres to exercise the unique index.
  - Do NOT hardcode a port — use `-p 0:5432` and parse the actual mapped port from `docker inspect`.
  - Do NOT leave containers running on test failure — use `afterAll` + signal handlers.

  **Recommended Agent Profile**:

  - **Category**: `unspecified-high` — test infrastructure has many sharp edges (port allocation, race conditions, cleanup).
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: T17-T20 integration tests, T28 e2e
  - **Blocked By**: None

  **References**:

  - Pattern: any Bun monorepo test setup — look at `bun test --help`.
  - External: [Bun test docs](https://bun.sh/docs/cli/test).
  - External: [drizzle-orm migrator](https://orm.drizzle.team/docs/migrations).
  - `packages/db/index.ts` — DB client pattern to reuse for harness.

  **Acceptance Criteria**:

  - [ ] `bun test packages/test-utils` runs a smoke test that boots Postgres, runs migrations, queries `mon_host_ping`, stops Postgres — all in < 30s
  - [ ] No leftover containers after `bun test` exits (success OR failure)

  **QA Scenarios**:

  ```
  Scenario: Harness starts, migrates, stops cleanly
    Tool: Bash
    Preconditions: docker daemon running
    Steps:
      1. bun test packages/test-utils/__tests__/harness.test.ts
      2. After test exits, run: docker ps --filter "ancestor=postgres:16" --format "{{.Names}}"
    Expected Result: Test passes; docker ps output is empty.
    Evidence: .sisyphus/evidence/task-4-harness-smoke.txt

  Scenario: Harness fails fast if docker is unavailable
    Tool: Bash
    Preconditions: stop docker daemon OR alias docker to /bin/false in PATH
    Steps:
      1. PATH=/tmp/no-docker:$PATH bun test packages/test-utils/__tests__/harness.test.ts
    Expected Result: Clear error message about docker; non-zero exit within 5s (no hang).
    Evidence: .sisyphus/evidence/task-4-no-docker.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-4-harness-smoke.txt`
  - [ ] `.sisyphus/evidence/task-4-no-docker.txt`

  **Commit**: YES

  - Message: `chore(test-utils): add ephemeral Postgres harness for integration tests`
  - Files: `packages/test-utils/**`, root `package.json`, `bunfig.toml`
  - Pre-commit: `bun run lint`

- [x] 5. Playwright install + `apps/website/playwright.config.ts`

  **What to do**:

  - `cd apps/website && bunx playwright install --with-deps chromium` (committed via package.json devDep on `@playwright/test`).
  - Create `apps/website/playwright.config.ts`: testDir `./e2e`, projects: just chromium, webServer config that boots the website with a test `CONFIG_PATH` env, fullyParallel false (we need test ordering for e2e DB setup).
  - Create `apps/website/e2e/.gitignore` ignoring `test-results/`, `playwright-report/`.
  - Add npm script `"e2e": "playwright test"` to `apps/website/package.json`.

  **Must NOT do**:

  - Do NOT install other browser engines (firefox, webkit) — chromium is enough.
  - Do NOT add visual regression yet; deferred out of scope.
  - Do NOT enable `trace: "on"` — only `on-first-retry` to keep CI logs manageable.

  **Recommended Agent Profile**:

  - **Category**: `unspecified-high` — Playwright config is tricky (webServer, env, ports).
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: T28
  - **Blocked By**: None

  **References**:

  - External: [Playwright config](https://playwright.dev/docs/test-configuration).
  - External: [Playwright webServer](https://playwright.dev/docs/test-webserver).
  - `apps/website/package.json` — existing dev script for the bootable command.

  **Acceptance Criteria**:

  - [ ] `cd apps/website && bunx playwright test --list` lists 0 tests but exits 0
  - [ ] `bunx playwright --version` outputs a version ≥ 1.40

  **QA Scenarios**:

  ```
  Scenario: Playwright is installed and config is valid
    Tool: Bash
    Preconditions: bun i complete
    Steps:
      1. cd apps/website && bunx playwright test --list
    Expected Result: Exit 0; output mentions chromium project.
    Evidence: .sisyphus/evidence/task-5-pw-list.txt
  ```

  **Evidence to Capture**: `.sisyphus/evidence/task-5-pw-list.txt`

  **Commit**: YES

  - Message: `chore(website): add Playwright config and chromium dependency`
  - Files: `apps/website/playwright.config.ts`, `apps/website/package.json`, `apps/website/e2e/.gitignore`
  - Pre-commit: `bun run lint`

- [x] 6. Update `packages/env`: split daemon env from website env

  **What to do**:

  - In `packages/env/index.ts`: introduce three exports:
    - `websiteEnv` — requires `CONFIG_PATH`, `DATABASE_URL`. Used by `apps/website`.
    - `daemonEnv` — requires `WEBSITE_URL`, `DAEMON_ID`, `DAEMON_TOKEN`. Optional `DAEMON_POLL_INTERVAL_SECONDS` (default `60`). **Does NOT include `CONFIG_PATH`, `DATABASE_URL`, or `GITHUB_TOKEN`.**
    - Keep a small `sharedEnv` with `APP` if cross-cutting.
  - Update consumers: `packages/db/index.ts` and `packages/config/index.ts` must import `websiteEnv`. (After T25, daemon stops importing both, so these consumers become website-only.)

  **Must NOT do**:

  - Do NOT mark `DAEMON_TOKEN` as optional — it's required for daemon operation.
  - Do NOT remove `GITHUB_TOKEN` from `websiteEnv` — the website now does the GitHub API calls? **NO** — daemons still do the GitHub calls. Per-tile GitHub credentials should come from the website via the jobs response. Therefore `GITHUB_TOKEN` is removed from both env schemas; tile-level config carries any required secret.
  - Do NOT touch `T7` (docs) from inside this task.

  **Recommended Agent Profile**:

  - **Category**: `quick` — env file edit + 2 import updates.
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: YES (Wave 1)
  - **Blocks**: T8, T14, T25, T27
  - **Blocked By**: None

  **References**:

  - `packages/env/index.ts` — current `@t3-oss/env-core` shape.
  - External: [@t3-oss/env-core docs](https://env.t3.gg/docs/core).
  - `apps/daemon/src/index.ts` — current `env.CONFIG_PATH` reference (will be removed in T25).

  **Acceptance Criteria**:

  - [ ] `bun run lint` passes
  - [ ] Importing `daemonEnv` without `WEBSITE_URL` throws at module load time

  **QA Scenarios**:

  ```
  Scenario: daemonEnv requires WEBSITE_URL, DAEMON_ID, DAEMON_TOKEN
    Tool: Bash (bun)
    Preconditions: env package updated
    Steps:
      1. Run: bun -e 'import { daemonEnv } from "@mon/env"; console.log(daemonEnv)' with no env vars set
      2. Capture stderr
    Expected Result: Non-zero exit; stderr mentions all three missing vars by name.
    Evidence: .sisyphus/evidence/task-6-daemon-env-missing.txt

  Scenario: daemonEnv with valid vars loads cleanly
    Tool: Bash (bun)
    Steps:
      1. WEBSITE_URL=http://localhost:3000 DAEMON_ID=test DAEMON_TOKEN=abc bun -e 'import { daemonEnv } from "@mon/env"; console.log(daemonEnv.DAEMON_ID)'
    Expected Result: Exit 0; stdout "test".
    Evidence: .sisyphus/evidence/task-6-daemon-env-ok.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-6-daemon-env-missing.txt`
  - [ ] `.sisyphus/evidence/task-6-daemon-env-ok.txt`

  **Commit**: YES

  - Message: `refactor(env): split daemon and website env contracts`
  - Files: `packages/env/index.ts`, `packages/db/index.ts`, `packages/config/index.ts`
  - Pre-commit: `bun run lint`

- [x] 7. Update root `README.md` + `apps/docs` config example to reflect new TOML shape

  **What to do**:

  - Update root `README.md` example config: add `[daemons.default]` block with a placeholder `token_hash`; show `daemon = "default"` on each monitor tile; show a second example with `daemon = "eu-west"`.
  - Update `apps/docs/src/content/` pages that mention config — at minimum add a new section "Distributed daemons" explaining: token generation (`openssl rand -hex 32` + SHA-256 hash command shown in shell), per-tile `daemon` field, that the TOML lives on the website host now.
  - Add a "Migration from single-daemon" subsection: 6-step checklist for operators (generate token, hash it, place TOML on website, redeploy website, set env on daemon, redeploy daemon).
  - Show example `curl` commands an operator could use to sanity-check `GET /api/daemon/jobs`.

  **Must NOT do**:

  - Do NOT modify the actual schema/code from this task; docs only.
  - Do NOT introduce a new docs page taxonomy; append to existing structure.
  - Do NOT add emojis unless the existing docs use them.

  **Recommended Agent Profile**:

  - **Category**: `writing` — docs/markdown work.
  - **Skills**: `[]` — keep style consistent with existing Nextra MDX.

  **Parallelization**:

  - **Can Run In Parallel**: YES (Wave 1, but ideally after T1 schema is settled)
  - **Blocks**: None directly, but referenced by F1
  - **Blocked By**: T1 (so docs match final schema field names)

  **References**:

  - `README.md` — current example.
  - `apps/docs/src/content/` — Nextra structure, existing config doc page.
  - `packages/config/schema.ts` — must be the source of truth that docs mirror.

  **Acceptance Criteria**:

  - [ ] Root README example is valid TOML that `getConfig()` accepts (verify with a quick `bun -e` round-trip)
  - [ ] `cd apps/docs && bun run build` succeeds (Nextra compiles the new MDX)

  **QA Scenarios**:

  ```
  Scenario: README example parses
    Tool: Bash (bun)
    Steps:
      1. Extract the TOML code block from README.md to /tmp/readme-example.toml
      2. CONFIG_PATH=/tmp/readme-example.toml bun -e 'import { getConfig } from "@mon/config"; getConfig()'
    Expected Result: Exit 0, no Zod errors.
    Evidence: .sisyphus/evidence/task-7-readme-parse.txt

  Scenario: Docs build succeeds
    Tool: Bash
    Steps:
      1. cd apps/docs && bun run build
    Expected Result: Exit 0; build output captured.
    Evidence: .sisyphus/evidence/task-7-docs-build.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-7-readme-parse.txt`
  - [ ] `.sisyphus/evidence/task-7-docs-build.txt`

  **Commit**: YES

  - Message: `docs: document distributed daemon config and migration`
  - Files: `README.md`, `apps/docs/src/content/**`
  - Pre-commit: `cd apps/docs && bun run build`

- [x] 8. Website: `src/lib/server/daemon-auth.ts` (SHA-256 bearer-token verifier)

  **What to do**:

  - Implement `verifyBearerToken(request: Request, config: Config): { daemonId: string } | { error: "missing" | "malformed" | "unauthorized" }`.
  - Parse `Authorization: Bearer <token>` header. Require `X-Daemon-Id` header too (so we know which stored hash to compare to).
  - Compute `sha256(token)` hex, compare against `config.daemons[daemonId].token_hash` using `crypto.timingSafeEqual` (after converting both to equal-length Buffers).
  - Return `{ daemonId }` on success; structured error otherwise.
  - Add a helper `hashToken(token: string): string` for tests + docs.

  **Must NOT do**:

  - Do NOT use `===` for hash comparison (timing side-channel).
  - Do NOT log the presented token (even on auth failure).
  - Do NOT cache verification results — SHA-256 compare is O(1) and the call rate is low.

  **Recommended Agent Profile**:

  - **Category**: `unspecified-high` — security-sensitive code; constant-time comparison and structured error returns must be correct.
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocks**: T16-T20
  - **Blocked By**: T2, T6

  **References**:

  - Node `crypto.timingSafeEqual` — [docs](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b).
  - `packages/config/schema.ts` — `Daemon` type with `token_hash`.
  - Next.js Request: standard Web `Request`/`Headers` in route handlers.

  **WHY each reference matters**:

  - `timingSafeEqual` requires equal-length Buffers; helper must pad/early-return correctly to avoid leaking length.
  - Daemon hash in config is hex-encoded SHA-256 (per T1); we compare hex against hex.

  **Acceptance Criteria**:

  - [ ] `bun test apps/website/src/lib/server/daemon-auth.test.ts` passes with cases: missing header, malformed header, wrong token (constant-time), wrong daemon id, success
  - [ ] No `string ===` comparison of secrets anywhere in the file

  **QA Scenarios**:

  ```
  Scenario: Valid bearer token returns daemonId
    Tool: Bash (bun test)
    Steps:
      1. bun test apps/website/src/lib/server/daemon-auth.test.ts -t "valid token"
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-8-valid.txt

  Scenario: Tampered token rejected
    Tool: Bash (bun test)
    Steps:
      1. bun test apps/website/src/lib/server/daemon-auth.test.ts -t "tampered"
    Expected Result: pass; returns { error: "unauthorized" }
    Evidence: .sisyphus/evidence/task-8-tampered.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-8-valid.txt`
  - [ ] `.sisyphus/evidence/task-8-tampered.txt`

  **Commit**: YES

  - Message: `feat(website): add daemon bearer-token auth helper`
  - Files: `apps/website/src/lib/server/daemon-auth.ts`, `apps/website/src/lib/server/daemon-auth.test.ts`
  - Pre-commit: `bun run lint && bun test apps/website/src/lib/server/daemon-auth.test.ts`

- [x] 9. Website: `src/lib/server/config-cache.ts` (5s TTL config cache)

  **What to do**:

  - Implement `getCachedConfig(): Config` — module-level singleton:
    - On first call, load TOML via `@mon/config`'s `getConfig()`, stash `{ config, mtimeMs, loadedAt }`.
    - On subsequent calls within 5s of `loadedAt`, return cached value without touching disk.
    - After 5s, `fs.statSync(CONFIG_PATH).mtimeMs` — if unchanged, refresh `loadedAt` only; if changed, reload + Zod-reparse.
  - Export `invalidateConfigCache()` for tests.
  - Document inline that this is sync (Next route handlers run on Node — sync file IO is fine for a < 50ms path).

  **Must NOT do**:

  - Do NOT use `fs.watch` — explicit choice from Metis review for simplicity.
  - Do NOT swallow ZodErrors — let them propagate so the route returns 500 and the operator sees the issue.

  **Recommended Agent Profile**:

  - **Category**: `quick` — small, self-contained module.
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocks**: T16
  - **Blocked By**: T1

  **References**:

  - `packages/config/index.ts` — `getConfig()` signature.
  - Node `fs.statSync` mtime.

  **Acceptance Criteria**:

  - [ ] Unit test: two calls within 5s read the file only once (assert via spy on `fs.readFileSync`)
  - [ ] Unit test: changing mtime + waiting > 5s causes a reload

  **QA Scenarios**:

  ```
  Scenario: Two rapid calls hit disk once
    Tool: Bash (bun test)
    Steps:
      1. bun test apps/website/src/lib/server/config-cache.test.ts -t "caches"
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-9-cache.txt

  Scenario: mtime change triggers reload
    Tool: Bash (bun test)
    Steps:
      1. bun test apps/website/src/lib/server/config-cache.test.ts -t "reload"
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-9-reload.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-9-cache.txt`
  - [ ] `.sisyphus/evidence/task-9-reload.txt`

  **Commit**: YES

  - Message: `feat(website): add 5s TTL config cache`
  - Files: `apps/website/src/lib/server/config-cache.ts`, `apps/website/src/lib/server/config-cache.test.ts`
  - Pre-commit: `bun run lint && bun test apps/website/src/lib/server/config-cache.test.ts`

- [x] 10. Website: `src/lib/server/ingest/host.ts` — DB insert with idempotency

  **What to do**:

  - Export `insertHostPing(dto: HostPingDTO): Promise<{ ok: true, deduplicated: boolean }>`.
  - Use the real exported symbol `hostPings` (from `@mon/db/schema`, line 17). Call: `db.insert(hostPings).values({ key: dto.key, timestamp: new Date(dto.recorded_at), latency: dto.latency_ms, error: dto.error, daemonId: dto.daemon_id, pingId: dto.ping_id }).onConflictDoNothing({ target: hostPings.pingId }).returning({ pingId: hostPings.pingId })`.
  - Check `.returning(...)` array length — `0` ⇒ `deduplicated: true`; `1` ⇒ `false`.
  - Wrap in try/catch only for unexpected DB errors; propagate them (route handler returns 500).
  - Unit test mocks `@mon/db` (`mock.module`) and asserts the conflict target is `hostPings.pingId`.

  **Must NOT do**:

  - Do NOT bypass the unique/PK constraint via `delete` + insert.
  - Do NOT rename the exported drizzle symbol — it is `hostPings` (plural), not `monHostPing`.
  - Do NOT change column names — the DB column is `latency` (not `latency_ms`); the DTO carries `latency_ms` but is mapped at insert time. Map daemon-friendly names → DB column names explicitly.

  **Recommended Agent Profile**:

  - **Category**: `quick` — single-file DB helper with clear contract.
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: YES (Wave 2, parallel with T11-T13)
  - **Blocks**: T17
  - **Blocked By**: T3

  **References**:

  - `packages/db/schema.ts` line 17 — `hostPings` table; columns: `key`, `timestamp`, `latency`, `error` (+ new `daemonId`, `pingId` from T3).
  - Drizzle `onConflictDoNothing`: [docs](https://orm.drizzle.team/docs/insert#on-conflict-do-nothing).
  - `apps/daemon/src/jobs/host.ts` — **current** insert shape — for understanding the values that flow in (this helper subsumes that logic on the website side).

  **Acceptance Criteria**:

  - [ ] `bun test apps/website/src/lib/server/ingest/host.test.ts` passes (mocked db)
  - [ ] Integration smoke (deferred to T17): insert + re-insert same ping_id ⇒ row count stays at 1

  **QA Scenarios**:

  ```
  Scenario: First insert returns deduplicated: false
    Tool: Bash (bun test)
    Steps:
      1. bun test apps/website/src/lib/server/ingest/host.test.ts -t "first insert"
    Expected Result: pass; result is { ok: true, deduplicated: false }
    Evidence: .sisyphus/evidence/task-10-first.txt

  Scenario: Duplicate ping_id returns deduplicated: true
    Tool: Bash (bun test)
    Steps:
      1. bun test apps/website/src/lib/server/ingest/host.test.ts -t "duplicate"
    Expected Result: pass; .returning() returns empty array; result is { ok: true, deduplicated: true }
    Evidence: .sisyphus/evidence/task-10-dup.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-10-first.txt`
  - [ ] `.sisyphus/evidence/task-10-dup.txt`

  **Commit**: YES (group with T11-T13)

  - Message: `feat(website): add ingest helpers for all 4 ping types`
  - Files: `apps/website/src/lib/server/ingest/host.ts` + test
  - Pre-commit: `bun run lint && bun test apps/website/src/lib/server/ingest/host.test.ts`

- [x] 11. Website: `src/lib/server/ingest/website.ts`

  **What to do**: Mirror T10 against the `websitePings` symbol (exported at `packages/db/schema.ts` line 31). Columns: `key`, `timestamp`, `latency`, `error` + new `daemonId`, `pingId`. Same `onConflictDoNothing({ target: websitePings.pingId }).returning({ pingId: websitePings.pingId })` pattern.

  **Must NOT do**: Same exclusions as T10. Symbol name is `websitePings` (plural).

  **Recommended Agent Profile**: `quick`. Skills: `[]`.

  **Parallelization**: Wave 2, parallel with T10/T12/T13. Blocks T18. Blocked by T3.

  **References**: `packages/db/schema.ts` line 31; `packages/contracts` `WebsitePingDTO`.

  **Acceptance Criteria**: `bun test apps/website/src/lib/server/ingest/website.test.ts` passes (covers first insert + duplicate).

  **QA Scenarios**:

  ```
  Scenario: Website ping insert + dedupe
    Tool: Bash (bun test)
    Steps: bun test apps/website/src/lib/server/ingest/website.test.ts
    Expected Result: pass (both sub-cases)
    Evidence: .sisyphus/evidence/task-11.txt
  ```

  **Evidence**: `.sisyphus/evidence/task-11.txt`

  **Commit**: groups with T10.

- [x] 12. Website: `src/lib/server/ingest/container.ts`

  **What to do**: Mirror T10 against `containerPings` (exported at `packages/db/schema.ts` line 45). Columns: `key`, `timestamp`, `error` (note: no `latency` column on container_ping) + new `daemonId`, `pingId`. **DTO note**: `ContainerPingDTO` therefore must NOT include a `latency_ms` field (or it must be ignored at insert time).

  **Must NOT do**: Same exclusions as T10. Symbol name is `containerPings` (plural). Do NOT carry over the daemon's old side-effect of also writing a `websitePings` row from inside the container probe — each ingest endpoint writes exactly one table.

  **Recommended Agent Profile**: `quick`. Skills: `[]`.

  **Parallelization**: Wave 2. Blocks T19. Blocked by T3.

  **References**: `packages/db/schema.ts` line 45; `packages/contracts` `ContainerPingDTO` (T2 — adjust DTO if it had a `latency_ms` field).

  **Acceptance Criteria**: `bun test apps/website/src/lib/server/ingest/container.test.ts` passes.

  **QA Scenarios**:

  ```
  Scenario: Container ping insert + dedupe
    Tool: Bash (bun test)
    Steps: bun test apps/website/src/lib/server/ingest/container.test.ts
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-12.txt
  ```

  **Evidence**: `.sisyphus/evidence/task-12.txt`

  **Commit**: groups with T10.

- [x] 13. Website: `src/lib/server/ingest/github.ts` (incl. check runs)

  **What to do**:

  - Export `insertGithubPing(dto: GithubPingDTO)` writing to `githubPings` (`packages/db/schema.ts` line 101). Map: `{ key: dto.key, timestamp: new Date(dto.recorded_at), commitHash: dto.commit_hash, checkRunId: dto.check_run_id, error: dto.error, daemonId: dto.daemon_id, pingId: dto.ping_id }`. Use `.onConflictDoNothing({ target: githubPings.pingId }).returning({ pingId: githubPings.pingId })`. `dto.check_run_id` is GitHub's bigint check-run ID (after T3 the FK references `githubCheckRun.id`, NOT `_id`). The DB-side `github_ping_valid` check constraint ((commit_hash AND check_run_id) OR error) is enforced; the DTO's Zod `.refine` (T2) ensures parse-time fail-fast.
  - **Ordering note**: when ingesting both a ping and check runs from one daemon push, insert check runs FIRST so the FK from the ping row is satisfied. T20's route handler must enforce this ordering when the body is a `z.union` of both.
  - Export `insertGithubCheckRun(dto: GithubCheckRunDTO)` writing to `githubCheckRun` (line 77). Map: `{ id: dto.id, name: dto.name, status: dto.status, conclusion: dto.conclusion, detailsUrl: dto.details_url, startedAt: dto.started_at ? new Date(dto.started_at) : null, completedAt: dto.completed_at ? new Date(dto.completed_at) : null, daemonId: dto.daemon_id, pingId: dto.ping_id }`. Use `.onConflictDoNothing({ target: githubCheckRun.pingId })`. Note: `_id` (serial PK) is auto-generated; do not pass it. `id` is GitHub's check-run ID (bigint, now UNIQUE per T3).
  - Both functions accept already-validated DTOs; route handler does the Zod parse.

  **Must NOT do**:

  - Do NOT skip `commit_hash`/`check_run_id` on GithubPingDTO — the DB check constraint will reject the insert if neither error nor (commit_hash + check_run_id) is set.
  - Do NOT bulk-insert check runs in one statement that bypasses individual idempotency — loop or use a multi-row insert with `onConflictDoNothing` on `pingId`.
  - Do NOT fetch from GitHub API inside this helper — that's the daemon's job; this helper only persists.
  - Symbol names: `githubPings` (plural) and `githubCheckRun` (singular — see line 77).

  **Recommended Agent Profile**: `quick`. Skills: `[]`.

  **Parallelization**: Wave 2. Blocks T20. Blocked by T3.

  **References**: `packages/db/schema.ts` line 77 (`githubCheckRun`), line 101 (`githubPings`); `packages/contracts` `GithubPingDTO`, `GithubCheckRunDTO`.

  **Acceptance Criteria**: `bun test apps/website/src/lib/server/ingest/github.test.ts` passes (covers both kinds + idempotency on each).

  **QA Scenarios**:

  ```
  Scenario: GitHub ping + check run insert with dedupe
    Tool: Bash (bun test)
    Steps: bun test apps/website/src/lib/server/ingest/github.test.ts
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-13.txt
  ```

  **Evidence**: `.sisyphus/evidence/task-13.txt`

  **Commit**: groups with T10. Combined message: `feat(website): add ingest helpers for host, website, container, github pings`. Files: all 4 ingest dirs + tests. Pre-commit: `bun run lint && bun test apps/website/src/lib/server/ingest`.

- [x] 14. Daemon: `apps/daemon/src/client/api-client.ts` (typed HTTP client)

  **What to do**:

  - Export a class `WebsiteApiClient` with constructor `({ baseUrl, daemonId, token, fetch? })`.
  - Methods:
    - `getJobs(): Promise<JobsResponse>` — `GET ${baseUrl}/api/daemon/jobs` with `Authorization: Bearer ${token}` + `X-Daemon-Id: ${daemonId}`. Parse response through `JobsResponse` schema (T2). On 401, throw `UnauthorizedError`. On network err, throw `UnreachableError`.
    - `pushHostPing(dto)`, `pushWebsitePing(dto)`, `pushContainerPing(dto)`, `pushGithubPing(dto)`, `pushGithubCheckRun(dto)` — POST to the respective ingest endpoint, parse `IngestSuccessResponse`. On any non-2xx, throw `IngestError` with status + body.
  - Use `globalThis.fetch` by default; allow injection for tests.
  - Unit-test mocks `fetch`, asserts URL, headers, body shape, and error mapping.

  **Must NOT do**:

  - Do NOT import `@mon/db`, `@mon/config`, or `smol-toml` in this file or anywhere downstream.
  - Do NOT swallow auth errors silently — `UnauthorizedError` must reach the pull loop unmodified.
  - Do NOT retry inside the client — retries are the pull loop's responsibility (T15).

  **Recommended Agent Profile**:

  - **Category**: `unspecified-high` — typed HTTP client with error taxonomy.
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocks**: T15, T21-T24
  - **Blocked By**: T2, T6

  **References**:

  - `packages/contracts/index.ts` — DTO/Response schemas (T2).
  - `packages/env/index.ts` — `daemonEnv` (T6).
  - External: [WHATWG fetch in Node 20](https://nodejs.org/api/globals.html#fetch).

  **Acceptance Criteria**:

  - [ ] `bun test apps/daemon/src/client/api-client.test.ts` passes — covers all 5 methods + 3 error classes
  - [ ] No import of `@mon/db` or `@mon/config` (grep guard in test)

  **QA Scenarios**:

  ```
  Scenario: getJobs sends correct headers
    Tool: Bash (bun test)
    Steps: bun test apps/daemon/src/client/api-client.test.ts -t "getJobs"
    Expected Result: pass; assertion on Authorization + X-Daemon-Id headers
    Evidence: .sisyphus/evidence/task-14-headers.txt

  Scenario: pushHostPing on 409 dedupe parses success
    Tool: Bash (bun test)
    Steps: bun test apps/daemon/src/client/api-client.test.ts -t "deduplicated"
    Expected Result: pass; returns { ok: true, deduplicated: true }
    Evidence: .sisyphus/evidence/task-14-dedupe.txt

  Scenario: 401 throws UnauthorizedError
    Tool: Bash (bun test)
    Steps: bun test apps/daemon/src/client/api-client.test.ts -t "unauthorized"
    Expected Result: pass; specific error class thrown
    Evidence: .sisyphus/evidence/task-14-401.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-14-headers.txt`
  - [ ] `.sisyphus/evidence/task-14-dedupe.txt`
  - [ ] `.sisyphus/evidence/task-14-401.txt`

  **Commit**: YES

  - Message: `feat(daemon): typed website API client with error taxonomy`
  - Files: `apps/daemon/src/client/api-client.ts` + test
  - Pre-commit: `bun run lint && bun test apps/daemon/src/client/api-client.test.ts`

- [x] 15. Daemon: `apps/daemon/src/client/pull-loop.ts` (poll + cron scheduler)

  **What to do**:

  - Export `startPullLoop({ client, interval, onJobsUpdated, signal })`.
  - On startup and every `interval` seconds: call `client.getJobs()`. Diff against currently-scheduled jobs; cancel removed ones, schedule new ones via `node-schedule.scheduleJob(cronOrInterval, () => executeJob(tile))`.
  - On `UnauthorizedError`: log clear message, call `process.exit(78)` (sysexits.h `EX_CONFIG`). **Do not** keep polling.
  - On `UnreachableError`: exponential backoff — base 5s, double each failure, cap at 300s. Reset on first success.
  - On `EMPTY_JOBS` (response with `tiles: []`): log warn, keep polling, schedule nothing.
  - Honor `signal: AbortSignal` for clean shutdown (cancels all scheduled jobs, breaks loop).

  **Must NOT do**:

  - Do NOT swallow `UnauthorizedError` and continue.
  - Do NOT call `process.exit()` for any other error class.
  - Do NOT recreate `node-schedule` jobs that already exist with identical config — diff first.

  **Recommended Agent Profile**:

  - **Category**: `unspecified-high` — concurrency / scheduling state machine.
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocks**: T25
  - **Blocked By**: T14

  **References**:

  - `apps/daemon/src/index.ts` — current `node-schedule.scheduleJob` usage.
  - `node-schedule` docs.
  - Sysexits.h codes — `78 = EX_CONFIG`.

  **Acceptance Criteria**:

  - [ ] `bun test apps/daemon/src/client/pull-loop.test.ts` passes: initial poll schedules N jobs, second poll with different config diff-applies, 401 calls `process.exit(78)` (use `mock.module` to intercept), network err triggers backoff
  - [ ] AbortSignal cancels in < 200ms

  **QA Scenarios**:

  ```
  Scenario: Initial poll schedules jobs
    Tool: Bash (bun test)
    Steps: bun test apps/daemon/src/client/pull-loop.test.ts -t "schedules"
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-15-schedule.txt

  Scenario: 401 triggers exit(78)
    Tool: Bash (bun test)
    Steps: bun test apps/daemon/src/client/pull-loop.test.ts -t "unauthorized"
    Expected Result: pass; exit code captured
    Evidence: .sisyphus/evidence/task-15-401.txt

  Scenario: AbortSignal stops scheduler cleanly
    Tool: Bash (bun test)
    Steps: bun test apps/daemon/src/client/pull-loop.test.ts -t "abort"
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-15-abort.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-15-schedule.txt`
  - [ ] `.sisyphus/evidence/task-15-401.txt`
  - [ ] `.sisyphus/evidence/task-15-abort.txt`

  **Commit**: YES

  - Message: `feat(daemon): pull loop with error-class-driven backoff and clean shutdown`
  - Files: `apps/daemon/src/client/pull-loop.ts` + test
  - Pre-commit: `bun run lint && bun test apps/daemon/src/client/pull-loop.test.ts`

- [x] 16. Website: `GET /api/daemon/jobs` route handler + unit test

  **What to do**:

  - Create `apps/website/src/app/api/daemon/jobs/route.ts` exporting `GET(request: Request)`.
  - Steps: call `verifyBearerToken(request, getCachedConfig())` (T8); on error return 401 with no body. On success, call `getDaemonAssignments(config, daemonId)` (T1). Map each `packages/config` tile → its corresponding `JobTile` shape from `@mon/contracts` (T2): `address` (host), `url` (website), `container_name`+`docker_socket` (container), `repo`+`github_token` (github). Include `id`, `kind`, and `cron`. Drop UI-only fields (col_start, row_start, name, etc.).
  - Return `Response.json(JobsResponse.parse(...))` with 200.
  - Unit test: mock config + auth, assert correct response shape and 401 on bad auth.

  **Must NOT do**:

  - Do NOT include token hashes or daemon list in the response — only the calling daemon's job slice.
  - Do NOT cache the response at the HTTP layer (no `Cache-Control`).
  - Do NOT include fields the daemon doesn't need (row IDs, grid coords).

  **Recommended Agent Profile**:

  - **Category**: `unspecified-high` — route handler with auth integration.
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: YES (Wave 3)
  - **Blocks**: T28
  - **Blocked By**: T8, T9

  **References**:

  - `apps/website/src/app/api/daemon/jobs/route.ts` — file to be created; Next 14 App Router route handler pattern.
  - `packages/contracts/index.ts` — `JobsResponse`.
  - Next.js: [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers).

  **Acceptance Criteria**:

  - [ ] `bun test apps/website/src/app/api/daemon/jobs/route.test.ts` passes — 200 with assignments, 401 missing/bad auth, 200 with `tiles: []` for unknown daemon (still authed)
  - [ ] Response shape passes `JobsResponse.parse()`

  **QA Scenarios**:

  ```
  Scenario: Authenticated daemon receives its job slice
    Tool: Bash (bun test)
    Steps: bun test apps/website/src/app/api/daemon/jobs/route.test.ts -t "slice"
    Expected Result: pass; response.tiles only contains tiles where daemon === requested id
    Evidence: .sisyphus/evidence/task-16-slice.txt

  Scenario: Missing Authorization header returns 401
    Tool: Bash (bun test)
    Steps: bun test apps/website/src/app/api/daemon/jobs/route.test.ts -t "401 missing"
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-16-401.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-16-slice.txt`
  - [ ] `.sisyphus/evidence/task-16-401.txt`

  **Commit**: YES

  - Message: `feat(website): GET /api/daemon/jobs returns auth'd daemon's assignments`
  - Files: route + test
  - Pre-commit: `bun run lint && bun test apps/website/src/app/api/daemon/jobs/route.test.ts`

- [x] 17. Website: `POST /api/daemon/pings/host` + Postgres-backed integration test

  **What to do**:

  - Create `apps/website/src/app/api/daemon/pings/host/route.ts` exporting `POST(request: Request)`.
  - Steps: bearer auth → parse JSON body through `HostPingDTO` → enforce `dto.daemon_id === auth.daemonId` (reject 403 otherwise to prevent ID spoofing) → call `insertHostPing(dto)` (T10) → return `Response.json({ ok: true, deduplicated })`.
  - On `ZodError` return 400 with `{ error: "invalid_payload", issues: [...] }`.
  - **Integration test** (`apps/website/src/app/api/daemon/pings/host/route.integration.test.ts`): use the `@mon/test-utils` harness (T4) to boot real Postgres, apply migrations, build a `Request` with valid auth, call `POST(request)` directly, assert row exists in `mon_host_ping` with correct `daemon_id` + `ping_id`. Second call with same `ping_id` returns `deduplicated: true` and row count stays at 1.

  **Must NOT do**:

  - Do NOT trust `dto.daemon_id` over auth — the 403 cross-check is mandatory.
  - Do NOT skip the integration test — unit test alone doesn't validate the unique constraint.

  **Recommended Agent Profile**:

  - **Category**: `unspecified-high` — combines auth, validation, DB, and integration test.
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: YES (Wave 3, parallel with T18-T20)
  - **Blocks**: T28
  - **Blocked By**: T8, T10, T4

  **References**:

  - `apps/website/src/lib/server/ingest/host.ts` — `insertHostPing` (T10).
  - `apps/website/src/lib/server/daemon-auth.ts` — `verifyBearerToken` (T8).
  - `packages/contracts/index.ts` — `HostPingDTO`.

  **Acceptance Criteria**:

  - [ ] Unit test: 200, 401, 403, 400 paths all covered
  - [ ] Integration test: real-Postgres insert succeeds; duplicate ping_id ⇒ 200 + `deduplicated: true` + row count 1

  **QA Scenarios**:

  ```
  Scenario: Happy path — valid auth + valid DTO ⇒ 200 + row inserted
    Tool: Bash (bun test)
    Steps: bun test apps/website/src/app/api/daemon/pings/host/route.integration.test.ts -t "happy"
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-17-happy.txt

  Scenario: daemon_id mismatch returns 403
    Tool: Bash (bun test)
    Steps: bun test apps/website/src/app/api/daemon/pings/host/route.test.ts -t "403"
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-17-403.txt

  Scenario: Duplicate ping_id returns deduplicated: true and DB row count stays 1
    Tool: Bash (bun test)
    Steps: bun test apps/website/src/app/api/daemon/pings/host/route.integration.test.ts -t "dedupe"
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-17-dedupe.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-17-happy.txt`
  - [ ] `.sisyphus/evidence/task-17-403.txt`
  - [ ] `.sisyphus/evidence/task-17-dedupe.txt`

  **Commit**: YES (group with T18-T20)

  - Message: `feat(website): ingest endpoints for all 4 ping types`
  - Pre-commit: `bun run lint && bun test apps/website/src/app/api/daemon/pings`

- [x] 18. Website: `POST /api/daemon/pings/website` + integration test

  **What to do**: Mirror T17 for website pings. Same auth, same `daemon_id` cross-check, same idempotency contract via `insertWebsitePing` (T11).

  **Must NOT do**: Same exclusions as T17.

  **Recommended Agent Profile**: `unspecified-high`. Skills: `[]`.

  **Parallelization**: Wave 3, parallel with T17/T19/T20. Blocks T28. Blocked by T8, T11, T4.

  **References**: `apps/website/src/lib/server/ingest/website.ts` (T11); `packages/contracts/index.ts` `WebsitePingDTO`.

  **Acceptance Criteria**: unit + integration tests covering 200/401/403/400/dedupe all pass.

  **QA Scenarios**:

  ```
  Scenario: Website ping happy + dedupe + 403 mismatch
    Tool: Bash (bun test)
    Steps: bun test apps/website/src/app/api/daemon/pings/website
    Expected Result: pass (all sub-cases)
    Evidence: .sisyphus/evidence/task-18.txt

  Scenario: Invalid URL field returns 400
    Tool: Bash (bun test)
    Steps: bun test apps/website/src/app/api/daemon/pings/website/route.test.ts -t "invalid"
    Expected Result: pass; response.error === "invalid_payload"
    Evidence: .sisyphus/evidence/task-18-invalid.txt
  ```

  **Evidence**: `.sisyphus/evidence/task-18.txt`, `.sisyphus/evidence/task-18-invalid.txt`

  **Commit**: groups with T17.

- [x] 19. Website: `POST /api/daemon/pings/container` + integration test

  **What to do**: Mirror T17 for container pings via `insertContainerPing` (T12).

  **Must NOT do**: Same exclusions as T17.

  **Recommended Agent Profile**: `unspecified-high`. Skills: `[]`.

  **Parallelization**: Wave 3, parallel. Blocks T28. Blocked by T8, T12, T4.

  **References**: `apps/website/src/lib/server/ingest/container.ts` (T12); `packages/contracts/index.ts` `ContainerPingDTO`.

  **Acceptance Criteria**: unit + integration tests pass.

  **QA Scenarios**:

  ```
  Scenario: Container ping happy + dedupe + 403 + 400
    Tool: Bash (bun test)
    Steps: bun test apps/website/src/app/api/daemon/pings/container
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-19.txt
  ```

  **Evidence**: `.sisyphus/evidence/task-19.txt`

  **Commit**: groups with T17.

- [x] 20. Website: `POST /api/daemon/pings/github` + integration test (incl. check runs)

  **What to do**:

  - Accept a body that is `GithubPingDTO` OR an array of `GithubCheckRunDTO` (use `z.union` with discriminator on `kind: "github_ping" | "github_check_run"` — these literals are defined in T2).
  - Route by kind to `insertGithubPing` or `insertGithubCheckRun` (T13).
  - Integration test covers both kinds; bulk array of check runs handled idempotently per row.

  **Must NOT do**: Don't loosen Zod parsing for bulk arrays — every element must validate.

  **Recommended Agent Profile**: `unspecified-high`. Skills: `[]`.

  **Parallelization**: Wave 3. Blocks T28. Blocked by T8, T13, T4.

  **References**: `apps/website/src/lib/server/ingest/github.ts` (T13); `packages/contracts/index.ts` `GithubPingDTO`, `GithubCheckRunDTO`.

  **Acceptance Criteria**: unit + integration tests for both kinds pass; dedupe works on `ping_id`.

  **QA Scenarios**:

  ```
  Scenario: Single GitHub ping inserts and dedupes
    Tool: Bash (bun test)
    Steps: bun test apps/website/src/app/api/daemon/pings/github -t "ping"
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-20-ping.txt

  Scenario: Array of check runs inserts row-per-element with per-row idempotency
    Tool: Bash (bun test)
    Steps: bun test apps/website/src/app/api/daemon/pings/github -t "check_runs"
    Expected Result: pass; insert 5, re-post same 5 ⇒ row count still 5
    Evidence: .sisyphus/evidence/task-20-runs.txt
  ```

  **Evidence**: `.sisyphus/evidence/task-20-ping.txt`, `.sisyphus/evidence/task-20-runs.txt`

  **Commit**: groups with T17. Combined message: `feat(website): ingest endpoints for host, website, container, github ping types`. Files: all 4 routes + tests. Pre-commit: full `bun test apps/website/src/app/api/daemon/pings`.

- [x] 21. Daemon: rewrite `apps/daemon/src/jobs/host.ts` to return a DTO

  **What to do**:

  - Remove all `@mon/db` imports and `db.insert(...)` calls.
  - Change signature: `export async function pingHost(tile: HostJobTile, deps?: { execa?: typeof execa }): Promise<HostPingDTO>` where `HostJobTile` is the per-type job tile schema exported from `@mon/contracts` (see T2 — these are the daemon-visible subset of fields the website serializes into `JobsResponse`).
  - Body: same ICMP ping via execa, build the DTO with `kind: "host"`, `crypto.randomUUID()` for `ping_id`, `daemonEnv.DAEMON_ID` for `daemon_id`, `new Date().toISOString()` for `recorded_at`, `key: \`host:${tile.address}\``.
  - **Success convention**: success = `error === null`. There is NO `success: boolean` field in HostPingDTO (per T2).
    - On successful ICMP: `latency_ms: <measured-ms>`, `error: null`.
    - On execa rejection / non-zero exit: `latency_ms: null`, `error: <message>`. Do NOT throw — the pull loop's `executeJob` wrapper will POST regardless.
  - Unit test: mock execa, verify DTO shape on both success (error null, latency > 0) and failure (latency null, error string).

  **Must NOT do**:

  - Do NOT import `@mon/db`, `@mon/config`, or `getConfig`.
  - Do NOT mutate `tile` in place.
  - Do NOT keep the `{ success, error }` Result-style return — the DTO subsumes it via `error === null`.
  - Do NOT add a `success: boolean` field to the DTO — T2 doesn't define one; use null/non-null `error` as the discriminator.

  **Recommended Agent Profile**: `quick`. Skills: `[]`.

  **Parallelization**: Wave 3, parallel with T22-T24. Blocks T25. Blocked by T2, T14.

  **References**:

  - `apps/daemon/src/jobs/host.ts` — current implementation (file:1-end).
  - `packages/contracts/index.ts` — `HostPingDTO` and `HostJobTile` (per-type job-tile schema, see T2 addition).

  **Acceptance Criteria**:

  - [ ] `bun test apps/daemon/src/jobs/host.test.ts` passes — success path returns DTO with `error: null` and `latency_ms` > 0; failure path returns DTO with `latency_ms: null` and a non-empty `error` string
  - [ ] File has zero imports of `@mon/db` or `@mon/config`

  **QA Scenarios**:

  ```
  Scenario: Successful ping returns success DTO
    Tool: Bash (bun test)
    Steps: bun test apps/daemon/src/jobs/host.test.ts -t "success"
    Expected Result: pass; dto.error === null, dto.latency_ms > 0
    Evidence: .sisyphus/evidence/task-21-success.txt

  Scenario: Failed ping returns failure DTO (not thrown)
    Tool: Bash (bun test)
    Steps: bun test apps/daemon/src/jobs/host.test.ts -t "failure"
    Expected Result: pass; dto.latency_ms === null, dto.error is a non-empty string
    Evidence: .sisyphus/evidence/task-21-failure.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-21-success.txt`
  - [ ] `.sisyphus/evidence/task-21-failure.txt`

  **Commit**: YES (group with T22-T24)

  - Message: `refactor(daemon): jobs return DTOs instead of inserting into DB`
  - Pre-commit: `bun run lint && bun test apps/daemon/src/jobs`

- [x] 22. Daemon: rewrite `apps/daemon/src/jobs/website.ts` to return a DTO

  **What to do**: Same shape as T21, but HTTP HEAD probe via fetch. Signature: `pingWebsite(tile: WebsiteJobTile, ...): Promise<WebsitePingDTO>` — `WebsiteJobTile` is from `@mon/contracts` (T2). On 2xx/3xx response: `latency_ms: <measured>`, `error: null`. On 4xx/5xx or network error: `latency_ms: null`, `error: \`HTTP ${status}\``(or the network error message). Build`key`as`website:<tile.url>`.

  **Must NOT do**: Same exclusions as T21 (no `@mon/db`, no `@mon/config`, no `success` field). Also: do NOT follow redirects automatically if the current implementation doesn't — preserve behavior.

  **Recommended Agent Profile**: `quick`. Skills: `[]`.

  **Parallelization**: Wave 3, parallel. Blocks T25. Blocked by T2, T14.

  **References**:

  - `apps/daemon/src/jobs/website.ts` — current impl.
  - `packages/contracts/index.ts` — `WebsitePingDTO`, `WebsiteJobTile`.

  **Acceptance Criteria**: `bun test apps/daemon/src/jobs/website.test.ts` passes (mocks fetch).

  **QA Scenarios**:

  ```
  Scenario: 200 response → success DTO with error null
    Tool: Bash (bun test)
    Steps: bun test apps/daemon/src/jobs/website.test.ts -t "200"
    Expected Result: pass; dto.error === null, dto.latency_ms > 0
    Evidence: .sisyphus/evidence/task-22-200.txt

  Scenario: Network error → failure DTO with error string
    Tool: Bash (bun test)
    Steps: bun test apps/daemon/src/jobs/website.test.ts -t "network"
    Expected Result: pass; dto.latency_ms === null, dto.error is non-empty
    Evidence: .sisyphus/evidence/task-22-err.txt
  ```

  **Evidence**: `.sisyphus/evidence/task-22-200.txt`, `.sisyphus/evidence/task-22-err.txt`

  **Commit**: groups with T21.

- [x] 23. Daemon: rewrite `apps/daemon/src/jobs/container.ts` to return a DTO

  **What to do**:

  - Signature: `pingContainer(tile: ContainerJobTile, ...): Promise<ContainerPingDTO>` — `ContainerJobTile` is from `@mon/contracts` (T2).
  - On Docker API success (container running): `error: null`. On stopped/not-found/Docker API error: `error: <message>`. Build `key` as `container:<tile.container_name>`.
  - **Remove** the side-effect that currently also writes a `mon_website_ping` row from inside this job (per T12's note) — if the website probe is needed, it's now scheduled as a separate `website` tile in config.

  **Must NOT do**: No `@mon/db`. No `@mon/config`. No `success` field. No side-effect writes to a different ping type.

  **Recommended Agent Profile**: `quick`. Skills: `[]`.

  **Parallelization**: Wave 3, parallel. Blocks T25. Blocked by T2, T14.

  **References**: `apps/daemon/src/jobs/container.ts` current impl; `ContainerPingDTO`, `ContainerJobTile` (both from `@mon/contracts`).

  **Acceptance Criteria**: `bun test apps/daemon/src/jobs/container.test.ts` passes; no side-effect ping types.

  **QA Scenarios**:

  ```
  Scenario: Container running → success DTO
    Tool: Bash (bun test)
    Steps: bun test apps/daemon/src/jobs/container.test.ts -t "running"
    Expected Result: pass; dto.error === null
    Evidence: .sisyphus/evidence/task-23-running.txt

  Scenario: Docker API error → failure DTO
    Tool: Bash (bun test)
    Steps: bun test apps/daemon/src/jobs/container.test.ts -t "error"
    Expected Result: pass; dto.error is non-empty
    Evidence: .sisyphus/evidence/task-23-error.txt
  ```

  **Evidence**: `.sisyphus/evidence/task-23-running.txt`, `.sisyphus/evidence/task-23-error.txt`

  **Commit**: groups with T21.

- [x] 24. Daemon: rewrite `apps/daemon/src/jobs/github.ts` to return DTOs (ping + check runs)

  **What to do**:

  - Signature: `pingGithub(tile: GithubJobTile, deps?): Promise<{ ping: GithubPingDTO, checkRuns: GithubCheckRunDTO[] }>` — `GithubJobTile` is from `@mon/contracts` (T2). The orchestrator (T25) sends the ping to `/api/daemon/pings/github` and the check runs as a separate POST (or in the same POST as an array per T20's discriminated union).
  - **DTO construction**:
    - On success: build `GithubPingDTO` with `kind: "github_ping"`, `ping_id: crypto.randomUUID()`, `daemon_id: daemonEnv.DAEMON_ID`, `recorded_at: new Date().toISOString()`, `key: \`github:${tile.repo}\``, `commit_hash: <fetched HEAD sha>`, `check_run_id: <last check run's GitHub id, or null>`, `error: null`. If only commit fetch succeeds but no check runs, set `check_run_id: null`and`error: "no check runs"` to satisfy the DB constraint.
    - On failure (API 4xx/5xx, network error): set `commit_hash: null`, `check_run_id: null`, `error: <message>`.
    - For each check run from GitHub API: build `GithubCheckRunDTO` with `kind: "github_check_run"`, `ping_id: crypto.randomUUID()` (unique per check run), `daemon_id`, `recorded_at`, `key: \`github:${tile.repo}\``, and map the GitHub API response fields to DB column equivalents (`id`, `name`, `status`, `conclusion`, `details_url`, `started_at`, `completed_at`).
  - GitHub token comes from `tile.github_token` (per-tile field added in T1; optional — if missing, use unauthenticated GitHub API with lower rate limit).
  - All UUIDs daemon-generated per ingestion event using `crypto.randomUUID()`.

  **Must NOT do**:

  - No `@mon/db`. No `env.GITHUB_TOKEN` reads — fully per-tile.
  - Do NOT emit a `GithubPingDTO` where both `commit_hash`/`check_run_id` AND `error` are all null — Zod `.refine` (T2) AND the DB check constraint will reject it.

  **Recommended Agent Profile**: `quick`. Skills: `[]`.

  **Parallelization**: Wave 3, parallel. Blocks T25. Blocked by T2, T14.

  **References**: `apps/daemon/src/jobs/github.ts` current impl; `GithubPingDTO`, `GithubCheckRunDTO`, `GithubJobTile` (all from `@mon/contracts`, T2).

  **Acceptance Criteria**: `bun test apps/daemon/src/jobs/github.test.ts` passes; uses per-tile token, not env.

  **QA Scenarios**:

  ```
  Scenario: GitHub check runs fetched and returned as DTOs
    Tool: Bash (bun test)
    Steps: bun test apps/daemon/src/jobs/github.test.ts -t "check runs"
    Expected Result: pass; dto array length matches mocked API response
    Evidence: .sisyphus/evidence/task-24-runs.txt

  Scenario: 401 from GitHub API → failure DTO
    Tool: Bash (bun test)
    Steps: bun test apps/daemon/src/jobs/github.test.ts -t "401"
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-24-401.txt
  ```

  **Evidence**: `.sisyphus/evidence/task-24-runs.txt`, `.sisyphus/evidence/task-24-401.txt`

  **Commit**: groups with T21. Combined message: `refactor(daemon): jobs return DTOs; remove DB writes from daemon`. Files: all 4 jobs + tests. Pre-commit: `bun run lint && bun test apps/daemon/src/jobs`.

- [x] 25. Daemon: new `apps/daemon/src/index.ts` orchestrator (delete getConfig + DB)

  **What to do**:

  - Replace entire `apps/daemon/src/index.ts`:
    - Import `daemonEnv` from `@mon/env`.
    - Build `WebsiteApiClient` (T14) with `daemonEnv.WEBSITE_URL`, `daemonEnv.DAEMON_ID`, `daemonEnv.DAEMON_TOKEN`.
    - Define `executeJob(tile)`: dispatch on `tile.type` to one of the 4 job functions (T21-T24); on the returned DTO, call the appropriate `pushXPing(...)` on the client. Log errors but never throw out of the cron callback.
    - Call `startPullLoop({ client, interval: daemonEnv.DAEMON_POLL_INTERVAL_SECONDS, onJobsUpdated: executeJob, signal })`.
    - Wire `signal` to `SIGTERM`/`SIGINT` handlers for clean shutdown.
  - **Delete** `apps/daemon/src/jobs/` entries' DB writes if anything residual (T21-T24 should have left them clean — verify here).
  - **Delete** any leftover `@mon/config`, `@mon/db`, `getConfig`, `CONFIG_PATH`, `DATABASE_URL` references from anywhere under `apps/daemon/src`.
  - Update `apps/daemon/package.json`: remove deps on `@mon/config`, `@mon/db`, `smol-toml`, `postgres`, `drizzle-orm`. Add dep on `@mon/contracts`. Keep `@mon/env`, `node-schedule`, `execa`.

  **Must NOT do**:

  - Do NOT keep `@mon/config`/`@mon/db` imports anywhere in `apps/daemon/`.
  - Do NOT add new schedulers — `startPullLoop` is the only scheduler.
  - Do NOT exit on transient errors — only `UnauthorizedError` exits.

  **Recommended Agent Profile**:

  - **Category**: `deep` — touches every file in `apps/daemon/src` and must produce a clean tree.
  - **Skills**: `[]`

  **Parallelization**:

  - **Can Run In Parallel**: NO — sequential capstone of Wave 4.
  - **Blocks**: T26, T27, T28, T29
  - **Blocked By**: T15, T21, T22, T23, T24

  **References**:

  - Current `apps/daemon/src/index.ts` — the file being replaced.
  - `apps/daemon/src/client/pull-loop.ts` (T15).
  - `apps/daemon/src/client/api-client.ts` (T14).
  - All 4 rewritten jobs (T21-T24).

  **Acceptance Criteria**:

  - [ ] `bun run lint` passes
  - [ ] `bun test apps/daemon` (full daemon suite) passes
  - [ ] `grep -r "@mon/db\|@mon/config\|getConfig\|CONFIG_PATH\|DATABASE_URL\|smol-toml" apps/daemon/src/` returns ZERO matches
  - [ ] `apps/daemon/package.json` no longer lists `@mon/db`, `@mon/config`, `postgres`, `drizzle-orm`, `smol-toml`

  **QA Scenarios**:

  ```
  Scenario: Forbidden imports are absent
    Tool: Bash
    Steps:
      1. ! grep -r "@mon/db\|@mon/config\|getConfig\|CONFIG_PATH\|DATABASE_URL\|smol-toml" apps/daemon/src/
    Expected Result: Exit 0 (no matches found).
    Evidence: .sisyphus/evidence/task-25-grep.txt

  Scenario: Daemon starts with new env, polls, exits cleanly on SIGTERM
    Tool: interactive_bash (tmux)
    Preconditions: built daemon (apps/daemon/dist/daemon.cjs); a fake website at localhost:3999 that returns { tiles: [] } on /api/daemon/jobs (use `bun -e` one-liner via http server)
    Steps:
      1. Start fake website in window A
      2. Start daemon in window B: WEBSITE_URL=http://localhost:3999 DAEMON_ID=test DAEMON_TOKEN=tok bun apps/daemon/dist/daemon.cjs
      3. Wait 2s; assert log contains "polling jobs" or similar
      4. Send SIGTERM; assert process exits within 1s with code 0
    Expected Result: clean lifecycle as described
    Evidence: .sisyphus/evidence/task-25-lifecycle.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-25-grep.txt`
  - [ ] `.sisyphus/evidence/task-25-lifecycle.txt`

  **Commit**: YES

  - Message: `refactor(daemon): orchestrator pulls jobs and pushes pings; drop config + DB deps`
  - Files: `apps/daemon/src/index.ts`, `apps/daemon/package.json`
  - Pre-commit: `bun run lint && bun test apps/daemon`

- [x] 26. Verify esbuild bundle has no `pg`/`drizzle`/`smol-toml`/`@mon/db`/`@mon/config`

  **What to do**:

  - `cd apps/daemon && bun run build`.
  - Grep the resulting `dist/daemon.cjs` for forbidden substrings: `require("pg")`, `drizzle-orm`, `smol-toml`, `@mon/db`, `@mon/config`, `CONFIG_PATH`, `DATABASE_URL`.
  - If any match: fix the offending import upstream (likely indicates a leaked dep) and re-bundle.
  - Add this grep as a CI step in `.github/workflows/test-daemon.yml` (or wherever daemon CI lives).

  **Must NOT do**:

  - Do NOT add `--external` flags to esbuild to mask the imports; actually remove them at source.

  **Recommended Agent Profile**: `quick`. Skills: `[]`.

  **Parallelization**: Wave 4. Blocks F1, F2. Blocked by T25.

  **References**: `apps/daemon/package.json` build script; existing esbuild invocation.

  **Acceptance Criteria**:

  - [ ] `bun run build` succeeds in `apps/daemon`
  - [ ] grep returns no matches (script exits 0)
  - [ ] Bundle size hasn't grown by > 20% vs baseline (record baseline before/after)

  **QA Scenarios**:

  ```
  Scenario: Bundle audit script passes
    Tool: Bash
    Steps:
      1. cd apps/daemon && bun run build
      2. ! grep -E "(require\(['\"]pg['\"]\)|drizzle-orm|smol-toml|@mon/db|@mon/config|CONFIG_PATH|DATABASE_URL)" dist/daemon.cjs
    Expected Result: exit 0
    Evidence: .sisyphus/evidence/task-26-bundle.txt
  ```

  **Evidence**: `.sisyphus/evidence/task-26-bundle.txt`

  **Commit**: YES

  - Message: `chore(daemon): CI guard against forbidden bundled deps`
  - Files: `.github/workflows/test-daemon.yml` (or repo-wide test workflow if that's where daemon is)
  - Pre-commit: `cd apps/daemon && bun run build && ! grep -E "(...)" dist/daemon.cjs`

- [x] 27. Update `.github/workflows/deploy-daemon.yml` + `deploy-website.yml`

  **What to do**:

  - **deploy-daemon.yml**: Add `WEBSITE_URL`, `DAEMON_ID`, `DAEMON_TOKEN` to env passed to the daemon container/process. Remove `CONFIG_PATH`, `DATABASE_URL`, `GITHUB_TOKEN` from the daemon's env. Update any volume mounts that mounted `/etc/mon/` into the daemon container.
  - **deploy-website.yml**: Add `CONFIG_PATH` (pointing to a website-side path; document mount/volume requirement). Ensure `DATABASE_URL` is present (already should be). Document where the TOML lives on the website host (e.g. `/etc/mon/config.toml` on the website's host machine, mounted into the container).
  - Update both workflow's "test" steps to include `bun test` and `bunx playwright test` for the website job (use `secrets.PLAYWRIGHT_BROWSERS_PATH_CACHE` if useful).
  - Update the `format` / `lint` workflow if needed to include new package paths.

  **Must NOT do**:

  - Do NOT commit any real tokens. Use `secrets.*`.
  - Do NOT change the Tailscale + SSH deploy mechanism — only env vars and mount paths.

  **Recommended Agent Profile**: `quick`. Skills: `[]`.

  **Parallelization**: Wave 4. Blocks F1. Blocked by T25.

  **References**:

  - `.github/workflows/deploy-daemon.yml` — current daemon deploy workflow.
  - `.github/workflows/deploy-website.yml` — current website deploy workflow.

  **Acceptance Criteria**:

  - [ ] `yamllint` (or simple GitHub Actions schema check via `actionlint`) passes on both files
  - [ ] Workflow files reference only the new daemon env vars (grep guard)

  **QA Scenarios**:

  ```
  Scenario: Daemon workflow has new env vars and not the old ones
    Tool: Bash
    Steps:
      1. grep -E "(WEBSITE_URL|DAEMON_ID|DAEMON_TOKEN)" .github/workflows/deploy-daemon.yml
      2. ! grep -E "(CONFIG_PATH|DATABASE_URL|GITHUB_TOKEN)" .github/workflows/deploy-daemon.yml
    Expected Result: first grep matches, second exits 0 with no matches
    Evidence: .sisyphus/evidence/task-27-daemon-yml.txt

  Scenario: Website workflow has CONFIG_PATH
    Tool: Bash
    Steps: grep CONFIG_PATH .github/workflows/deploy-website.yml
    Expected Result: matches
    Evidence: .sisyphus/evidence/task-27-web-yml.txt
  ```

  **Evidence**: `.sisyphus/evidence/task-27-daemon-yml.txt`, `.sisyphus/evidence/task-27-web-yml.txt`

  **Commit**: YES

  - Message: `chore(ci): rewire daemon and website deploy envs for new architecture`
  - Files: `.github/workflows/deploy-daemon.yml`, `.github/workflows/deploy-website.yml`
  - Pre-commit: `actionlint` if available

- [x] 28. Playwright e2e: real daemon child process + real website + real Postgres

  **What to do**:

  - Create `apps/website/e2e/distributed-mon.spec.ts`.
  - Test setup (`test.beforeAll`): boot Postgres via `@mon/test-utils` harness; write a fixture TOML to a tmp dir with one `[daemons.e2e]` block + a host tile assigned to `e2e` (use `127.0.0.1` for guaranteed-up); set `CONFIG_PATH` env to that tmp file.
  - Playwright `webServer` config boots the website with this env (uses `tsx`/`bun` to start in dev mode or a built copy).
  - Test body:
    1. Spawn the daemon as a child process: `bun apps/daemon/dist/daemon.cjs` with `WEBSITE_URL`, `DAEMON_ID=e2e`, `DAEMON_TOKEN=<token>` env (token hash matches the fixture TOML).
    2. Wait up to 90s for the first ping row to appear in `mon_host_ping` (poll Postgres).
    3. Navigate browser to `/`; assert the host tile renders with a recent status (green/red indicator selector).
    4. Kill the daemon child process (`SIGTERM`); assert it exits with code 0 within 2s.
  - Negative test 1: spawn daemon with wrong token; assert daemon exits with code 78 within 5s (poll process status).
  - Negative test 2: spawn daemon with `DAEMON_ID=ghost` (not in TOML); assert it polls successfully but schedules zero jobs (no ping rows appear after 30s).
  - Test teardown: kill any daemon child; stop Postgres; remove tmp TOML.

  **Must NOT do**:

  - Do NOT mock anything — this is a true end-to-end test.
  - Do NOT use stubs for Postgres or the daemon process.
  - Do NOT leave child processes or containers running on test failure (use `try/finally` + `afterAll`).

  **Recommended Agent Profile**:

  - **Category**: `unspecified-high` — orchestrating multiple real processes is tricky.
  - **Skills**: `[playwright]`

  **Parallelization**: Wave 4. Blocks F3. Blocked by T16-T20, T25, T5, T4.

  **References**:

  - `apps/website/playwright.config.ts` (T5).
  - `packages/test-utils/postgres-harness.ts` (T4).
  - Playwright [child_process spawning patterns](https://playwright.dev/docs/test-fixtures).

  **Acceptance Criteria**:

  - [ ] `bunx playwright test e2e/distributed-mon.spec.ts` passes locally with no leftover processes
  - [ ] Total runtime < 3 minutes
  - [ ] All 3 scenarios (happy, 401, ghost-daemon) pass

  **QA Scenarios**:

  ```
  Scenario: Happy path — daemon pings, row appears, UI renders
    Tool: Bash (playwright)
    Steps: cd apps/website && bunx playwright test e2e/distributed-mon.spec.ts -g "happy"
    Expected Result: pass; trace saved
    Evidence: .sisyphus/evidence/task-28-happy.txt, .sisyphus/evidence/task-28-happy.png (Playwright screenshot)

  Scenario: Bad token → daemon exits 78
    Tool: Bash (playwright)
    Steps: bunx playwright test e2e/distributed-mon.spec.ts -g "bad token"
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-28-401.txt

  Scenario: Ghost daemon → polls but schedules zero jobs
    Tool: Bash (playwright)
    Steps: bunx playwright test e2e/distributed-mon.spec.ts -g "ghost"
    Expected Result: pass
    Evidence: .sisyphus/evidence/task-28-ghost.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-28-happy.txt`
  - [ ] `.sisyphus/evidence/task-28-happy.png`
  - [ ] `.sisyphus/evidence/task-28-401.txt`
  - [ ] `.sisyphus/evidence/task-28-ghost.txt`

  **Commit**: YES

  - Message: `test(e2e): distributed-daemon Playwright spec covers happy + auth + unknown-daemon`
  - Files: `apps/website/e2e/distributed-mon.spec.ts`
  - Pre-commit: `cd apps/website && bunx playwright test`

- [x] 29. Delete dead code from migration

  **What to do**:

  - Grep for leftover dead code that was made unused by the refactor:
    - Old `Result`-style return helpers in `apps/daemon/src/jobs/*` (subsumed by DTO with `success: boolean`).
    - Daemon-side `getConfig` import sites.
    - Any direct `db.insert(monXxxPing)` outside `apps/website/src/lib/server/ingest/`.
    - `GITHUB_TOKEN` from `@mon/env` if no longer referenced anywhere.
    - Old `host.ts` / `website.ts` / `container.ts` / `github.ts` daemon file content that's now obsolete after T21-T24.
  - Run `bunx knip` (or `ts-prune`) if available to catch unused exports — install briefly, scan, remove unused.
  - Update `AGENTS.md` "drift hazard" note that mentioned `Host` import path inconsistency — that file is rewritten now.
  - Run final `bun run lint` + `bun test` + `bunx playwright test` — all green.

  **Must NOT do**:

  - Do NOT remove anything that another task or test still references (knip should catch this).
  - Do NOT delete files that the build still imports from (compiler will tell you).
  - Do NOT add new code in this task — pure deletion + comment cleanup.

  **Recommended Agent Profile**: `quick`. Skills: `[]`.

  **Parallelization**: Wave 4. Blocks F1-F4. Blocked by T25, T28.

  **References**: all files touched by T21-T25; `AGENTS.md`.

  **Acceptance Criteria**:

  - [ ] `bunx knip` (or `tsc --noEmit`) flags zero unused exports in changed packages
  - [ ] `bun run lint` clean
  - [ ] `bun test && bunx playwright test` clean
  - [ ] `AGENTS.md` drift-hazard note removed or updated

  **QA Scenarios**:

  ```
  Scenario: No unused exports remain
    Tool: Bash
    Steps:
      1. bunx knip --no-progress --no-exit-code
      2. Capture output
    Expected Result: 0 unused exports under apps/daemon/src/, apps/website/src/lib/server/, packages/contracts/, packages/config/
    Evidence: .sisyphus/evidence/task-29-knip.txt

  Scenario: Full test suite green
    Tool: Bash
    Steps:
      1. bun run lint
      2. bun test
      3. cd apps/website && bunx playwright test
    Expected Result: all 3 exit 0
    Evidence: .sisyphus/evidence/task-29-fullsuite.txt
  ```

  **Evidence to Capture**:

  - [ ] `.sisyphus/evidence/task-29-knip.txt`
  - [ ] `.sisyphus/evidence/task-29-fullsuite.txt`

  **Commit**: YES

  - Message: `chore: remove dead code from architecture migration`
  - Files: various across `apps/daemon/`, `packages/env/`, `AGENTS.md`
  - Pre-commit: `bun run lint && bun test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
      Read this plan end-to-end. For each "Must Have": verify implementation exists (open file, curl endpoint, run bun test). For each "Must NOT Have": grep codebase for forbidden patterns and reject with file:line. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables list against actual files. Specifically verify: daemon has zero `pg`/`drizzle`/`smol-toml`/`@mon/db`/`@mon/config` imports; website has the 5 new routes; all 5 ping tables have `daemon_id` + `ping_id`.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
      Run `bun run lint` + `bunx drizzle-kit check` + `bun test` + `bunx playwright test` (full pyramid). Review changed files for: `as any`, `@ts-ignore`, empty `catch {}`, commented-out code, unused imports, leftover `console.log` debug statements (logger calls are fine), generic names (`data`, `result`, `item`), copy-pasted blocks that should be helpers.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Unit/Integration tests [N pass/N fail] | Playwright [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` + `playwright`
      Boot website + Postgres + daemon process (real binaries, not mocks) from a clean state. Execute every QA scenario from every task; capture evidence. Test integration: tile assigned to a daemon ⇒ daemon pulls ⇒ daemon pings ⇒ pushes ⇒ DB row written ⇒ UI renders status. Test edge cases: unknown daemon token (401), tile assigned to non-existent daemon, duplicate `ping_id`, daemon down (UI shows stale), daemon up after website restart (continues working).
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual git diff for that task's files. Verify 1:1 — everything specified was built, nothing beyond spec was built. Check "Must NOT do" compliance per-task. Detect cross-task contamination (task N touched task M's files). Flag unaccounted changes (files modified outside any task's scope).
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

One commit per task (or per task group where atomic). Convention: `type(scope): desc` matching the project's existing commit style. Examples in each task below.

---

## Success Criteria

### Verification Commands

```bash
# Lint (must be clean)
bun run lint

# Drizzle migration is clean
cd packages/db && bunx drizzle-kit check && bunx drizzle-kit generate --dry-run

# Unit + integration
bun test

# E2E
cd apps/website && bunx playwright test

# Daemon bundle audit
cd apps/daemon && bun run build
! grep -E "(require\(['\"]pg['\"]\)|drizzle-orm|smol-toml|@mon/db|@mon/config|CONFIG_PATH|DATABASE_URL)" dist/daemon.cjs

# Daemon starts with only the new env vars
WEBSITE_URL=http://localhost:3000 DAEMON_ID=test DAEMON_TOKEN=$(openssl rand -hex 32) bun apps/daemon/dist/daemon.cjs
# Expected: connects, polls /api/daemon/jobs, schedules nothing (no assignments), no crash
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All unit + integration + e2e tests pass
- [ ] All 4 final-verification agents APPROVE
- [ ] User has given explicit "okay"
