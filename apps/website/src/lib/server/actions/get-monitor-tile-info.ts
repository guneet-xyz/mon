"use server"

import { findMonitor, monitorIntervalSeconds, toPublicTile } from "@mon/config"
import type { MonitorTile } from "@mon/config/schema"

import { getCachedConfig } from "@/lib/server/config-cache"
import { getMonitorState } from "@/lib/server/monitors/state"

export async function getMonitorTileInfo<T extends MonitorTile["type"]>(
  type: T,
  dbKey: string,
) {
  const board = await getCachedConfig()
  const config = findMonitor(board, type, dbKey)
  if (!config) {
    return null
  }

  return {
    ...(await getMonitorState(config, monitorIntervalSeconds(board, config))),
    config: toPublicTile(config),
  }
}
