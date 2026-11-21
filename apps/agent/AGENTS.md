# apps/agent

Bun-runtime agent. Polls the website's `GET /api/agent/jobs` for the tiles assigned to it, runs each check and pushes every result to `POST /api/agent/pings/<kind>`. It has no config file and no database access; its only workspace dependency is `@mon/contracts`. Bundled with esbuild to a single CJS file for deploy.

## WHERE TO LOOK

| Task                    | Location                                                                                                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Env vars                | [src/env.ts](src/env.ts) (`WEBSITE_URL`, `AGENT_ID`, `AGENT_TOKEN`, `AGENT_POLL_INTERVAL_SECONDS`, `GITHUB_API_BASE_URL`) and [src/token.ts](src/token.ts) (`AGENT_TOKEN_FILE` fallback)                                                                                    |
| Add a new monitor type  | [src/jobs/](src/jobs) — one file per job kind (`system.ts` serves `agent` tiles: the agent's own machine from `/proc` and `statfs`); dispatch it in [src/index.ts](src/index.ts) `executeJob` and add a push method in [src/client/api-client.ts](src/client/api-client.ts) |
| Website API client      | [src/client/api-client.ts](src/client/api-client.ts) — bearer token + `X-Agent-Id` headers; `parseJobs` skips job kinds this agent does not know, so new kinds are safe to roll out                                                                                         |
| Polling and job running | [src/client/pull-loop.ts](src/client/pull-loop.ts) (fetches the job list every `AGENT_POLL_INTERVAL_SECONDS`, backs off 5 s → 5 min while the website is unreachable, exits `78` on `401`) and [src/scheduler.ts](src/scheduler.ts) (runs each job on its interval)         |
| Graceful shutdown       | [src/main.ts](src/main.ts) — `SIGINT`/`SIGTERM` abort the pull loop                                                                                                                                                                                                         |

## CONVENTIONS

- **One job file per job kind** (`host.ts`, `website.ts`, `container.ts`, `github.ts`, `system.ts`), each exporting a function that takes the job tile from `@mon/contracts` and returns the ping DTO(s) for it.
- **Job functions return a DTO with `error: null` or an error string** — they don't throw for expected failures. `executeJob` pushes the DTO either way and catches anything else, so one failing job never stops the loop.
- **Every run pushes a result**, success or failure. No "only push on change" optimization; the website deduplicates on `ping_id`.
- **The job's `id` is the tile key.** DTOs carry it as `key`, plus `ping_id`, `agent_id` and `recorded_at`.
- **Inject dependencies for tests** (`deps` arguments such as `execa`, `fetch`, readers) rather than mocking modules.
- **The website decides what to run and how often** (the job list and each job's `interval_seconds`; `cron` is still sent for older agents but not read). Don't add agent-side config.

## ANTI-PATTERNS

- **Do not import `@mon/config`, `@mon/db` or anything from `apps/website/*`.** The agent only talks to the website over HTTP, using the shapes in `@mon/contracts`.
- **Do not throw out of `executeJob` or the pull loop** for expected failures; log and carry on. Only the `401` path exits.
- **Do not add required fields to job tiles or DTOs without a fallback** — agents and websites are upgraded independently.

## NOTES

- **Build target**: `bunx esbuild src/main.ts --bundle --platform=node --outfile=dist/agent.cjs`. Workspace `@mon/*` deps are inlined.
- **The image** (`apps/agent/Dockerfile`) is `oven/bun:1-alpine` with `curl`, `docker` (CLI, for container tiles via the mounted socket) and `iputils-ping`.
- **`host.ts` exit codes** `2` (unreachable) and `68` (timeout) are macOS-specific `ping` semantics; Linux `ping` (the image's `iputils-ping`) differs — verify on the deploy target before relying on these.
- **Jobs import `../env`** (a relative parent import). The agent has no eslint and no `@/` alias, so this is the accepted pattern here.
- **No `tsconfig.json` of its own** — picks up root config; root `tsc --noEmit` covers it.
