"use server"

import { getStatus } from "@/lib/server/monitors"

import { getMonitorConfig } from "@mon/config"
import type { MonitorTile } from "@mon/config/schema"

export async function getMonitorTileInfo(
  type: MonitorTile["type"],
  dbKey: string,
) {
  const config = await getMonitorConfig(type, dbKey)
  if (!config) {
    return null
  }

  const status = await getStatus(type, dbKey)
  return {
    status,
    config,
  }
}
