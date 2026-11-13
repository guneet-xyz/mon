import { existsSync } from "fs"
import { mkdir, readFile, writeFile } from "fs/promises"
import { parse } from "smol-toml"

import {
  ConfigSchema,
  getGroupMembers,
  getMonitorTiles,
  type Config,
  type GroupTile,
  type MonitorTile,
} from "./schema"

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
  GroupMember,
  PublicGroupMember,
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
    Extract<MonitorTile, { type: T }> | undefined
}

export async function getMonitors(path: string): Promise<MonitorTile[]> {
  return getMonitorTiles(await getConfig(path))
}
