"use server"

import { getMonitorConfig, toPublicTile } from "@mon/config"
import type { MonitorTile } from "@mon/config/schema"

import { env } from "@/env"
import { getStatus } from "@/lib/server/monitors"
import {
  getMonitorDetails,
  monitorWarnings,
} from "@/lib/server/monitors/details"

export async function getMonitorTileInfo<T extends MonitorTile["type"]>(
  type: T,
  dbKey: string,
) {
  const config = await getMonitorConfig(env.CONFIG_PATH, type, dbKey)
  if (!config) {
    return null
  }

  const [status, details] = await Promise.all([
    getStatus(type, dbKey),
    getMonitorDetails(type, dbKey),
  ])
  return {
    status,
    details,
    warnings: monitorWarnings(details),
    config: toPublicTile(config),
  }
}
