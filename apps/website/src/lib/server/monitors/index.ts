import type { MonitorTile } from "@mon/config/schema"

import { getContainerStatus } from "./container"
import { getGithubStatus } from "./github"
import {
  getIncidentPings,
  getReportTimestamps,
  type HistoryRange,
} from "./history"
import { getHostStatus } from "./host"
import { groupFailures, reportGaps, staleAfterMs } from "./status"
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
