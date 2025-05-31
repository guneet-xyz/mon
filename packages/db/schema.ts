import {
  index,
  pgTableCreator,
  real,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"

export const createTable = pgTableCreator((name) => `mon_${name}`)

export const hostPings = createTable(
  "host_ping",
  {
    key: varchar("key", { length: 64 }).notNull(),
    timestamp: timestamp("timestamp", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    latency: real("latency"),
    error: varchar("error", { length: 256 }),
  },
  (t) => [index("hosts_key_idx").on(t.key)],
)

export const websitePings = createTable(
  "website_ping",
  {
    key: varchar("key", { length: 64 }).notNull(),
    timestamp: timestamp("timestamp", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    latency: real("latency"),
    error: varchar("error", { length: 256 }),
  },
  (t) => [index("websites_key_idx").on(t.key)],
)
