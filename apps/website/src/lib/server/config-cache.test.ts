import { _resetCache, getCachedConfig } from "@/lib/server/config-cache"

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

let tmpDir: string
let configPath: string
let originalConfigPath: string | undefined

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "mon-config-cache-test-"))
  configPath = join(tmpDir, "config.toml")
  writeFileSync(configPath, "tiles = []\n", "utf-8")
  originalConfigPath = process.env.CONFIG_PATH
  process.env.CONFIG_PATH = configPath
  process.env.SKIP_ENV_VALIDATION = "1"
  _resetCache()
})

afterEach(() => {
  _resetCache()
  if (originalConfigPath === undefined) {
    delete process.env.CONFIG_PATH
  } else {
    process.env.CONFIG_PATH = originalConfigPath
  }
  rmSync(tmpDir, { recursive: true, force: true })
})

describe("getCachedConfig", () => {
  it("returns the same object reference on a second call within TTL", async () => {
    const first = await getCachedConfig()
    const second = await getCachedConfig()
    expect(second).toBe(first)
  })

  it("returns a fresh object after _resetCache()", async () => {
    const first = await getCachedConfig()
    _resetCache()
    const second = await getCachedConfig()
    expect(second).not.toBe(first)
  })

  it("returns equivalent config shape", async () => {
    const cfg = await getCachedConfig()
    expect(cfg).toHaveProperty("options")
    expect(cfg).toHaveProperty("tiles")
    expect(Array.isArray(cfg.tiles)).toBe(true)
  })
})
