import { type Config, ConfigSchema, type Monitor } from "./schema"

import { env } from "@mon/env"
import { existsSync } from "fs"
import { mkdir, readFile, writeFile } from "fs/promises"
import { parse } from "smol-toml"

export async function getConfig() {
  if (existsSync(env.CONFIG_PATH) === false) {
    await mkdir(env.CONFIG_PATH.replace(/\/[^/]+$/, ""), { recursive: true })
    await writeFile(env.CONFIG_PATH, "", "utf-8")
  }
  const text = await readFile(env.CONFIG_PATH, "utf-8")
  const parsed = parse(text)
  const zodParsed = ConfigSchema.parse(parsed)
  return zodParsed
}

export async function getMonitorConfig<T extends Monitor["type"]>(
  type: T,
  key: string,
): Promise<Monitor | undefined> {
  const config = await getMonitors()
  return config.find((tile) => tile.type === type && tile.key === key)
}

export async function getMonitors(): Promise<Monitor[]> {
  const config = await getConfig()
  return config.tiles.filter(
    (tile) =>
      tile.type !== "empty" &&
      tile.type !== "hidden" &&
      tile.type !== "logo" &&
      tile.type !== "theme",
  )
}
