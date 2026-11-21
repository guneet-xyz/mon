import { existsSync } from "fs"
import { mkdir, readFile, writeFile } from "fs/promises"
import { parse } from "smol-toml"

import {
  ConfigSchema,
  findMonitor,
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
  findMonitor,
  getAgentAssignments,
  getGroupMembers,
  getMonitorTiles,
  isMonitorTile,
  isTileOnGrid,
  monitorIntervalSeconds,
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
  return findMonitor(await getConfig(path), type, key)
}

export async function getMonitors(path: string): Promise<MonitorTile[]> {
  return getMonitorTiles(await getConfig(path))
}
