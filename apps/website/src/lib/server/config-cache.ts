import { type Config, getConfig } from "@mon/config"

import { statSync } from "fs"

const TTL_MS = 5000

let cached: Config | null = null
let cachedAt = 0
let cachedMtime = 0

export async function getCachedConfig(): Promise<Config> {
  const now = Date.now()
  if (cached && now - cachedAt < TTL_MS) return cached

  // Check mtime to detect file changes even within TTL window
  try {
    const stat = statSync(process.env.CONFIG_PATH ?? "/etc/mon/config.toml")
    const mtime = stat.mtimeMs
    if (cached && mtime === cachedMtime) {
      cachedAt = now
      return cached
    }
    cachedMtime = mtime
  } catch {
    // File may not exist yet; getConfig() handles creation
  }

  cached = await getConfig()
  cachedAt = now
  return cached
}

export function _resetCache(): void {
  cached = null
  cachedAt = 0
  cachedMtime = 0
}
