# packages/config

The **single source of truth** for tile shape. `getConfig(path)` loads the TOML file (the website passes `env.CONFIG_PATH`, default `/etc/mon/config.toml`), parses with `smol-toml`, validates with Zod and returns typed config. Only the website (and tests) consume it: agents never see the config, they get job tiles from the website (`getAgentAssignments()` picks each agent's tiles). The user-facing reference is the docs site ([apps/docs/src/content/configuration/](../../apps/docs/src/content/configuration)); keep it in step with `schema.ts`.

## CONVENTIONS

- **`schema.ts` defines a Zod discriminated union on `type`** — every consumer dispatches on this field. Adding a tile variant means extending the `z.discriminatedUnion("type", [...])` array.
- **`MonitorSchema` vs bare `TileSchema`**: monitor tiles (host/website/container/github/agent) require `key` + optional display fields; layout-only tiles (empty/hidden/logo/theme) do not have `key`. `group` tiles have a `key`, a `members` list, an optional `expanded` size, `initial_state` and `hidden`, but are not monitors (agents never poll them). `members` accepts bare keys or `{ key, row_start?, … }` tables and is normalized to tables; members may be monitors or groups (nested groups, no cycles). `toPublicConfig()` adds each member's `type` and a `groups` map of every group (nested groups are often off the grid) so the browser can lay out and render subgrids. The `MonitorTile` / `NonMonitorTile` / `GroupTile` extract types and the `isMonitorTile` / `getMonitorTiles` helpers are exported for downstream switches.
- **Grid visibility is resolved server-side**: `isTileOnGrid()` applies a monitor's or group's `hidden` flag, falling back to `options.hide_grouped_tiles` for grouped ones. `toPublicConfig()` drops off-grid monitors, so the browser only lays out what it should draw. Off-grid monitors are still assigned to agents.
- **Member keys must resolve to exactly one monitor or group**, and groups must not contain themselves (enforced in `ConfigSchema`'s `superRefine`); tiles may otherwise share a key.
- **Defaults belong in the schema** (`.default(...)`), not in callers. `OptionsSchema` wraps an inner `_OptionsSchema.default(_OptionsSchema.parse({}))` so the whole `options` block is optional in TOML.
- **`getConfig()` auto-creates** the config dir + empty file if missing. This is intentional — first-run UX. Don't add a "file not found" error path.
- **`findMonitor<T>(config, type, key)`** (used by `getMonitorConfig`) uses an `as Extract<...>` cast on the `.find()` return — this is the **only** sanctioned cast in the package because TS can't narrow `.find` against discriminated unions. Don't replicate the pattern elsewhere.
- **Source is at the package root** (`./index.ts`, `"main": "index.ts"`); don't add a `src/` folder.
- **Uses `zod/v4` import path** — schema.ts pins the v4 subpath explicitly. Other workspaces import from `"zod"` (also v4). Both work; don't mix in one file.

## ANTI-PATTERNS

- **Do not read the file and `parse()` it directly** in app code — call `getConfig()` (or the website's `getCachedConfig()`) so defaults, auto-create, and validation all run.
- **Do not put runtime logic, fetchers, or side effects here.** This package is pure schema + a thin file loader.
- **Do not depend on `@mon/db`** — the website wires config↔DB itself; keeping config DB-free keeps it cheap to import from tests and scripts.
- **Never pass a raw `Config` or tile to the browser.** Use `toPublicConfig()` / `toPublicTile()`, which drop `agents` (token hashes) and the server-only tile fields (`github_token`, `agent`, `interval_seconds`, `docker_socket`). New secret or internal fields must be added to `SERVER_ONLY_TILE_FIELDS`.
