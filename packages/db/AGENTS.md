# packages/db

Drizzle ORM schema + a singleton `postgres-js` client. All app DB access goes through `import { db } from "@mon/db"` and table imports from `"@mon/db/schema"`.

## CONVENTIONS

- **Every table must use `createTable("name", ...)`** — it prefixes with `mon_` so the DB can be shared with other tenants. Never call `pgTable` directly.
- **Timestamps**: always `timestamp("…", { mode: "date", withTimezone: true })`. Don't use bare `timestamp()` (drifts on tz).
- **Indexes are defined inline** as the third arg `(t) => [index("…").on(t.col)]`. Convention: `<plural-table>_<col>_idx`.
- **Enums** use `pgEnum("name", [...] as const)` — define above the table that uses them. See `ghCheckRunStatusEnum` / `ghCheckRunConclusionEnum`.
- **Drizzle re-exports**: import operators (`eq`, `and`, `desc`, …) from **`@mon/db/drizzle`**, not from `drizzle-orm`. Keeps consumer imports stable if we ever swap ORMs.
- **Inferred row types** (`typeof <table>.$inferInsert`, `$inferSelect`) are exported as `DbInsert<Table>` / `DbSelect<Table>` — only do this for tables consumers actually need to round-trip (currently `githubCheckRun`).
- **The `db` export is a `globalThis`-cached connection** ([index.ts](file:///Users/guneet/projects/mon/packages/db/index.ts#L8-L15)) — survives Next dev HMR. Don't replace with a per-import `postgres(...)`.
- **`package.json` `"main": "src/index.ts"`** but source is at package root. See note in `packages/config/AGENTS.md`; same story.

## ANTI-PATTERNS

- **`db.delete(table)` / `db.update(table)` without `.where(...)`** is a hard eslint error (`drizzle/enforce-delete-with-where`, `…-update-with-where`). Use `db.delete(table).where(sql\`true\`)` only in migrations, never in app code.
- **Do not import `drizzle-orm/postgres-js` in apps directly** — go through this package so the connection is singleton.
- **Do not hardcode connection strings.** `env.DATABASE_URL` is the only sanctioned source.
- **Schema changes ship as committed migrations.** Edit `schema.ts`, run `bunx drizzle-kit generate --name <change>` (any `DATABASE_URL` works; it is not contacted), and commit the SQL and `meta/` snapshot. The migrator image applies them on every deployment. Keep them additive (nullable columns) so older agents and websites keep working. Never `drizzle-kit push` against a deployed database.

## COMMANDS

```bash
# from packages/db/
bunx drizzle-kit generate --name <change>  # write a migration from schema.ts changes
bunx drizzle-kit push          # apply schema.ts to a throwaway env.DATABASE_URL (tests do this)
bunx drizzle-kit studio        # browse data
```
