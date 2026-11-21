# apps/website

Next.js 16 App Router status board and the agents' HTTP API. It is the only component that reads the TOML config and the only one that touches Postgres: agents fetch their jobs from `/api/agent/jobs` and push results to `/api/agent/pings/<kind>`, and the board reads them back via server actions and renders a responsive grid of tiles client-side.

## STRUCTURE

```
src/
├── env.ts                      # DATABASE_URL, CONFIG_PATH, NODE_ENV (@t3-oss/env-nextjs)
├── app/
│   ├── page.tsx                # entry: getConfig() → <ClientOnly><TileGrid/></ClientOnly>
│   ├── tile-grid.tsx           # client component; runs generateTiles() against window dims
│   ├── api/agent/              # agent API: jobs/route.ts (GET job list), pings/<kind>/route.ts (POST results)
│   └── _components/providers/  # ThemeProvider + react-query QueryClientProvider
├── components/
│   ├── tiles/                  # one file per tile type (see tiles/AGENTS.md)
│   ├── dialogs/                # modals opened from tiles (monitor dialog: summary, uptime, series charts, incidents)
│   ├── ui/                     # shadcn/ui primitives (style: new-york)
│   └── *.tsx                   # shared atoms (status-dot, dynamic-icon, client-only)
└── lib/
    ├── client/                 # browser-only: tile-generation, useWindowDimensions
    └── server/
        ├── actions/            # "use server" RPC entry points
        ├── ingest/             # insert pushed pings (deduplicated on ping_id)
        ├── monitors/           # status per type; history.ts (series, uptime, incidents per range), details.ts (latest details, warnings)
        ├── agent-auth.ts       # bearer token + X-Agent-Id check against [agents.<id>].token_hash
        ├── config-cache.ts     # config cache used by the agent API (rereads the file when it changes)
        └── db.ts               # lazy, globalThis-cached Drizzle client from env.DATABASE_URL
```

## WHERE TO LOOK

| Task                      | Location                                                                                                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a new tile UI         | [components/tiles/](src/components/tiles) + register in [tiles/index.tsx](src/components/tiles/index.tsx)                                                                                                                                                 |
| Agent API                 | [src/app/api/agent/](src/app/api/agent) — `jobs/route.ts` maps assigned config tiles to `@mon/contracts` job tiles; `pings/<kind>/route.ts` authenticates, validates the DTO, checks `agent_id` matches the token and calls `lib/server/ingest/<kind>.ts` |
| Add a server action       | [src/lib/server/actions/](src/lib/server/actions) — file-per-action, top-level `"use server"`                                                                                                                                                             |
| DB read helpers           | [src/lib/server/monitors/](src/lib/server/monitors) — `index.ts` is the type-dispatcher facade                                                                                                                                                            |
| Grid placement algorithm  | [src/lib/client/tile-generation.ts](src/lib/client/tile-generation.ts)                                                                                                                                                                                    |
| Theme tokens / global CSS | [src/styles/globals.css](src/styles/globals.css) (Tailwind v4 `@theme`)                                                                                                                                                                                   |

## CONVENTIONS

- **Path alias `@/*` → `src/*`** (defined in this app's [tsconfig.json](tsconfig.json) and the repo-root one). Never use `../../`.
- **`force-dynamic` on `app/page.tsx`** — config + DB are read every request, which is what makes config edits apply without a restart; do not add ISR/static caching at the page level.
- **Read the config through `@mon/config`** (`getConfig`, or `getCachedConfig` in the agent API). Never send a raw config or tile to the browser; use `toPublicConfig()` / `toPublicTile()`.
- **Server actions** are co-located in `lib/server/actions/`, named `get-*.ts` / `<verb>-*.ts`, one exported function per file. They're imported directly by client components, which triggers Next's RSC action plumbing.
- **Type-dispatch facades** in `lib/server/monitors/index.ts` and `components/tiles/index.tsx` use `if (type === "x")` chains over the Zod discriminated union — exhaustiveness is enforced by the trailing `throw new Error(...)`. **Always add a new branch** when extending the tile union.
- **shadcn `ui/` is generated code** — match existing variants (cva, `className` last in props) and rerun `npx shadcn` rather than hand-editing.
- **Icons**: `lucide-react` for fixed UI chrome, `@iconify/react` (via `DynamicIcon`) for user-configurable tile icons.
- **Data fetching in client components: TanStack Query** with `queryKey: ["monitor-config", type, dbKey]` (shared by a tile and its dialog). Server actions are the `queryFn`. Every query refetches every 60 s (`QueryProvider` default), so a board left open stays current.
- **Raw SQL in `lib/server/monitors/history.ts`**: postgres-js cannot take `Date` parameters inside `sql` templates; pass ISO strings cast to `timestamptz`.

## ANTI-PATTERNS

- **No relative parent imports** (eslint warn — see [eslint.config.mjs](eslint.config.mjs)). Use `@/*`.
- **Do not call DB from client components.** Always go through a `lib/server/actions/*` server action.
- **Do not `useState`/`useEffect` for `window.innerWidth`** — use the shared [useWindowDimensions](src/lib/client/hooks/dimensions.ts) hook; tile generation depends on consistent rounding.
- **Do not wrap the whole page in `<ClientOnly>` to fix hydration** — only `TileGrid` needs it because layout depends on window size. Tiles themselves are SSR-friendly.
- **Drizzle `update`/`delete` without `.where(...)`** is a build error (drizzle eslint plugin).

## NOTES

- **Next 16, same version as `apps/docs`.** Keep the two in step (`next` and `eslint-config-next`).
- **`output: "standalone"`** with `outputFileTracingRoot` set to the monorepo root — required for Docker to bundle workspace deps. Do not remove.
- **Stray `console.log`** in [tiles/github.tsx](src/components/tiles/github.tsx) — leftover debug, safe to remove if you're already touching the file.
- **README.md is the unmodified create-t3-app template** and does not describe this app. Ignore it.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
