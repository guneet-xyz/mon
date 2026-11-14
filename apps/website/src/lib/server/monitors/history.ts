import type { MonitorTile } from "@mon/config/schema"
import { sql } from "@mon/db/drizzle"
import {
  containerPings,
  githubPings,
  hostPings,
  systemPings,
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
  agent: systemPings,
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
  // Agents: percent used per disk name.
  disks: Record<string, number> | null
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
      disks: null,
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
      disks: null,
    }))
  }

  if (type === "agent") {
    const t = systemPings
    const [rows, diskRows] = await Promise.all([
      db.execute<{
        bucket: Date
        cpu: number | null
        memory: number | null
        memory_limit: number | null
      }>(sql`
        select ${binned(t.timestamp)} as bucket,
          avg(${t.cpuPercent})::float8 as cpu,
          avg(${t.memoryBytes})::float8 as memory,
          max(${t.memoryTotalBytes})::float8 as memory_limit
        from ${t}
        where ${t.key} = ${key} and ${t.timestamp} >= ${from}
        group by 1 order by 1`),
      db.execute<{ bucket: Date; name: string; percent: number | null }>(sql`
        select ${binned(t.timestamp)} as bucket, disk->>'name' as name,
          avg((disk->>'usedBytes')::float8 / nullif((disk->>'totalBytes')::float8, 0) * 100)::float8 as percent
        from ${t} cross join lateral jsonb_array_elements(${t.disks}) as disk
        where ${t.key} = ${key} and ${t.timestamp} >= ${from}
        group by 1, 2 order by 1, 2`),
    ])
    const disks = new Map<number, Record<string, number>>()
    for (const row of diskRows) {
      if (row.percent === null) continue
      const at = new Date(row.bucket).getTime()
      disks.set(at, { ...disks.get(at), [row.name]: row.percent })
    }
    return rows.map((row) => {
      const timestamp = new Date(row.bucket)
      return {
        timestamp,
        latency: null,
        cpu: row.cpu,
        memory: row.memory,
        memoryLimit: row.memory_limit,
        disks: disks.get(timestamp.getTime()) ?? null,
      }
    })
  }

  return null
}

// When an agent reported, for finding the gaps between its reports.
export async function getReportTimestamps(
  key: string,
  range: HistoryRange,
  now = new Date(),
): Promise<Date[]> {
  const t = systemPings
  const rows = await db.execute<{ timestamp: Date }>(sql`
    select ${t.timestamp} as timestamp from ${t}
    where ${t.key} = ${key} and ${t.timestamp} >= ${since(range, now)}
    order by ${t.timestamp}`)
  return rows.map((row) => new Date(row.timestamp))
}

const COVERAGE_BUCKET_MS = 5 * 60_000

// An agent's uptime: the share of completed 5-minute intervals with a
// successful report, since its first report in the range (a dead machine
// records nothing, so counting its reports alone would always say 100%).
async function getAgentUptime(key: string, now: Date): Promise<Uptime> {
  const t = systemPings
  // The interval in progress has not had its chance to report yet.
  const current = now.getTime() - (now.getTime() % COVERAGE_BUCKET_MS)
  const cutoff = sql`${new Date(current).toISOString()}::timestamptz`
  const ranges = Object.keys(HISTORY_RANGES) as HistoryRange[]
  const result: Partial<Uptime> = {}
  for (const range of ranges) {
    const [row] = await db.execute<{
      seen: number
      seen_now: boolean
      first: Date | null
    }>(sql`
      select
        count(distinct date_bin('5 minutes'::interval, ${t.timestamp}, timestamp with time zone '2000-01-01'))
          filter (where ${t.error} is null and ${t.timestamp} < ${cutoff})::int as seen,
        bool_or(${t.error} is null and ${t.timestamp} >= ${cutoff}) as seen_now,
        min(${t.timestamp}) as first
      from ${t}
      where ${t.key} = ${key} and ${t.timestamp} >= ${since(range, now)}`)
    if (!row?.first) {
      result[range] = null
      continue
    }
    const first = new Date(row.first).getTime()
    const start = first - (first % COVERAGE_BUCKET_MS)
    const expected = Math.floor((current - start) / COVERAGE_BUCKET_MS)
    // An agent that only started reporting in this interval.
    if (expected === 0) {
      result[range] = row.seen_now ? 1 : 0
      continue
    }
    result[range] = Math.min(1, row.seen / expected)
  }
  return result as Uptime
}

export type Uptime = Record<HistoryRange, number | null>

// Share of checks that succeeded in each range, or null without checks.
export async function getUptime(
  type: MonitorTile["type"],
  key: string,
  now = new Date(),
): Promise<Uptime> {
  if (type === "agent") return getAgentUptime(key, now)
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
