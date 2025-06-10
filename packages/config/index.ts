import { type Config, ConfigSchema, Monitor } from "./schema"

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
  console.log("Config loaded:", zodParsed)
  return zodParsed
}

export async function getMonitorConfig<T extends Monitor["type"]>(
  type: T,
  key: string,
): Promise<(Config["tiles"][number] & { type: T }) | undefined> {
  const config = await getConfig()
  return config.tiles.find(
    (tile) => tile.type === type && tile.key === key,
  ) as Config["tiles"][number] & { type: T }
}

export async function getMonitors() {
  const config = await getConfig()
  return config.tiles.filter(
    (tile) =>
      tile.type !== "empty" && tile.type !== "hidden" && tile.type !== "logo",
  ) as Monitor[]
}
