import { mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { _resetCache, getCachedConfig } from "@/lib/server/config-cache"

let tmpDir: string
let configPath: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "mon-config-cache-test-"))
  configPath = join(tmpDir, "config.toml")
  writeFileSync(configPath, "tiles = []\n", "utf-8")
  _resetCache()
})

afterEach(() => {
  _resetCache()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe("getCachedConfig", () => {
  it("returns the same object reference on a second call within TTL", async () => {
    const first = await getCachedConfig(configPath)
    const second = await getCachedConfig(configPath)
    expect(second).toBe(first)
  })

  it("returns a fresh object after _resetCache()", async () => {
    const first = await getCachedConfig(configPath)
    _resetCache()
    const second = await getCachedConfig(configPath)
    expect(second).not.toBe(first)
  })

  it("returns equivalent config shape", async () => {
    const cfg = await getCachedConfig(configPath)
    expect(cfg).toHaveProperty("options")
    expect(cfg).toHaveProperty("tiles")
    expect(Array.isArray(cfg.tiles)).toBe(true)
  })
})
