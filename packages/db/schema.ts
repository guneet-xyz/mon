import { index, pgTableCreator, timestamp, varchar } from "drizzle-orm/pg-core"

export const createTable = pgTableCreator((name) => `mon_${name}`)

export const hostPings = createTable(
  "host_ping",
  {
    name: varchar("name", { length: 64 }).notNull(),
    requestAt: timestamp("request_at", { mode: "date" }).notNull(),
    responseAt: timestamp("response_at", { mode: "date" }),
  },
  (t) => [index("hosts_name_idx").on(t.name)],
)
