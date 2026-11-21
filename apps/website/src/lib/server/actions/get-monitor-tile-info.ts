"use server"

import { findMonitor, monitorIntervalSeconds, toPublicTile } from "@mon/config"
import type { MonitorTile } from "@mon/config/schema"

import { getCachedConfig } from "@/lib/server/config-cache"
import { getStatus } from "@/lib/server/monitors"
import {
  getMonitorDetails,
  monitorWarnings,
} from "@/lib/server/monitors/details"

export async function getMonitorTileInfo<T extends MonitorTile["type"]>(
  type: T,
  dbKey: string,
) {
  const board = await getCachedConfig()
  const config = findMonitor(board, type, dbKey)
  if (!config) {
    return null
  }

  const [status, details] = await Promise.all([
    getStatus(type, dbKey, monitorIntervalSeconds(board, config)),
    getMonitorDetails(type, dbKey, new Date(), {
      disks:
        "disks" in config
          ? config.disks.map((disk: { name: string }) => disk.name)
          : undefined,
    }),
  ])
  return {
    status,
    details,
    warnings: monitorWarnings(details),
    config: toPublicTile(config),
  }
}
