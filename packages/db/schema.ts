import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTableCreator,
  primaryKey,
  real,
  serial,
  smallint,
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
    // Recorded by agents from v0.8.0; null for older pings and agents.
    statusCode: smallint("status_code"),
    redirectLocation: varchar("redirect_location", { length: 512 }),
    certExpiresAt: timestamp("cert_expires_at", {
      mode: "date",
      withTimezone: true,
    }),
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
    // Recorded by agents from v0.8.0; null for older pings and agents.
    state: varchar("state", { length: 16 }),
    health: varchar("health", { length: 16 }),
    restartCount: integer("restart_count"),
    startedAt: timestamp("started_at", { mode: "date", withTimezone: true }),
    exitCode: integer("exit_code"),
    oomKilled: boolean("oom_killed"),
    image: varchar("image", { length: 256 }),
    imageVersion: varchar("image_version", { length: 64 }),
    cpuPercent: real("cpu_percent"),
    memoryBytes: bigint("memory_bytes", { mode: "number" }),
    memoryLimitBytes: bigint("memory_limit_bytes", { mode: "number" }),
  },
  (t) => [index("containers_key_idx").on(t.key)],
)

export type SystemDisk = { name: string; usedBytes: number; totalBytes: number }

// What an agent reports about the machine it runs on.
export const systemPings = createTable(
  "system_ping",
  {
    pingId: uuid("ping_id").primaryKey().defaultRandom(),
    agentId: text("agent_id"),
    key: varchar("key", { length: 64 }).notNull(),
    timestamp: timestamp("timestamp", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    error: varchar("error", { length: 256 }),
    cpuPercent: real("cpu_percent"),
    memoryBytes: bigint("memory_bytes", { mode: "number" }),
    memoryTotalBytes: bigint("memory_total_bytes", { mode: "number" }),
    uptimeSeconds: integer("uptime_seconds"),
    disks: jsonb("disks").$type<SystemDisk[]>(),
  },
  (t) => [index("system_pings_key_idx").on(t.key)],
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

// What the website last told people about each monitor, so a restart (or a
// second website instance) doesn't alert again. `revision` is bumped on
// every write; writers only update the revision they read.
export const notificationState = createTable(
  "notification_state",
  {
    type: varchar("type", { length: 16 }).notNull(),
    key: varchar("key", { length: 64 }).notNull(),
    // "online" or "offline"; null until the monitor has had a known status.
    notifiedStatus: varchar("notified_status", { length: 16 }),
    observedStatus: varchar("observed_status", { length: 16 }).notNull(),
    observedSince: timestamp("observed_since", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
    revision: integer("revision").notNull().default(0),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.type, t.key] })],
)

export type DbSelectNotificationState = typeof notificationState.$inferSelect
