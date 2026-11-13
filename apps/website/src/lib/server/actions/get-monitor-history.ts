"use server"

import { getMonitorConfig } from "@mon/config"
import type { MonitorTile } from "@mon/config/schema"

import { env } from "@/env"
import { getIncidents } from "@/lib/server/monitors"
import {
  getSeries,
  getUptime,
  isHistoryRange,
  type HistoryRange,
} from "@/lib/server/monitors/history"

// History for a monitor's dialog. Only answers for monitors in this board's
// config.
export async function getMonitorHistory(
  type: MonitorTile["type"],
  dbKey: string,
  range: HistoryRange,
) {
  if (!isHistoryRange(range)) return null
  const config = await getMonitorConfig(env.CONFIG_PATH, type, dbKey)
  if (!config) return null

  const [series, uptime, incidents] = await Promise.all([
    getSeries(type, dbKey, range),
    getUptime(type, dbKey),
    getIncidents(type, dbKey, range),
  ])
  return { series, uptime, incidents }
}
