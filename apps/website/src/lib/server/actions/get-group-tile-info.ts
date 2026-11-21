"use server"

import {
  getConfig,
  getGroupMembers,
  toPublicTile,
  type GroupTile,
  type MonitorTile,
} from "@mon/config"

import { env } from "@/env"
import { getMonitorState } from "@/lib/server/monitors/state"
import { groupStatus, type MonitorStatus } from "@/lib/server/monitors/status"
import {
  groupTone,
  summarize,
  toneOf,
  type GroupSummary,
  type Tone,
} from "@/lib/tile-state"

type MonitorResult = { status: MonitorStatus; warnings: number }

export async function getGroupTileInfo(dbKey: string) {
  const config = await getConfig(env.CONFIG_PATH)
  const group = config.tiles.find(
    (tile): tile is GroupTile => tile.type === "group" && tile.key === dbKey,
  )
  if (!group) {
    return null
  }

  // Each monitor is looked up once, however often it appears in the group.
  const monitors = new Map<string, Promise<MonitorResult>>()
  const monitorOf = (tile: MonitorTile): Promise<MonitorResult> => {
    const id = `${tile.type}:${tile.key}`
    let result = monitors.get(id)
    if (!result) {
      result = getMonitorState(tile).then(({ status, warnings }) => ({
        status,
        warnings: warnings.length,
      }))
      monitors.set(id, result)
    }
    return result
  }

  // The distinct monitors in a group, nested groups included. The schema
  // rejects cycles.
  const monitorsIn = (tile: MonitorTile | GroupTile): MonitorTile[] => {
    if (tile.type !== "group") return [tile]
    const seen = new Map<string, MonitorTile>()
    for (const member of getGroupMembers(config, tile)) {
      for (const monitor of monitorsIn(member)) {
        seen.set(`${monitor.type}:${monitor.key}`, monitor)
      }
    }
    return [...seen.values()]
  }

  const summaryOf = async (
    tile: MonitorTile | GroupTile,
  ): Promise<{ status: MonitorStatus; tone: Tone; summary: GroupSummary }> => {
    const results = await Promise.all(monitorsIn(tile).map(monitorOf))
    const summary = summarize(results)
    if (tile.type !== "group") {
      const [result] = results
      return {
        status: result!.status,
        tone: toneOf(result!.status, result!.warnings),
        summary,
      }
    }
    return {
      status: groupStatus(results.map((result) => result.status)),
      tone: groupTone(summary),
      summary,
    }
  }

  const [own, members] = await Promise.all([
    summaryOf(group),
    Promise.all(
      getGroupMembers(config, group).map(async (member) => ({
        config: toPublicTile(member),
        ...(await summaryOf(member)),
      })),
    ),
  ])

  return {
    config: toPublicTile(group),
    ...own,
    members,
  }
}
