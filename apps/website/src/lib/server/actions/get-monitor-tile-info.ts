"use server"

import { getMonitorConfig, toPublicTile } from "@mon/config"
import type { MonitorTile } from "@mon/config/schema"

import { env } from "@/env"
import { getMonitorState } from "@/lib/server/monitors/state"

export async function getMonitorTileInfo<T extends MonitorTile["type"]>(
  type: T,
  dbKey: string,
) {
  const config = await getMonitorConfig(env.CONFIG_PATH, type, dbKey)
  if (!config) {
    return null
  }

  return {
    ...(await getMonitorState(config)),
    config: toPublicTile(config),
  }
}
