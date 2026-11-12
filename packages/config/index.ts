import {
  type Config,
  ConfigSchema,
  type GroupTile,
  type MonitorTile,
  getGroupMembers,
  getMonitorTiles,
} from "./schema"

import { existsSync } from "fs"
import { mkdir, readFile, writeFile } from "fs/promises"
import { parse } from "smol-toml"

export type {
  Config,
  MonitorTile,
  NonMonitorTile,
  Tile,
  Agent,
  Host,
  Container,
  Website,
  Github,
  GroupTile,
  PublicConfig,
  PublicTile,
  PublicMonitorTile,
  PublicGroupTile,
} from "./schema"
export {
  getAgentAssignments,
  getGroupMembers,
  getMonitorTiles,
  isMonitorTile,
  isTileOnGrid,
  toPublicConfig,
  toPublicTile,
  verifyAgentToken,
} from "./schema"

export async function getConfig(path: string): Promise<Config> {
  if (existsSync(path) === false) {
    await mkdir(path.replace(/\/[^/]+$/, ""), { recursive: true })
    await writeFile(path, "", "utf-8")
  }
  const text = await readFile(path, "utf-8")
  const parsed = parse(text)
  return ConfigSchema.parse(parsed)
}

export async function getMonitorConfig<T extends MonitorTile["type"]>(
  path: string,
  type: T,
  key: string,
): Promise<Extract<MonitorTile, { type: T }> | undefined> {
  const monitors = await getMonitors(path)
  return monitors.find((tile) => tile.type === type && tile.key === key) as
    | Extract<MonitorTile, { type: T }>
    | undefined
}

export async function getMonitors(path: string): Promise<MonitorTile[]> {
  return getMonitorTiles(await getConfig(path))
}

export async function getGroupConfig(
  path: string,
  key: string,
): Promise<{ group: GroupTile; members: MonitorTile[] } | undefined> {
  const config = await getConfig(path)
  const group = config.tiles.find(
    (tile): tile is GroupTile => tile.type === "group" && tile.key === key,
  )
  if (!group) return undefined
  return { group, members: getGroupMembers(config, group) }
}
