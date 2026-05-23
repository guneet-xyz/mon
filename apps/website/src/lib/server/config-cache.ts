import { type Config, getConfig } from "@mon/config"

import { env } from "@/env"

import { statSync } from "fs"

const TTL_MS = 5000

let cached: Config | null = null
let cachedAt = 0
let cachedMtime = 0

export async function getCachedConfig(path?: string): Promise<Config> {
  const configPath = path ?? env.CONFIG_PATH
  const now = Date.now()
  if (cached && now - cachedAt < TTL_MS) return cached

  try {
    const stat = statSync(configPath)
    const mtime = stat.mtimeMs
    if (cached && mtime === cachedMtime) {
      cachedAt = now
      return cached
    }
    cachedMtime = mtime
  } catch {
    // file not created yet — getConfig handles first-run creation
  }

  cached = await getConfig(configPath)
  cachedAt = now
  return cached
}

export function _resetCache(): void {
  cached = null
  cachedAt = 0
  cachedMtime = 0
}
