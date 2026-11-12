"use server"

import { getGroupConfig, toPublicTile } from "@mon/config"

import { env } from "@/env"
import { getStatus } from "@/lib/server/monitors"
import { groupStatus } from "@/lib/server/monitors/status"

export async function getGroupTileInfo(dbKey: string) {
  const found = await getGroupConfig(env.CONFIG_PATH, dbKey)
  if (!found) {
    return null
  }

  const members = await Promise.all(
    found.members.map(async (member) => ({
      config: toPublicTile(member),
      status: await getStatus(member.type, member.key),
    })),
  )

  return {
    config: toPublicTile(found.group),
    status: groupStatus(members.map((member) => member.status)),
    members,
  }
}
