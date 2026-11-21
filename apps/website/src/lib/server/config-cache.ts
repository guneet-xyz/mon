import { statSync } from "fs"

import { describeConfigError, getConfig, type Config } from "@mon/config"

import { env } from "@/env"

const TTL_MS = 5000

export interface ConfigLoadError {
  // Safe to show on the board: names where the problem is, quotes nothing.
  summary: string
  // When the current file was first found to be invalid.
  since: Date
}

// `config` is the last config that loaded successfully, or null if none has.
// `error` is set while the file on disk is invalid.
export type ConfigState =
  | { config: Config; error: ConfigLoadError | null }
  | { config: null; error: ConfigLoadError }

export class ConfigUnavailableError extends Error {
  constructor(summary: string) {
    super(`No valid config has loaded yet: ${summary}`)
    this.name = "ConfigUnavailableError"
  }
}

interface Cache {
  path: string | null
  state: ConfigState | null
  checkedAt: number
  checkedMtime: number | null
  inflight: Promise<ConfigState> | null
}

function emptyCache(): Cache {
  return {
    path: null,
    state: null,
    checkedAt: 0,
    checkedMtime: null,
    inflight: null,
  }
}

// Kept on globalThis so instrumentation.ts (which loads the config at startup)
// and the app's routes share one cache even if Next bundles them separately.
const globalCache = globalThis as { __monConfigCache?: Cache }
const cache = (globalCache.__monConfigCache ??= emptyCache())

function mtimeOf(path: string): number | null {
  try {
    return statSync(path).mtimeMs
  } catch {
    // Not created yet: getConfig creates it on first run.
    return null
  }
}

async function load(path: string): Promise<ConfigState> {
  try {
    const config = await getConfig(path)
    if (cache.state?.error) console.info(`[mon] Config ${path} is valid again`)
    return { config, error: null }
  } catch (err) {
    const { summary, details } = describeConfigError(err)
    const previous = cache.state?.config ?? null
    console.error(
      [
        previous
          ? `[mon] Config ${path} is invalid, still serving the last good config: ${summary}`
          : `[mon] Config ${path} is invalid and no earlier config loaded: ${summary}`,
        ...details.map((detail) => `  - ${detail}`),
      ].join("\n"),
    )
    const error = { summary, since: cache.state?.error?.since ?? new Date() }
    return previous ? { config: previous, error } : { config: null, error }
  }
}

// The config is re-read at most every TTL_MS, and only when the file's mtime
// changes. A file that fails to load is logged once and the last good config
// keeps being served.
export async function getConfigState(path?: string): Promise<ConfigState> {
  const configPath = path ?? env.CONFIG_PATH
  if (cache.path !== configPath) {
    _resetCache()
    cache.path = configPath
  }
  const { state } = cache
  const now = Date.now()
  if (state && now - cache.checkedAt < TTL_MS) return state

  const mtime = mtimeOf(configPath)
  if (state && mtime !== null && mtime === cache.checkedMtime) {
    cache.checkedAt = now
    return state
  }

  cache.inflight ??= load(configPath).then((next) => {
    cache.state = next
    cache.checkedAt = Date.now()
    // getConfig may have just created the file.
    cache.checkedMtime = mtime ?? mtimeOf(configPath)
    cache.inflight = null
    return next
  })
  return cache.inflight
}

// The last good config. Throws ConfigUnavailableError if none has loaded.
export async function getCachedConfig(path?: string): Promise<Config> {
  const { config, error } = await getConfigState(path)
  if (!config) throw new ConfigUnavailableError(error.summary)
  return config
}

export function _resetCache(): void {
  Object.assign(cache, emptyCache())
}
