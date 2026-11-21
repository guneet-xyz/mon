"use server"

import {
  findMonitor,
  getConfig,
  monitorIntervalSeconds,
  toPublicTile,
} from "@mon/config"
import type { MonitorTile } from "@mon/config/schema"

import { env } from "@/env"
import { getMonitorState } from "@/lib/server/monitors/state"

export async function getMonitorTileInfo<T extends MonitorTile["type"]>(
  type: T,
  dbKey: string,
) {
  const board = await getConfig(env.CONFIG_PATH)
  const config = findMonitor(board, type, dbKey)
  if (!config) {
    return null
  }

  return {
    ...(await getMonitorState(config, monitorIntervalSeconds(board, config))),
    config: toPublicTile(config),
  }
}
