"use server"

import {
  getConfig,
  getGroupMembers,
  toPublicTile,
  type GroupTile,
  type MonitorTile,
} from "@mon/config"

import { env } from "@/env"
import { getStatus } from "@/lib/server/monitors"
import { groupStatus, type MonitorStatus } from "@/lib/server/monitors/status"

export async function getGroupTileInfo(dbKey: string) {
  const config = await getConfig(env.CONFIG_PATH)
  const group = config.tiles.find(
    (tile): tile is GroupTile => tile.type === "group" && tile.key === dbKey,
  )
  if (!group) {
    return null
  }

  // A nested group's status rolls up its own members. The schema rejects
  // cycles, and each tile's status is looked up once.
  const statuses = new Map<string, Promise<MonitorStatus>>()
  const statusOf = (tile: MonitorTile | GroupTile): Promise<MonitorStatus> => {
    const id = `${tile.type}:${tile.key}`
    let status = statuses.get(id)
    if (!status) {
      status =
        tile.type === "group"
          ? Promise.all(getGroupMembers(config, tile).map(statusOf)).then(
              groupStatus,
            )
          : getStatus(tile.type, tile.key)
      statuses.set(id, status)
    }
    return status
  }

  const members = await Promise.all(
    getGroupMembers(config, group).map(async (member) => ({
      config: toPublicTile(member),
      status: await statusOf(member),
    })),
  )

  return {
    config: toPublicTile(group),
    status: groupStatus(members.map((member) => member.status)),
    members,
  }
}
