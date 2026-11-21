# TESTING

Reference for running, writing, and debugging tests in `@mon`.

## 1. Overview

| Layer            | Runner     | Lives in                                                                                    | Touches                                |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| Unit             | `bun:test` | `apps/agent/src/**/*.test.ts`, `apps/website/src/**/*.test.ts`, `packages/config/*.test.ts` | Injected or mocked deps only           |
| Database         | `bun:test` | `apps/website/src/**/*.db.test.ts`                                                          | Docker Postgres via `createTestDb()`   |
| Integration      | `bun:test` | `packages/test-utils/__tests__/*.test.ts`                                                   | Docker Postgres + in-process HTTP      |
| End-to-end (E2E) | Playwright | `apps/website/e2e/*.e2e.ts`                                                                 | Real agent bundle + website + Postgres |

Mock backends (GitHub API, HTTP hosts) run as in-process HTTP servers, not Docker. See section 6.

## 2. Running tests locally

```bash
bun run test              # unit + database + integration (needs Docker), with coverage
bun run test:unit         # same as `bun run test`
bun run test:integration  # only packages/test-utils/__tests__
bun run test:e2e          # builds the agent bundle, then runs Playwright
bun run screenshots       # screenshot tour (Playwright) → apps/website/screenshots/
```

Prerequisites:

- Bun `1.2.15` (pinned in CI)
- Docker daemon running, current user in the `docker` group. `createTestDb()` starts a throwaway `postgres:16` container per call and applies `schema.ts` with `drizzle-kit push --force`
- For E2E: Playwright's Chromium (`cd apps/website && bunx playwright install chromium`)

E2E must be invoked through `bun run e2e` (from `apps/website`) or `bun run test:e2e` (repo root), never `bunx playwright test` directly. The wrapper ([`apps/website/scripts/run-e2e.ts`](apps/website/scripts/run-e2e.ts)):

1. builds the `@mon/test-utils` CJS bundle the specs load;
2. starts a test Postgres and copies a fixture config (`E2E_FIXTURE`, default `single-github.toml`) to `/tmp/mon-e2e-config.toml`;
3. writes `apps/website/.env.test.local` and `apps/website/.e2e-runtime.json` for the website and the specs;
4. runs Playwright, which starts `next dev` on `E2E_PORT` (default `3055`).

The agent bundle (`apps/agent/dist/agent.cjs`) must already be built; `bun run test:e2e` does that. Set `E2E_PORT` when anything else may use `3055`. The config path is fixed, so don't run two E2E suites on the same machine at the same time.

## 3. Test layout

```
apps/
├── agent/src/
│   ├── jobs/*.test.ts                # host, website, container, github, system job functions
│   ├── client/*.test.ts              # api-client (parseJobs, push), pull-loop (backoff, 401 exit)
│   ├── index.test.ts                 # executeJob dispatch
│   └── token.test.ts                 # AGENT_TOKEN / AGENT_TOKEN_FILE
└── website/
    ├── src/app/api/agent/**/route.test.ts  # agent API routes (auth, validation, mapping)
    ├── src/lib/**/*.test.ts                # tile generation, formatting, ingest, monitors, auth, config cache
    ├── src/lib/**/*.db.test.ts             # ingest/history against a real Postgres
    ├── e2e/
    │   ├── _runtime.ts                     # getRuntime(), writeRuntimeConfig()
    │   ├── distributed-mon.e2e.ts          # canonical template (read this first)
    │   ├── board.tour.ts                   # screenshot tour (bun run screenshots)
    │   └── *.e2e.ts                        # one spec per scenario
    └── scripts/run-e2e.ts                  # E2E wrapper
packages/
├── config/*.test.ts                        # getConfig, schema, public config
└── test-utils/
    ├── index.ts                            # createTestDb, withTestDb, createMockGithubServer, createMockHttpHost, fixturePath
    ├── fixtures/                           # *.toml fixtures
    └── __tests__/                          # integration tests for the helpers themselves
```

## 4. Writing a new unit test

Use `bun:test`. Co-locate as `<source>.test.ts` next to the file under test.

**Agent jobs take their dependencies as arguments**, so pass fakes instead of mocking modules:

```ts
import { expect, it, mock } from "bun:test"

import { pingHost } from "./host"

it("returns latency on a successful ping", async () => {
  const execa = mock(async () => ({
    stdout: "64 bytes from 127.0.0.1: icmp_seq=0 ttl=64 time=0.1 ms",
    exitCode: 0,
  }))
  const result = await pingHost(
    { kind: "host", id: "h", cron: "0 * * * * *", address: "127.0.0.1" },
    { execa: execa as never, agentId: "test-agent" },
  )
  expect(result.error).toBeNull()
  expect(result.latency_ms).toBe(0.1)
})
```

**Website code** uses `mock.module(...)`: route tests mock `@/lib/server/config-cache` and the `@/lib/server/ingest/*` modules, and `*.db.test.ts` files point `@/lib/server/db` at a test database:

```ts
let testDb: TestDb
beforeAll(async () => {
  testDb = await createTestDb()
  await mock.module("@/lib/server/db", () => ({ db: testDb.db }))
}, 120_000)
afterAll(() => testDb?.stop())
```

The root `bunfig.toml` preloads [`apps/website/test-setup.ts`](apps/website/test-setup.ts), which sets `SKIP_ENV_VALIDATION=1` and a placeholder `DATABASE_URL`.

