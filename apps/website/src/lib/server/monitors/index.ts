import { getContainerIncidentPings, getContainerStatus } from "./container"
import { getGithubIncidentPings, getGithubStatus } from "./github"
import { getHostIncidentPings, getHostStatus } from "./host"
import { getHostPings } from "./host"
import { getWebsiteIncidentPings, getWebsiteStatus } from "./website"
import { getWebsitePings } from "./website"

import type { MonitorTile } from "@mon/config/schema"
import dayjs from "dayjs"

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
): Promise<Array<Incident>> {
  const pings = await getIncidentPings(type, dbKey)

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

  incidents.sort((a, b) => b.start.getTime() - a.start.getTime())

  return incidents
}

function getIncidentPings(
  type: MonitorTile["type"],
  dbKey: string,
): Promise<Array<IncidentPing>> {
  if (type === "host") return getHostIncidentPings(dbKey)
  if (type === "website") return getWebsiteIncidentPings(dbKey)
  if (type === "container") return getContainerIncidentPings(dbKey)
  if (type === "github") return getGithubIncidentPings(dbKey)

  throw new Error("Unsupported type for getIncidentPings function")
}

export async function getPings(
  type: MonitorTile["type"],
  dbKey: string,
): Promise<Array<{ timestamp: Date; latency: number }> | null> {
  if (type === "host") return await getHostPings(dbKey)
  if (type === "website") return await getWebsitePings(dbKey)
  if (type === "container") return null
  if (type === "github") return null

  throw new Error("Unsupported type for getPings function")
}

export async function getStatus(
  type: MonitorTile["type"],
  dbKey: string,
): Promise<"online" | "offline" | "unknown"> {
  if (type === "host") return await getHostStatus(dbKey)
  if (type === "website") return await getWebsiteStatus(dbKey)
  if (type === "container") return await getContainerStatus(dbKey)
  if (type === "github") return await getGithubStatus(dbKey)

  throw new Error("Unsupported type for getStatus function")
}
