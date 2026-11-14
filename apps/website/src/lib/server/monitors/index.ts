import dayjs from "dayjs"

import type { MonitorTile } from "@mon/config/schema"

import { getContainerStatus } from "./container"
import { getGithubStatus } from "./github"
import {
  getIncidentPings,
  getReportTimestamps,
  type HistoryRange,
} from "./history"
import { getHostStatus } from "./host"
import { reportGaps } from "./status"
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