Conventions:

- Assert on the DTO or Result shape: `expect(result.error).toBe(...)`, `expect(result.success).toBe(false)`.
- Name tests that need Docker `*.db.test.ts` so they're easy to spot.

## 5. Writing a new E2E test

Copy [`apps/website/e2e/distributed-mon.e2e.ts`](apps/website/e2e/distributed-mon.e2e.ts) as the template. It shows:

- `getRuntime()` from `./_runtime` for the database URL and config path; the website runs at `http://localhost:${E2E_PORT}`
- `writeRuntimeConfig(path, toml)` to write the test's config; it waits out the website's 5-second config cache, so an agent started right after isn't checked against the previous test's agents
- token auth via `hashToken()` from `@/lib/server/agent-auth` (the config gets the hash, the agent the token)
- spawning the agent bundle (`bun apps/agent/dist/agent.cjs`) with `WEBSITE_URL`, `AGENT_ID`, `AGENT_TOKEN` and a short `AGENT_POLL_INTERVAL_SECONDS`
- asserting on rows with a `postgres` client, then on the rendered board
- cleanup in `test.afterAll` (kill the agent, close the `postgres` client)

Import conventions inside `e2e/`:

- `@/lib/...` for website internals
- `@mon/test-utils` for fixtures and mock servers. Specs load it with `await import("@mon/test-utils")` inside `beforeAll` (Playwright gets the CJS bundle the wrapper builds)
- `./_runtime` (same directory) is the only relative import; no `../`

## 6. Using mock servers

`packages/test-utils/index.ts` exposes two in-process servers. They listen on free ports (or `{ port }`), record `requests`, and are switched between scenarios with `setScenario(...)`.

### Mock GitHub API

```ts
const github = await createMockGithubServer()
github.setScenario({ kind: "success", checkRuns: [/* MockCheckRun */] })
// other scenarios: "empty" (default), "http_error", "slow", "malformed"

// point the agent at it:
spawn("bun", [AGENT_BUNDLE], {
  env: { ...process.env, GITHUB_API_BASE_URL: github.url /* , ... */ },
})
await github.stop()
```

GitHub tokens come from the tile's `github_token` in the config (use a fake such as `"ghp_fixture"`).

### Mock HTTP host (for `website` tiles)

```ts
const host = await createMockHttpHost()
host.setScenario({ kind: "server_error", status: 503 })
// scenarios: "ok" (default), "redirect", "server_error", "slow", "tcp_reset", "no_response"
// host.url → e.g. "http://127.0.0.1:54321"
await host.stop()
```

Both helpers (and `createTestDb()`) register exit handlers, so `Ctrl-C` during a test doesn't leak listeners or containers.

## 7. Anti-patterns

- **No fixed sleeps for UI state in E2E.** Use Playwright `expect.poll(...)` or `expect(locator).toBeVisible({ timeout })`. Polling the database in a loop with a deadline is fine.
- **No snapshot files** for tile output. Pin behaviour via explicit assertions.
- **No real GitHub tokens.** E2E hits `createMockGithubServer()` via `GITHUB_API_BASE_URL`.
- **No leftover Docker containers.** `createTestDb()` cleans up on exit and on `SIGINT`/`SIGTERM`, but if you bypass it, run `docker ps --filter "name=mon-test-" -q | xargs -r docker rm -f`.
- **Do not call `bunx playwright test` directly.** Always `bun run e2e` so the runtime is provisioned.
- **Do not import `../*` from website tests.** Same lint rule as production code: use `@mon/*` or `@/*`.

## 8. Debugging flakes

| Symptom                             | Try                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| E2E intermittently fails            | `cd apps/website && bun run e2e -- --retries=2`                                                                |
| Need to see what the browser did    | `cd apps/website && bunx playwright show-report` (traces on first retry)                                       |
| Run one spec                        | `cd apps/website && bun run e2e -- e2e/multi-agent.e2e.ts`                                                     |
| "port in use" / website won't start | `lsof -iTCP:${E2E_PORT:-3055} -sTCP:LISTEN -P -n`, or pick another `E2E_PORT`                                  |
| Agent exits with code 78            | Its token doesn't match the config's `token_hash` (or the config wasn't settled yet; use `writeRuntimeConfig`) |
| Stray Postgres containers           | `docker ps --filter "name=mon-test-" -q \| xargs -r docker rm -f`                                              |

CI uploads the Playwright HTML report as the `playwright-report` artifact for 14 days; download it from the failed run's Summary page.

## 9. CI

Defined in [.github/workflows/ci.yml](.github/workflows/ci.yml); runs on every push and pull request (and is reused by `release.yml` on the release commit).

| Job                 | What it runs                                                                                    | Artifact                           |
| ------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------- |
| `formatting`        | `bun run format:check`                                                                          | (none)                             |
| `linting`           | `bun run lint`                                                                                  | (none)                             |
| `workflows`         | release version files agree; `actionlint`                                                       | (none)                             |
| `test`              | `bun run test` (unit + database + integration, Docker Postgres)                                 | `coverage`                         |
| `e2e`               | after `test` passes: builds the agent bundle, installs Chromium, `bun run e2e`, screenshot tour | `playwright-report`, `screenshots` |
| `test-docker-build` | builds all four images and runs `.github/scripts/smoke-test-images.sh`                          | (none)                             |

A failed `test` job blocks `e2e`.
