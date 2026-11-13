import type { MonitorTile } from "@mon/config/schema"
import { sql } from "@mon/db/drizzle"
import {
  containerPings,
  githubPings,
  hostPings,
  websitePings,
} from "@mon/db/schema"

import { db } from "@/lib/server/db"

const HOUR_MS = 60 * 60 * 1000

// Each range is downsampled to roughly 300 points.
export const HISTORY_RANGES = {
  "24h": { ms: 24 * HOUR_MS, bucket: "5 minutes" },
  "7d": { ms: 7 * 24 * HOUR_MS, bucket: "30 minutes" },
  "30d": { ms: 30 * 24 * HOUR_MS, bucket: "2 hours" },
} as const

export type HistoryRange = keyof typeof HISTORY_RANGES

export function isHistoryRange(value: unknown): value is HistoryRange {
  return typeof value === "string" && value in HISTORY_RANGES
}

const TABLES = {
  host: hostPings,
  website: websitePings,
  container: containerPings,
  github: githubPings,
}

// Raw SQL parameters must be strings for postgres-js; cast them back.
const since = (range: HistoryRange, now: Date) =>
  sql`${new Date(now.getTime() - HISTORY_RANGES[range].ms).toISOString()}::timestamptz`

export type SeriesPoint = {
  timestamp: Date
  latency: number | null
  cpu: number | null
  memory: number | null
  memoryLimit: number | null
}

// Bucketed averages for charts. Hosts and websites chart latency; containers
// chart CPU % and memory. GitHub monitors have no series.
export async function getSeries(
  type: MonitorTile["type"],
  key: string,
  range: HistoryRange,
  now = new Date(),
): Promise<SeriesPoint[] | null> {
  const bucket = HISTORY_RANGES[range].bucket
  const from = since(range, now)
  const binned = (timestamp: unknown) =>
    sql`date_bin(${bucket}::interval, ${timestamp}, timestamp with time zone '2000-01-01')`

  if (type === "host" || type === "website") {
    const t = type === "host" ? hostPings : websitePings
    const rows = await db.execute<{ bucket: Date; latency: number | null }>(sql`
      select ${binned(t.timestamp)} as bucket, avg(${t.latency})::float8 as latency
      from ${t}
      where ${t.key} = ${key} and ${t.timestamp} >= ${from}
      group by 1 order by 1`)
    return rows.map((row) => ({
      timestamp: new Date(row.bucket),
      latency: row.latency,
      cpu: null,
      memory: null,
      memoryLimit: null,
    }))
  }

  if (type === "container") {
    const t = containerPings
    const rows = await db.execute<{
      bucket: Date
      cpu: number | null
      memory: number | null
      memory_limit: number | null
    }>(sql`
      select ${binned(t.timestamp)} as bucket,
        avg(${t.cpuPercent})::float8 as cpu,
        avg(${t.memoryBytes})::float8 as memory,
        max(${t.memoryLimitBytes})::float8 as memory_limit
      from ${t}
      where ${t.key} = ${key} and ${t.timestamp} >= ${from}
      group by 1 order by 1`)
    return rows.map((row) => ({
      timestamp: new Date(row.bucket),
      latency: null,
      cpu: row.cpu,
      memory: row.memory,
      memoryLimit: row.memory_limit,
    }))
  }

  return null
}

export type Uptime = Record<HistoryRange, number | null>

// Share of checks that succeeded in each range, or null without checks.
export async function getUptime(
  type: MonitorTile["type"],
  key: string,
  now = new Date(),
): Promise<Uptime> {
  const t = TABLES[type]
  const result = await db.execute<{
    total_24h: number
    up_24h: number
    total_7d: number
    up_7d: number
    total_30d: number
    up_30d: number
  }>(sql`
    select
      count(*) filter (where ${t.timestamp} >= ${since("24h", now)})::int as total_24h,
      count(*) filter (where ${t.timestamp} >= ${since("24h", now)} and ${t.error} is null)::int as up_24h,
      count(*) filter (where ${t.timestamp} >= ${since("7d", now)})::int as total_7d,
      count(*) filter (where ${t.timestamp} >= ${since("7d", now)} and ${t.error} is null)::int as up_7d,
      count(*)::int as total_30d,
      count(*) filter (where ${t.error} is null)::int as up_30d
    from ${t}
    where ${t.key} = ${key} and ${t.timestamp} >= ${since("30d", now)}`)
  const totals = result[0]
  const ratio = (up: number | undefined, total: number | undefined) =>
    total ? (up ?? 0) / total : null
  return {
    "24h": ratio(totals?.up_24h, totals?.total_24h),
    "7d": ratio(totals?.up_7d, totals?.total_7d),
    "30d": ratio(totals?.up_30d, totals?.total_30d),
  }
}

export async function getIncidentPings(
  type: MonitorTile["type"],
  key: string,
  range: HistoryRange,
  now = new Date(),
): Promise<Array<{ timestamp: Date; error: string }>> {
  const t = TABLES[type]
  const rows = await db.execute<{ timestamp: Date; error: string }>(sql`
    select ${t.timestamp} as timestamp, ${t.error} as error
    from ${t}
    where ${t.key} = ${key} and ${t.error} is not null and ${t.timestamp} >= ${since(range, now)}
    order by ${t.timestamp}`)
  return rows.map((row) => ({
    timestamp: new Date(row.timestamp),
    error: row.error,
  }))
}
