# apps/website

Next.js 14 App Router status board. Reads the same TOML config the agent polls from, queries ping data from Postgres via server actions, and renders a responsive grid of tiles client-side.

## STRUCTURE

```
src/
├── app/
│   ├── page.tsx                # entry: getConfig() → <ClientOnly><TileGrid/></ClientOnly>
│   ├── tile-grid.tsx           # client component; runs generateTiles() against window dims
│   └── _components/providers/  # ThemeProvider + react-query QueryClientProvider
├── components/
│   ├── tiles/                  # one file per tile type (see tiles/AGENTS.md)
│   ├── dialogs/                # modals opened from tiles (incidents, latency chart)
│   ├── ui/                     # shadcn/ui primitives (style: new-york)
│   └── *.tsx                   # shared atoms (status-dot, dynamic-icon, client-only)
└── lib/
    ├── client/                 # browser-only: tile-generation, useWindowDimensions
    └── server/
        ├── actions/            # "use server" RPC entry points
        └── monitors/           # per-type DB query helpers (host/website/container/github)
```

## WHERE TO LOOK

| Task                      | Location                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a new tile UI         | [components/tiles/](file:///Users/guneet/projects/mon/apps/website/src/components/tiles) + register in [tiles/index.tsx](file:///Users/guneet/projects/mon/apps/website/src/components/tiles/index.tsx) |
| Add a server action       | [src/lib/server/actions/](file:///Users/guneet/projects/mon/apps/website/src/lib/server/actions) — file-per-action, top-level `"use server"`                                                            |
| DB read helpers           | [src/lib/server/monitors/](file:///Users/guneet/projects/mon/apps/website/src/lib/server/monitors) — `index.ts` is the type-dispatcher facade                                                           |
| Grid placement algorithm  | [src/lib/client/tile-generation.ts](file:///Users/guneet/projects/mon/apps/website/src/lib/client/tile-generation.ts)                                                                                   |
| Theme tokens / global CSS | [src/styles/globals.css](file:///Users/guneet/projects/mon/apps/website/src/styles/globals.css) (Tailwind v4 `@theme`)                                                                                  |

## CONVENTIONS

- **Path alias `@/*` → `src/*`** (defined in repo-root [tsconfig.json](file:///Users/guneet/projects/mon/tsconfig.json#L29-L31)). Never use `../../`.
- **`force-dynamic` on `app/page.tsx`** — config + DB are read every request; do not add ISR/static caching at the page level.
- **Server actions** are co-located in `lib/server/actions/`, named `get-*.ts` / `<verb>-*.ts`, one exported function per file. They're imported directly by client components, which triggers Next's RSC action plumbing.
- **Type-dispatch facades** in `lib/server/monitors/index.ts` and `components/tiles/index.tsx` use `if (type === "x")` chains over the Zod discriminated union — exhaustiveness is enforced by the trailing `throw new Error(...)`. **Always add a new branch** when extending the tile union.
- **shadcn `ui/` is generated code** — match existing variants (cva, `className` last in props) and rerun `npx shadcn` rather than hand-editing.
- **Icons**: `lucide-react` for fixed UI chrome, `@iconify/react` (via `DynamicIcon`) for user-configurable tile icons.
- **Data fetching in client components: TanStack Query** with `queryKey: ["monitor-config", type, dbKey]`. Server actions are the `queryFn`.

## ANTI-PATTERNS

- **No relative parent imports** (eslint warn — see [.eslintrc.cjs](file:///Users/guneet/projects/mon/apps/website/.eslintrc.cjs#L50-L55)). Use `@/*`.
- **Do not call DB from client components.** Always go through a `lib/server/actions/*` server action.
- **Do not `useState`/`useEffect` for `window.innerWidth`** — use the shared [useWindowDimensions](file:///Users/guneet/projects/mon/apps/website/src/lib/client/hooks/dimensions.ts) hook; tile generation depends on consistent rounding.
- **Do not wrap the whole page in `<ClientOnly>` to fix hydration** — only `TileGrid` needs it because layout depends on window size. Tiles themselves are SSR-friendly.
- **Drizzle `update`/`delete` without `.where(...)`** is a build error (drizzle eslint plugin).

## NOTES

- **Next 14, not 15.** `apps/docs` is on 15 — versions are intentionally split. Don't bump this one without checking nextra-incompatible features.
- **`output: "standalone"`** with `outputFileTracingRoot` set to the monorepo root — required for Docker to bundle workspace deps. Do not remove.
- **Stray `console.log`** in [tile-generation.ts](file:///Users/guneet/projects/mon/apps/website/src/lib/client/tile-generation.ts) and [tiles/github.tsx](file:///Users/guneet/projects/mon/apps/website/src/components/tiles/github.tsx) — leftover debug, safe to remove if you're already touching the file.
- **README.md is the unmodified create-t3-app template** and does not describe this app. Ignore it.
