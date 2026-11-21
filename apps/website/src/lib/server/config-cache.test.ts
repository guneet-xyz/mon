import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
  spyOn,
} from "bun:test"

import {
  _resetCache,
  ConfigUnavailableError,
  getCachedConfig,
  getConfigState,
} from "@/lib/server/config-cache"

const SECRET = "ghp_supersecrettokenvalue"
const HASH = "a".repeat(64)

const VALID = `
[agents.default]
token_hash = "${HASH}"

[[tiles]]
type = "github"
key = "repo"
repo = "owner/repo"
github_token = "${SECRET}"
`

const VALID_TWO_TILES = `${VALID}
[[tiles]]
type = "host"
key = "router"
address = "192.0.2.1"
`

// The unterminated string is on the github_token line, so smol-toml's message
// quotes the token.
const INVALID_TOML = `
[agents.default]
token_hash = "${HASH}"

[[tiles]]
type = "github"
key = "repo"
repo = "owner/repo"
github_token = "${SECRET}
`

const INVALID_SCHEMA = `
[agents.default]
token_hash = "${SECRET}"

[[tiles]]
type = "host"
key = "router"
`

let tmpDir: string
let configPath: string
let now: number
let mtime: number
let errorLog: ReturnType<typeof spyOn<Console, "error">>
let infoLog: ReturnType<typeof spyOn<Console, "info">>

// Writes the config with a new mtime and moves past the cache TTL.
function writeConfig(toml: string) {
  writeFileSync(configPath, toml, "utf-8")
  mtime += 10
  utimesSync(configPath, mtime, mtime)
  now += 10_000
  setSystemTime(new Date(now))
}

function logged(): string {
  return [...errorLog.mock.calls, ...infoLog.mock.calls]
    .map((args) => args.join(" "))
    .join("\n")
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "mon-config-cache-test-"))
  configPath = join(tmpDir, "config.toml")
  now = Date.parse("2026-01-01T00:00:00Z")
  mtime = 1_700_000_000
  setSystemTime(new Date(now))
  errorLog = spyOn(console, "error").mockImplementation(() => undefined)
  infoLog = spyOn(console, "info").mockImplementation(() => undefined)
  writeConfig("tiles = []\n")
  _resetCache()
})

afterEach(() => {
  _resetCache()
  setSystemTime()
  errorLog.mockRestore()
  infoLog.mockRestore()
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

  it("reloads when the file changes", async () => {
    writeConfig(VALID)
    expect((await getCachedConfig(configPath)).tiles).toHaveLength(1)
    writeConfig(VALID_TWO_TILES)
    expect((await getCachedConfig(configPath)).tiles).toHaveLength(2)
  })

  it("keeps serving the last good config when the file becomes invalid", async () => {
    writeConfig(VALID)
    const good = await getCachedConfig(configPath)

    writeConfig(INVALID_TOML)
    expect(await getCachedConfig(configPath)).toBe(good)
  })

  it("throws a readable error when no config has loaded yet", async () => {
    writeConfig(INVALID_TOML)
    const error = await getCachedConfig(configPath).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ConfigUnavailableError)
    expect(String(error)).toContain(
      "No valid config has loaded yet: Invalid TOML at line 9, column",
    )
  })
})

describe("getConfigState", () => {
  it("has no error while the file is valid", async () => {
    writeConfig(VALID)
    const state = await getConfigState(configPath)
    expect(state.error).toBeNull()
    expect(state.config?.tiles).toHaveLength(1)
  })

  it("reports invalid TOML by line and column alongside the last good config", async () => {
    writeConfig(VALID)
    const good = (await getConfigState(configPath)).config

    writeConfig(INVALID_TOML)
    const state = await getConfigState(configPath)
    expect(state.config).toBe(good)
    expect(state.error?.summary).toMatch(/^Invalid TOML at line 9, column \d+$/)
  })

  it("reports schema errors by count", async () => {
    writeConfig(VALID)
    await getConfigState(configPath)

    writeConfig(INVALID_SCHEMA)
    const state = await getConfigState(configPath)
    expect(state.config?.tiles).toHaveLength(1)
    expect(state.error?.summary).toBe(
      "The config doesn't match the schema (2 problems)",
    )
  })

  it("returns no config and the error when the first load fails", async () => {
    writeConfig(INVALID_SCHEMA)
    const state = await getConfigState(configPath)
    expect(state.config).toBeNull()
    expect(state.error?.summary).toContain("doesn't match the schema")
  })

  it("logs each problem once per change, with locations but no values", async () => {
    writeConfig(VALID)
    await getConfigState(configPath)

    writeConfig(INVALID_SCHEMA)
    await getConfigState(configPath)
    now += 10_000
    setSystemTime(new Date(now))
    await getConfigState(configPath)

    expect(errorLog).toHaveBeenCalledTimes(1)
    const message = logged()
    expect(message).toContain(configPath)
    expect(message).toContain("still serving the last good config")
    expect(message).toContain("agents.default.token_hash:")
    expect(message).toContain("tiles.0.address:")
    expect(message).not.toContain(SECRET)
  })

  it("never logs or reports the contents of an invalid TOML file", async () => {
    writeConfig(VALID)
    await getConfigState(configPath)

    writeConfig(INVALID_TOML)
    const state = await getConfigState(configPath)
    const message = logged()
    expect(message).toContain("Invalid TOML at line 9")
    for (const text of [message, state.error?.summary ?? ""]) {
      expect(text).not.toContain(SECRET)
      expect(text).not.toContain(HASH)
      expect(text).not.toContain("owner/repo")
    }
  })

  it("keeps the time the file first broke across further bad edits", async () => {
    writeConfig(VALID)
    await getConfigState(configPath)

    writeConfig(INVALID_TOML)
    const brokeAt = (await getConfigState(configPath)).error?.since
    writeConfig(INVALID_SCHEMA)
    const state = await getConfigState(configPath)
    expect(state.error?.summary).toContain("schema")
    expect(state.error?.since).toEqual(brokeAt)
  })

  it("clears the error once the file is fixed", async () => {
    writeConfig(VALID)
    await getConfigState(configPath)
    writeConfig(INVALID_TOML)
    await getConfigState(configPath)

    writeConfig(VALID_TWO_TILES)
    const state = await getConfigState(configPath)
    expect(state.error).toBeNull()
    expect(state.config?.tiles).toHaveLength(2)
    expect(infoLog).toHaveBeenCalledTimes(1)
    expect(logged()).toContain("is valid again")
  })

  it("loads once for concurrent first requests", async () => {
    writeConfig(INVALID_TOML)
    await Promise.all([
      getConfigState(configPath),
      getConfigState(configPath),
      getConfigState(configPath),
    ])
    expect(errorLog).toHaveBeenCalledTimes(1)
  })
})
