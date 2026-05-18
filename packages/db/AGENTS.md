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
- **Do not run `drizzle-kit push` against production** without reviewing the diff — the project has no migration files committed, so `push` is the entire workflow.

## COMMANDS

```bash
# from packages/db/
bunx drizzle-kit push          # apply schema.ts to env.DATABASE_URL
bunx drizzle-kit studio        # browse data
bunx drizzle-kit generate      # if you switch to migration-file workflow
```
