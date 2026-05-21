"use server"

import { getMonitorConfig } from "@mon/config"
import type { MonitorTile } from "@mon/config/schema"

import { env } from "@/env"
import { getStatus } from "@/lib/server/monitors"

export async function getMonitorTileInfo<T extends MonitorTile["type"]>(
  type: T,
  dbKey: string,
) {
  const config = await getMonitorConfig(env.CONFIG_PATH, type, dbKey)
  if (!config) {
    return null
  }

  const status = await getStatus(type, dbKey)
  return {
    status,
    config,
  }
}
