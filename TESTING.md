# TESTING

Reference for running, writing, and debugging tests in `@mon`.

## 1. Overview

Two layers of tests cover the monorepo:

| Layer            | Runner     | Lives in                                                                                      | Touches                |
| ---------------- | ---------- | --------------------------------------------------------------------------------------------- | ---------------------- |
| Unit             | `bun:test` | `apps/agent/src/jobs/*.test.ts`, `apps/website/src/**/*.test.ts`, `packages/config/*.test.ts` | Mocked deps only       |
| Integration      | `bun:test` | `packages/test-utils/__tests__/*.test.ts`                                                     | Docker Postgres + HTTP |
| End-to-end (E2E) | Playwright | `apps/website/e2e/*.e2e.ts`                                                                   | Real agent + website   |

Mock backends for E2E (GitHub API, host pings) run as in-process Bun HTTP servers, not Docker. See section 6.

## 2. Running tests locally

```bash
bun run test         # unit + integration (uses Docker for Postgres)
bun run test:unit    # alias for `bun run test`
bun run test:e2e     # builds agent bundle, then runs Playwright
bun run test:integration  # only packages/test-utils/__tests__
```

Prerequisites:

- Bun `1.2.15` (pinned in CI)
- Docker daemon running, current user in the `docker` group. `createTestDb()` spins up `postgres:18-alpine` containers per test
- For E2E: Playwright browsers installed (`cd apps/website && bunx playwright install chromium`)

E2E must be invoked through `bun run e2e` (which calls `scripts/run-e2e.ts`), never `bunx playwright test` directly. The wrapper provisions a shared Postgres + boots the website on `E2E_PORT`.

## 3. Test layout

```
apps/
├── agent/src/jobs/
│   ├── host.test.ts          # pingHost unit tests
│   ├── website.test.ts       # pingWebsite unit tests
│   ├── container.test.ts     # checkContainer unit tests
│   └── github.test.ts        # checkGithub unit tests
└── website/
    ├── src/**/*.test.ts      # tile-generation, monitor helpers, etc.
    └── e2e/
        ├── _runtime.ts                # shared Postgres + website boot
        ├── distributed-mon.e2e.ts     # canonical template (read this first)
        ├── dedup.e2e.ts
        ├── github-failure.e2e.ts
        ├── host-unreachable.e2e.ts
        └── multi-agent.e2e.ts
packages/
├── config/*.test.ts                   # getConfig, getMonitors, getMonitorConfig
└── test-utils/
    ├── index.ts                       # createTestDb, createMockGithubServer, createMockHttpHost, fixturePath
    ├── fixtures/                      # *.toml fixtures
    └── __tests__/                     # integration tests for the helpers themselves
```

## 4. Writing a new unit test

Use `bun:test` with `mock()` / `mock.module()`. Mock `@mon/db` to avoid touching Postgres in unit scope.

```ts
import { pingHost } from "./host"

import { describe, expect, mock, test } from "bun:test"

mock.module("@mon/db", () => ({
  db: { insert: () => ({ values: () => Promise.resolve() }) },
}))

test("pingHost returns success on reachable address", async () => {
  const result = await pingHost({ address: "127.0.0.1" })
  expect(result.success).toBe(true)
})
```

Conventions:

- Co-locate as `<source>.test.ts` next to the file under test
- Prefer `mock.module(...)` over manual dependency injection
- Use Result-style assertions: `expect(result.success).toBe(false)` then narrow on `result.error`

## 5. Writing a new E2E test

Copy [`apps/website/e2e/distributed-mon.e2e.ts`](apps/website/e2e/distributed-mon.e2e.ts) as the template. It demonstrates:

- `getRuntime()` from `./_runtime` for shared Postgres URL + config path + website URL
- Writing a TOML config into `runtimeConfigPath` before spawning the agent
- Spawning the agent bundle (`apps/agent/dist/agent.cjs`) with `spawn(...)`
- Token-hash auth via `hashToken()` from `@/lib/server/agent-auth`
- Cleanup in `test.afterAll` (kill agent process, close `postgres` client)

Import path conventions inside `e2e/`:

- `@/lib/...` for website internals
- `@mon/test-utils` for fixtures and mock servers
- Relative `./_runtime` is the only allowed parent-less relative import

## 6. Using mock servers

`packages/test-utils/index.ts` exposes two in-process HTTP servers for E2E. They are NOT Docker containers; they listen on ephemeral ports and stop with the test.

### Mock GitHub API

```ts
import { createMockGithubServer } from "@mon/test-utils"

const github = await createMockGithubServer({
  repos: {
    "owner/repo": {
      status: "passing", // or "failing" | "no-workflows"
      latestRun: { conclusion: "success", html_url: "https://example/run/1" },
    },
  },
})

process.env.GITHUB_API_URL = github.url
// ... run agent / assertions
await github.stop()
```

### Mock HTTP host (for `host` and `website` tile types)

```ts
import { createMockHttpHost } from "@mon/test-utils"

const host = await createMockHttpHost({ status: 200, body: "ok" })
// host.url → e.g. "http://127.0.0.1:54321"
await host.stop()
```

Both helpers register exit handlers so a `Ctrl-C` during a test doesn't leak listeners.

## 7. Anti-patterns

- **No `setTimeout`-based waits in E2E.** Use Playwright `expect.poll(...)` or `expect(locator).toBeVisible({ timeout })`.
- **No snapshot files** for tile output. Pin behaviour via explicit assertions.
- **No real GitHub tokens.** E2E hits `createMockGithubServer()` via `GITHUB_API_URL`.
- **No leftover Docker containers.** `createTestDb()` registers `SIGINT`/`SIGTERM`/`exit` cleanup, but if you bypass it, run `docker ps --filter "name=mon-test-" -q | xargs -r docker rm -f`.
- **Do not call `bunx playwright test` directly.** Always `bun run e2e` so the runtime is provisioned.
- **Do not import `../*` from tests.** Same lint rule as production code: use `@mon/*` or `@/*`.

## 8. Debugging flakes

| Symptom                           | Try                                                                        |
| --------------------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| E2E intermittently fails          | `cd apps/website && bun run e2e -- --retries=2`                            |
| Need to see what the browser did  | `bunx playwright show-trace apps/website/playwright-report/trace.zip`      |
| "port in use" / agent won't start | `lsof -iTCP -sTCP:LISTEN -P -n                                             | grep 3055`then`kill -9 <pid>` |
| Stray Postgres containers         | `docker ps --filter "name=mon-test-" -q                                    | xargs -r docker rm -f`        |
| Unit test hangs                   | Check for an un-mocked `@mon/db` import; add `mock.module("@mon/db", ...)` |

CI uploads the Playwright HTML report as `playwright-report` artifact for 14 days; download it from the failed run's Summary page.

## 9. CI

Defined in [.github/workflows/ci.yml](.github/workflows/ci.yml). Three test-related jobs:

| Job                 | Triggers             | What it runs                                               | Artifact            |
| ------------------- | -------------------- | ---------------------------------------------------------- | ------------------- |
| `test`              | every push, every PR | `bun run test` (unit + integration, Docker Postgres)       | `coverage/`         |
| `e2e`               | after `test` passes  | builds agent bundle, installs chromium, runs `bun run e2e` | `playwright-report` |
| `test-docker-build` | every push, every PR | builds each app's Dockerfile (smoke test)                  | (none)              |

`formatting` and `linting` run in parallel with `test`. A failed `test` job blocks `e2e`.
