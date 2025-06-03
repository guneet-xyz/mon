import { ConfigSchema } from "./schema"

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
