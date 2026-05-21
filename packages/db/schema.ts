import { sql } from "drizzle-orm"
import {
  bigint,
  check,
  index,
  pgEnum,
  pgTableCreator,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

export const createTable = pgTableCreator((name) => `mon_${name}`)

export const hostPings = createTable(
  "host_ping",
  {
    pingId: uuid("ping_id").primaryKey().defaultRandom(),
    agentId: text("agent_id"),
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
    pingId: uuid("ping_id").primaryKey().defaultRandom(),
    agentId: text("agent_id"),
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

export const containerPings = createTable(
  "container_ping",
  {
    pingId: uuid("ping_id").primaryKey().defaultRandom(),
    agentId: text("agent_id"),
    key: varchar("key", { length: 64 }).notNull(),
    timestamp: timestamp("timestamp", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    error: varchar("error", { length: 256 }),
  },
  (t) => [index("containers_key_idx").on(t.key)],
)

export const ghCheckRunStatusEnum = pgEnum("gh_check_run_status", [
  "queued",
  "in_progress",
  "completed",
  "waiting",
  "requested",
  "pending",
])

export const ghCheckRunConclusionEnum = pgEnum("gh_check_run_conclusion", [
  "success",
  "failure",
  "neutral",
  "cancelled",
  "skipped",
  "timed_out",
  "action_required",
])

export const githubCheckRun = createTable(
  "github_check_run",
  {
    _id: serial("_id").primaryKey(),
    pingId: uuid("ping_id").notNull().unique().defaultRandom(),
    agentId: text("agent_id"),
    id: bigint("id", { mode: "number" }).notNull().unique(),
    name: varchar("name", { length: 256 }).notNull(),
    status: ghCheckRunStatusEnum().notNull(),
    conclusion: ghCheckRunConclusionEnum(),
    detailsUrl: text("details_url"),
    startedAt: timestamp("started_at", {
      mode: "date",
      withTimezone: true,
    }),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }),
  },
  (t) => [uniqueIndex("github_check_run_id_unique").on(t.id)],
)

export type DbInsertGithubCheckRun = typeof githubCheckRun.$inferInsert
export type DbSelectGithubCheckRun = typeof githubCheckRun.$inferSelect

export const githubPings = createTable(
  "github_ping",
  {
    pingId: uuid("ping_id").primaryKey().defaultRandom(),
    agentId: text("agent_id"),
    key: varchar("key", { length: 64 }).notNull(),
    timestamp: timestamp("timestamp", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    commitHash: varchar("commit_hash", { length: 40 }),
    checkRunId: bigint("check_run_id", { mode: "number" }).references(
      () => githubCheckRun.id,
    ),
    error: varchar("error", { length: 256 }),
  },
  (t) => [
    index("github_ping_key_idx").on(t.key),
    index("github_ping_commit_hash_idx").on(t.commitHash),
    check(
      "github_ping_valid",
      sql`(${t.commitHash} IS NOT NULL AND ${t.checkRunId} IS NOT NULL) OR (${t.error} IS NOT NULL)`,
    ),
  ],
)

export type DbInsertGithubPing = typeof githubPings.$inferInsert
export type DbSelectGithubPing = typeof githubPings.$inferSelect
