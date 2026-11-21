import dayjs from "dayjs"

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
  reportGaps,
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
): Promise<Array<Incident>> {
  const pings = await getIncidentPings(type, dbKey, range)

  const incidents: Array<Incident> = []
  let current: Incident | null = null

  for (const ping of pings) {
    if (
      !current ||
      !(
        ping.error === current.error &&
        dayjs(ping.timestamp).diff(dayjs(current.end), "minute") <= 1
      )
    ) {
      current = {
        start: ping.timestamp,
        end: dayjs(ping.timestamp).add(1, "minute").toDate(),
        error: ping.error,
      }
      incidents.push(current)
    } else {
      current.end = dayjs(ping.timestamp).add(1, "minute").toDate()
    }
  }

  // A silent agent records nothing, so its incidents are the gaps between
  // its reports.
  if (type === "agent") {
    incidents.push(...reportGaps(await getReportTimestamps(dbKey, range)))
  }

  incidents.sort((a, b) => b.start.getTime() - a.start.getTime())

  return incidents
}

export async function getStatus(
  type: MonitorTile["type"],
  dbKey: string,
): Promise<"online" | "offline" | "unknown"> {
  if (type === "host") return await getHostStatus(dbKey)
  if (type === "website") return await getWebsiteStatus(dbKey)
  if (type === "container") return await getContainerStatus(dbKey)
  if (type === "github") return await getGithubStatus(dbKey)
  if (type === "agent") return await getAgentStatus(dbKey)

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
  now: Date = new Date(),
): MonitorStatus {
  return type === "agent"
    ? agentStatusFromLatestReport(check ?? undefined, now)
    : statusFromLatestPing(check ?? undefined, now)
}
