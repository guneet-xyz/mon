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
