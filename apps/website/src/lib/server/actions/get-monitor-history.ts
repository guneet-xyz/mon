"use server"

import { findMonitorTile } from "@mon/config"
import type { MonitorTile } from "@mon/config/schema"

import { getCachedConfig } from "@/lib/server/config-cache"
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
  const config = findMonitorTile(await getCachedConfig(), type, dbKey)
  if (!config) return null

  const [series, uptime, incidents] = await Promise.all([
    getSeries(type, dbKey, range),
    getUptime(type, dbKey),
    getIncidents(type, dbKey, range),
  ])
  return { series, uptime, incidents }
}
