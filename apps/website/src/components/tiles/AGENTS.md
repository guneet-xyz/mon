# apps/website/src/components/tiles

One file per tile variant from the Zod discriminated union in `@mon/config/schema`. `index.tsx` is the `type`-dispatch entry that also owns the CSS-grid `<Container>`.

## CONVENTIONS

- **File name = tile type** (`host.tsx`, `website.tsx`, `container.tsx`, `github.tsx`, `group.tsx`, `empty.tsx`, `hidden.tsx`, `logo.tsx`, `theme.tsx`). Underscore-prefixed `_base.tsx` is the **shared visual primitive**, not "private/draft".
- **Monitor tile contract**: every monitor tile (host/website/container/github) is a `"use client"` component accepting `{ dbKey: string; r_span: number; c_span: number }`. It calls `useQuery({ queryKey: ["monitor-config", "<type>", dbKey], queryFn: () => getMonitorTileInfo("<type>", dbKey) })`, renders `<LoadingTile>` while unfetched, then renders `<MonitorDialog>` wrapping a `<BaseTile>`.
- **Non-monitor tiles** (empty/hidden/logo/theme) don't fetch and don't open dialogs.
- **`group.tsx`** has two states. `<GroupTile>` (collapsed) and `<ExpandedGroupTile>` both read `getGroupTileInfo(dbKey)` under `["group-config", dbKey]`. Expansion is state in `TileGrid` (`useExpandedGroups`: per-group choices in `localStorage`, falling back to each group's `initial_state`); `generateTiles()` gives an expanded group its expanded span and a `subgrid`, and `index.tsx` renders the subgrid's members with the normal `<Tile>` dispatch. Expansion is in place: while any group is expanded, `generateTiles()` anchors every tile to its cell on the collapsed board (groups grow from it, other tiles keep it unless covered). Tiles are keyed by `tileId()` and nested tiles get `data-flip-id`s that extend their parent's, so `useFlipAnimation` (`lib/client/hooks/flip.ts`) can animate every level relative to its parent; don't key tiles by index. Group status rolls up nested groups in `getGroupTileInfo` via `groupStatus()` (`lib/server/monitors/status.ts`); group sizing, nesting and in-place subgrid layout are `layoutGroup()` in `lib/client/tile-generation.ts`.
- **`dbKey` is the tile's configured `key`.** Agents store every ping under the tile key, so the same value identifies the tile in config and its rows in the DB.
- **`getMonitorTileInfo` returns a `PublicTile`** (no `github_token`, `agent`, `interval_seconds`, `docker_socket`). Render only from that.
- **Adding a new tile type** = 5 edits:
  1. add variant in [packages/config/schema.ts](file:///Users/guneet/projects/mon/packages/config/schema.ts) discriminated union,
  2. add DB table in [packages/db/schema.ts](file:///Users/guneet/projects/mon/packages/db/schema.ts) via `createTable("…")`,
  3. add agent job in `apps/agent/src/jobs/`,
  4. add `<NewTile>` here + register in [index.tsx](file:///Users/guneet/projects/mon/apps/website/src/components/tiles/index.tsx),
  5. add branch in [lib/server/monitors/index.ts](file:///Users/guneet/projects/mon/apps/website/src/lib/server/monitors/index.ts) (getStatus/getIncidentPings/getPings).
- **Title fitting lives in `<BaseTile>`**: pass the full name as `title` and `short_name` as `short_title`. BaseTile measures the name against the tile (ResizeObserver), scales it down to `MIN_TITLE_SCALE` if needed, and otherwise shows `short_title`, then `icon`, then the initial (`lib/client/tile-title.ts`). Don't pre-shorten titles by span in the tile components.
- **Orientation rule**: `c_span === 1 && r_span > 1` → `"vertical"` (rotates title 90°). Encoded once in each monitor tile.

## ANTI-PATTERNS

- **Do not bypass `<BaseTile>`** for monitor visuals. The emerald palette, status dot positioning, top-text, and status-line are all centralized there; reimplementing them drifts the look.
- **Do not query the DB directly.** Always go through `getMonitorTileInfo` (or another server action under `lib/server/actions/`).
- **Do not key TanStack queries differently** — `["monitor-config", type, dbKey]` is reused for invalidation elsewhere.
- **Do not pass `tile.location` into `<BaseTile>`** — `_base` only takes `r_span`/`c_span`. The `<Container>` in `index.tsx` owns grid placement.

## NOTES

- **`github.tsx` has a leftover `console.log("statusLine", statusLine)`** at line ~66 — remove on touch.
- **Throwing inside the type-dispatch** (`throw new Error("How did we get here?")`) is intentional — it preserves exhaustiveness when a new union variant is added without updating this file. Keep it.
