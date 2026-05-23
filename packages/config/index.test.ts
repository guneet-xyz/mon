import { getConfig, getMonitorConfig, getMonitors } from "./index"

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

describe("config", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "mon-config-test-"))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("getConfig creates parent dir and empty config file when path does not exist", async () => {
    const configPath = join(tmpDir, "subdir", "config.toml")
    const config = await getConfig(configPath)

    expect(config).toBeDefined()
    expect(config.tiles).toEqual([])
    expect(config.options).toBeDefined()
  })

  it("getConfig reads valid TOML and returns Zod-parsed Config", async () => {
    const configPath = join(tmpDir, "config.toml")
    const tomlContent = `
[agents.default]
token_hash = "0000000000000000000000000000000000000000000000000000000000000000"

[[tiles]]
type = "host"
key = "localhost"
name = "Localhost"
address = "127.0.0.1"
`
    writeFileSync(configPath, tomlContent, "utf-8")

    const config = await getConfig(configPath)

    expect(config.tiles).toHaveLength(1)
    const tile = config.tiles[0]
    expect(tile).toBeDefined()
    if (tile && tile.type === "host") {
      expect(tile.key).toBe("localhost")
      expect(tile.address).toBe("127.0.0.1")
    }
  })

  it("getConfig throws on invalid TOML syntax", async () => {
    const configPath = join(tmpDir, "config.toml")
    const invalidToml = "[unclosed"
    writeFileSync(configPath, invalidToml, "utf-8")

    let threw = false
    try {
      await getConfig(configPath)
    } catch {
      threw = true
    }

    expect(threw).toBe(true)
  })

  it("getConfig throws on Zod validation failure (missing required field)", async () => {
    const configPath = join(tmpDir, "config.toml")
    const invalidConfig = `
[agents.default]
token_hash = "0000000000000000000000000000000000000000000000000000000000000000"

[[tiles]]
type = "host"
key = "localhost"
`
    writeFileSync(configPath, invalidConfig, "utf-8")

    let threw = false
    try {
      await getConfig(configPath)
    } catch {
      threw = true
    }

    expect(threw).toBe(true)
  })

  it("getMonitors returns only monitor tiles, filtering out empty/hidden/logo/theme", async () => {
    const configPath = join(tmpDir, "config.toml")
    const tomlContent = `
[agents.default]
token_hash = "0000000000000000000000000000000000000000000000000000000000000000"

[[tiles]]
type = "host"
key = "host1"
address = "192.168.1.1"

[[tiles]]
type = "website"
key = "site1"
url = "https://example.com"

[[tiles]]
type = "empty"
row_start = 1
row_span = 1
col_start = 1
col_span = 1

[[tiles]]
type = "hidden"
row_start = 2
row_span = 1
col_start = 1
col_span = 1

[[tiles]]
type = "logo"
row_start = 3
row_span = 1
col_start = 1
col_span = 1

[[tiles]]
type = "theme"
row_start = 4
row_span = 1
col_start = 1
col_span = 1
`
    writeFileSync(configPath, tomlContent, "utf-8")

    const monitors = await getMonitors(configPath)

    expect(monitors).toHaveLength(2)
    const hasOnlyMonitors = monitors.every(
      (m) =>
        m.type === "host" ||
        m.type === "website" ||
        m.type === "container" ||
        m.type === "github",
    )
    expect(hasOnlyMonitors).toBe(true)
    expect(monitors.map((m) => m.type)).toEqual(["host", "website"])
  })

  it("getMonitorConfig returns matching tile when type and key match", async () => {
    const configPath = join(tmpDir, "config.toml")
    const tomlContent = `
[agents.default]
token_hash = "0000000000000000000000000000000000000000000000000000000000000000"

[[tiles]]
type = "host"
key = "prod-server"
address = "10.0.0.1"

[[tiles]]
type = "website"
key = "status-page"
url = "https://status.example.com"
`
    writeFileSync(configPath, tomlContent, "utf-8")

    const hostTile = await getMonitorConfig(configPath, "host", "prod-server")

    expect(hostTile).toBeDefined()
    if (hostTile && hostTile.type === "host") {
      expect(hostTile.key).toBe("prod-server")
      expect(hostTile.address).toBe("10.0.0.1")
    }
  })

  it("getMonitorConfig returns undefined when no match found", async () => {
    const configPath = join(tmpDir, "config.toml")
    const tomlContent = `
[agents.default]
token_hash = "0000000000000000000000000000000000000000000000000000000000000000"

[[tiles]]
type = "host"
key = "server1"
address = "10.0.0.1"
`
    writeFileSync(configPath, tomlContent, "utf-8")

    const result = await getMonitorConfig(configPath, "host", "nonexistent")

    expect(result).toBeUndefined()
  })

  it("getMonitorConfig returns undefined when key exists but type differs", async () => {
    const configPath = join(tmpDir, "config.toml")
    const tomlContent = `
[agents.default]
token_hash = "0000000000000000000000000000000000000000000000000000000000000000"

[[tiles]]
type = "host"
key = "mykey"
address = "10.0.0.1"

[[tiles]]
type = "website"
key = "mykey"
url = "https://example.com"
`
    writeFileSync(configPath, tomlContent, "utf-8")

    const result = await getMonitorConfig(configPath, "container", "mykey")

    expect(result).toBeUndefined()
  })
})
