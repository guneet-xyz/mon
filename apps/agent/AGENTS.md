# apps/agent

Bun-runtime cron poller. Reads tiles from `@mon/config`, schedules one job per monitor tile, writes pings to Postgres via `@mon/db`. Bundled with esbuild to a single CJS file for deploy.

## WHERE TO LOOK

| Task                    | Location                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a new monitor type  | [src/jobs/](file:///Users/guneet/projects/mon/apps/agent/src/jobs) — one file per tile type, exported as `schedule<Type>Job(tile)`; wire into [src/index.ts](file:///Users/guneet/projects/mon/apps/agent/src/index.ts) |
| Change polling schedule | inline cron string in each `scheduleJob(...)` call                                                                                                                                                                      |
| Graceful shutdown       | [src/index.ts](file:///Users/guneet/projects/mon/apps/agent/src/index.ts#L34-L43) — `SIGINT`/`SIGTERM`/`SIGKILL` (note: `SIGKILL` is uncatchable, present anyway)                                                       |

## CONVENTIONS

- **One job file per tile type** (`host.ts`, `website.ts`, `container.ts`, `github.ts`); export a single `scheduleXJob(tile)` and register it in `main()`.
- **Cron uses 6-field strings** (`"0 * * * * *"`) — node-schedule treats the leading field as seconds.
- **Job name = `${type}-${tile.key}`** — used by node-schedule for cancellation; keep unique.
- **All ping functions return `{ success: true, ... } | { success: false, error: string }`**. The job wrapper handles DB insert for both branches.
- **DB writes are unconditional** — every tick produces a row (latency on success, `error` on failure). No "only insert on change" optimization.

## ANTI-PATTERNS

- **Do not throw inside the scheduled callback.** node-schedule will swallow it and the job stays scheduled but invisible. Catch and log instead.
- **Do not import from `apps/website/*`** — the agent must stay stateless and decoupled from the UI.
- **Do not add long-running async loops inside a job** — they overlap with the next tick. Keep work synchronous per invocation or guard with a "running" flag.

## NOTES

- **Build target**: `bunx esbuild src/index.ts --bundle --platform=node --outfile=dist/agent.cjs`. Workspace `@mon/*` deps are inlined; runtime needs only `execa` and `node-schedule` if you ever switch to non-bundled mode (currently bundled).
- **`host.ts` exit codes** `2` (unreachable) and `68` (timeout) are macOS-specific `ping` semantics; CI/Linux containers may differ — verify on the deploy target before relying on these.
- **One file has a non-aliased import**: [`jobs/host.ts`](file:///Users/guneet/projects/mon/apps/agent/src/jobs/host.ts#L5-L6) uses `"packages/config/schema"` instead of `@mon/config/schema`. Inconsistent with siblings — prefer `@mon/*` when editing.
- **No `tsconfig.json` of its own** — picks up root config; root `tsc --noEmit` covers it.
