# packages/db

Drizzle ORM schema, the committed migrations (`drizzle/`) and the migrator image (`Dockerfile`, runs `drizzle-kit migrate`). Only the website uses it at runtime (agents never touch the database): `createDb(url)` from `"@mon/db"` builds a client, and tables come from `"@mon/db/schema"`. `@mon/test-utils` uses it for test databases.

## CONVENTIONS

- **Every table must use `createTable("name", ...)`** — it prefixes with `mon_` so the DB can be shared with other tenants. Never call `pgTable` directly.
- **Timestamps**: always `timestamp("…", { mode: "date", withTimezone: true })`. Don't use bare `timestamp()` (drifts on tz).
- **Indexes are defined inline** as the third arg `(t) => [index("…").on(t.col)]`. Convention: `<plural-table>_<col>_idx`.
- **Enums** use `pgEnum("name", [...] as const)` — define above the table that uses them. See `ghCheckRunStatusEnum` / `ghCheckRunConclusionEnum`.
- **Drizzle re-exports**: import operators (`eq`, `and`, `desc`, …) from **`@mon/db/drizzle`**, not from `drizzle-orm`. Keeps consumer imports stable if we ever swap ORMs.
- **Inferred row types** (`typeof <table>.$inferInsert`, `$inferSelect`) are exported as `DbInsert<Table>` / `DbSelect<Table>` — only do this for tables consumers actually need to round-trip (currently `githubCheckRun`).
- **The website's `db` is a lazy, `globalThis`-cached client** ([apps/website/src/lib/server/db.ts](../../apps/website/src/lib/server/db.ts)) built with `createDb(env.DATABASE_URL)` — survives Next dev HMR. Don't call `createDb(...)` per request or per import.
- **Source is at the package root** (`"main": "index.ts"`); don't add a `src/` folder.

## ANTI-PATTERNS

- **`db.delete(table)` / `db.update(table)` without `.where(...)`** is a hard eslint error (`drizzle/enforce-delete-with-where`, `…-update-with-where`). Use `db.delete(table).where(sql\`true\`)` only in migrations, never in app code.
- **Do not import `drizzle-orm/postgres-js` in apps directly** — go through `createDb` and the website's `lib/server/db.ts` so the connection is a singleton.
- **Do not hardcode connection strings.** `DATABASE_URL` is the only sanctioned source (`env.DATABASE_URL` in the website; `drizzle.config.ts` reads `process.env.DATABASE_URL`).
- **Schema changes ship as committed migrations.** Edit `schema.ts`, run `bunx drizzle-kit generate --name <change>` (any `DATABASE_URL` works; it is not contacted), and commit the SQL and `meta/` snapshot. The migrator image applies them on every deployment. Keep them additive (nullable columns) so older agents and websites keep working. Never `drizzle-kit push` against a deployed database.

## COMMANDS

```bash
# from packages/db/, with DATABASE_URL set
bunx drizzle-kit generate --name <change>  # write a migration from schema.ts changes
bunx drizzle-kit migrate       # apply the committed migrations (what the migrator image runs)
bunx drizzle-kit push          # apply schema.ts to a throwaway env.DATABASE_URL (tests do this)
bunx drizzle-kit studio        # browse data
```
