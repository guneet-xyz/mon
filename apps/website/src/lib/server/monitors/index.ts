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

import { getContainerStatus } from "./container"
import { getGithubStatus } from "./github"
import {
  getIncidentPings,
  getReportTimestamps,
  type HistoryRange,
} from "./history"
import { getHostStatus } from "./host"
import {
  agentStatusFromLatestReport,
  groupFailures,
  reportGaps,
  staleAfterMs,
  statusFromLatestPing,
  type MonitorStatus,
} from "./status"
import { getAgentStatus } from "./system"
import { getWebsiteStatus } from "./website"

export type IncidentPing = {
  timestamp: Date
  error: string
}

export type Incident = {
  start: Date
  end: Date
  error: string
}

export async function getIncidents(
  type: MonitorTile["type"],
  dbKey: string,
  range: HistoryRange = "24h",
  intervalSeconds = 60,
): Promise<Array<Incident>> {
  const incidents: Array<Incident> = groupFailures(
    await getIncidentPings(type, dbKey, range),
    intervalSeconds,
  )

  // A silent agent records nothing, so its incidents are the gaps between
  // its reports.
  if (type === "agent") {
    incidents.push(
      ...reportGaps(
        await getReportTimestamps(dbKey, range),
        new Date(),
        staleAfterMs(intervalSeconds),
      ),
    )
  }

  incidents.sort((a, b) => b.start.getTime() - a.start.getTime())

  return incidents
}

export async function getStatus(
  type: MonitorTile["type"],
  dbKey: string,
  intervalSeconds?: number,
): Promise<"online" | "offline" | "unknown"> {
  if (type === "host") return await getHostStatus(dbKey, intervalSeconds)
  if (type === "website") return await getWebsiteStatus(dbKey, intervalSeconds)
  if (type === "container")
    return await getContainerStatus(dbKey, intervalSeconds)
  if (type === "github") return await getGithubStatus(dbKey, intervalSeconds)
  if (type === "agent") return await getAgentStatus(dbKey, intervalSeconds)

  throw new Error("Unsupported type for getStatus function")
}

export type LatestCheck = { timestamp: Date; error: string | null }

// The monitor's most recent check (an agent's most recent report).
export async function getLatestCheck(
  type: MonitorTile["type"],
  dbKey: string,
): Promise<LatestCheck | null> {
  const t = {
    host: hostPings,
    website: websitePings,
    container: containerPings,
    github: githubPings,
    agent: systemPings,
  }[type]
  const [row] = await db.execute<LatestCheck>(sql`
    select ${t.timestamp} as timestamp, ${t.error} as error from ${t}
    where ${t.key} = ${dbKey}
    order by ${t.timestamp} desc limit 1`)
  return row ? { timestamp: new Date(row.timestamp), error: row.error } : null
}

export function statusFromCheck(
  type: MonitorTile["type"],
  check: LatestCheck | null,
  intervalSeconds?: number,
  now: Date = new Date(),
): MonitorStatus {
  const staleAfter = staleAfterMs(intervalSeconds)
  return type === "agent"
    ? agentStatusFromLatestReport(check ?? undefined, now, staleAfter)
    : statusFromLatestPing(check ?? undefined, now, staleAfter)
}

// Whether the latest check is too old to count.
export function isStale(
  check: LatestCheck | null,
  intervalSeconds?: number,
  now: Date = new Date(),
): boolean {
  return (
    check !== null &&
    now.getTime() - check.timestamp.getTime() > staleAfterMs(intervalSeconds)
  )
}
