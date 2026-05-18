# packages/config

The **single source of truth** for tile shape. Loads `/etc/mon/config.toml` (path from `env.CONFIG_PATH`), parses with `smol-toml`, validates with Zod, returns typed config. Consumed by both agent and website.

## CONVENTIONS

- **`schema.ts` defines a Zod discriminated union on `type`** — every consumer dispatches on this field. Adding a tile variant means extending the `z.discriminatedUnion("type", [...])` array.
- **`MonitorSchema` vs bare `TileSchema`**: monitor tiles (host/website/container/github) require `key` + optional display fields; layout-only tiles (empty/hidden/logo/theme) do not have `key`. The `MonitorTile` / `NonMonitorTile` extract types are exported for downstream switches.
- **Defaults belong in the schema** (`.default(...)`), not in callers. `OptionsSchema` wraps an inner `_OptionsSchema.default(_OptionsSchema.parse({}))` so the whole `options` block is optional in TOML.
- **`getConfig()` auto-creates** the config dir + empty file if missing. This is intentional — first-run UX. Don't add a "file not found" error path.
- **`getMonitorConfig<T>(type, key)`** uses an `as Extract<...>` cast on the `.find()` return — this is the **only** sanctioned cast in the package because TS can't narrow `.find` against discriminated unions. Don't replicate the pattern elsewhere.
- **`package.json` `"main": "src/index.ts"`** — but source is at the package root (`./index.ts`), not `./src/`. The `"main"` value is stale-but-harmless because Bun/Next resolve workspace TS directly. Don't add a `src/` folder to "match" it; fix the `"main"` instead if you touch the manifest.
- **Uses `zod/v4` import path** — schema.ts pins the v4 subpath explicitly. Other workspaces import from `"zod"` (v3-compatible API surface). Both work; don't mix in one file.

## ANTI-PATTERNS

- **Do not read `env.CONFIG_PATH` and `parse()` directly** in app code — call `getConfig()` so defaults, auto-create, and validation all run.
- **Do not put runtime logic, fetchers, or side effects here.** This package is pure schema + a thin file loader.
- **Do not depend on `@mon/db`** — the agent and website wire config↔DB themselves; keeping config DB-free lets the docs site and scripts import it cheaply.
