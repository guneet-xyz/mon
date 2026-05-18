# Issues

## 2026-05-18 Session Start

(none yet — will be populated as tasks complete)

## T-env split (env.ts) — 2026-05-18

- No `env.APP` usage anywhere in codebase — safe to drop.
- Consumers of `@mon/env`:
  - `packages/db/index.ts` → uses `env.DATABASE_URL`, `env.NODE_ENV` (✓ via alias)
  - `packages/db/drizzle.config.ts` → uses `env.DATABASE_URL` (✓ via alias)
  - `packages/config/index.ts` → uses `env.CONFIG_PATH` (✓ via alias)
  - `apps/daemon/src/jobs/github.ts` → uses `env.GITHUB_TOKEN` ❌ BROKEN
- `env.GITHUB_TOKEN` removed per spec (per-tile in TOML). Breaks `apps/daemon/src/jobs/github.ts:91`.
  Expected: daemon rewrite (T25) replaces this whole file. Until then, `bun run lint:tsc` fails on daemon only.
- `packages/env/index.ts` itself is clean; lsp_diagnostics passes on it.

## 2026-05-18 task-4 @mon/test-utils

- Docker is NOT installed in current dev environment (`docker` command not found).
- The ephemeral Postgres harness package was created and is well-formed, but the smoke test cannot pass locally without docker.
- LSP diagnostics on packages/test-utils/ are clean.
- `bun:test` types missing repo-wide (also affects packages/config/schema.test.ts) — pre-existing, not introduced by this task.
- Harness uses `bunx drizzle-kit push --force` against ephemeral container (db package has no migrations/ folder; project uses push workflow per packages/db/AGENTS.md).
- Cleanup: process exit handlers (exit/SIGINT/SIGTERM/uncaughtException) + explicit stop() + `docker run --rm` triple-redundancy.

## F2 Code Quality Review - 2026-05-18

### Fixes applied during review:
1. **`packages/config/index.ts`**: Added re-export of types (`Config`, `MonitorTile`, etc.) and functions (`getDaemonAssignments`, `verifyDaemonToken`) from `./schema`. Previously these were only accessible via `@mon/config/schema` subpath. Files importing `Config` from `@mon/config` (e.g., `daemon-auth.ts`, `config-cache.ts`) were getting "error" types in ESLint.
2. **`packages/config/package.json`**: Changed `"main": "src/index.ts"` → `"main": "index.ts"` (source is at package root, not in `src/`).
3. **`apps/website/tsconfig.json`**: Added `"types": ["bun-types"]` so `bun:test` imports in test files resolve for ESLint type-aware linting.

### Remaining lint issues (43 errors, all in NEW test files):
- `@typescript-eslint/no-floating-promises`: `mock.module(...)` calls without `await`. These return Promises in newer bun-types.
- `@typescript-eslint/no-unsafe-assignment` / `no-unsafe-member-access`: `await res.json()` returning `any` and then accessing `.error`. Tests should validate JSON response shape or cast through `unknown`.

Affected test files:
- `apps/website/src/app/api/daemon/jobs/route.test.ts`
- `apps/website/src/app/api/daemon/pings/{container,github,host,website}/route.test.ts`
- `apps/website/src/lib/server/config-cache.test.ts`
- `apps/website/src/lib/server/daemon-auth.test.ts`
- `apps/website/src/lib/server/ingest/{container,github,host,website}.test.ts`

### Code quality findings on non-test files:
- All 21 reviewed files are CLEAN: no `as any`, no `@ts-ignore`, no empty catches, no commented-out code, no generic names, no obvious duplication. `console.log` calls in `apps/daemon/src/index.ts` are intentional structured logs.
- Minor: `apps/daemon/src/jobs/container.ts` line 36-37 — `await res.json()` then `.State?.Status` access without Zod validation. Other ping jobs (github) properly use `safeParse`. Container should follow suit for consistency.

