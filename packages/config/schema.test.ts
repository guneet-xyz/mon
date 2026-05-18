import {
  type Config,
  ConfigSchema,
  getDaemonAssignments,
  verifyDaemonToken,
} from "./schema"

import { describe, expect, test } from "bun:test"
import { createHash } from "crypto"

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

const baseConfig = (overrides: Partial<Config> = {}): Config =>
  ConfigSchema.parse({
    daemons: {
      default: { token_hash: sha256("hello") },
    },
    tiles: [],
    ...overrides,
  })

describe("ConfigSchema — daemons", () => {
  test("parses a config with a [daemons.default] block", () => {
    const config = ConfigSchema.parse({
      daemons: {
        default: {
          token_hash: sha256("hello"),
          description: "Primary daemon",
        },
      },
      tiles: [],
    })

    expect(config.daemons["default"]?.token_hash).toBe(sha256("hello"))
    expect(config.daemons["default"]?.description).toBe("Primary daemon")
  })

  test("daemons defaults to an empty object when omitted", () => {
    const config = ConfigSchema.parse({ tiles: [] })
    expect(config.daemons).toEqual({})
  })

  test("rejects a daemon token_hash that is not 64 hex chars", () => {
    expect(() =>
      ConfigSchema.parse({
        daemons: { default: { token_hash: "not-a-hash" } },
        tiles: [],
      }),
    ).toThrow()
  })
})

describe("MonitorSchema — daemon + interval_seconds", () => {
  test("daemon defaults to 'default' on every monitor variant", () => {
    const config = ConfigSchema.parse({
      tiles: [
        { type: "host", key: "h", address: "1.1.1.1" },
        { type: "website", key: "w", url: "https://e.com" },
        { type: "container", key: "c", container_name: "nginx" },
        { type: "github", key: "g", repo: "owner/repo" },
      ],
    })

    for (const tile of config.tiles) {
      if (
        tile.type === "host" ||
        tile.type === "website" ||
        tile.type === "container" ||
        tile.type === "github"
      ) {
        expect(tile.daemon).toBe("default")
      }
    }
  })

  test("daemon can be set to a custom value", () => {
    const config = ConfigSchema.parse({
      tiles: [{ type: "host", key: "h", address: "1.1.1.1", daemon: "edge-1" }],
    })
    const tile = config.tiles[0]!
    if (tile.type !== "host") throw new Error("expected host")
    expect(tile.daemon).toBe("edge-1")
  })

  test("interval_seconds is optional and passes through when set", () => {
    const config = ConfigSchema.parse({
      tiles: [
        { type: "host", key: "h1", address: "1.1.1.1" },
        {
          type: "website",
          key: "w1",
          url: "https://e.com",
          interval_seconds: 30,
        },
      ],
    })
    const [host, web] = config.tiles
    if (host?.type !== "host" || web?.type !== "website") throw new Error("bad")
    expect(host.interval_seconds).toBeUndefined()
    expect(web.interval_seconds).toBe(30)
  })

  test("interval_seconds rejects zero, negative, and non-integer values", () => {
    const make = (v: unknown) =>
      ConfigSchema.parse({
        tiles: [
          {
            type: "host",
            key: "h",
            address: "1.1.1.1",
            interval_seconds: v,
          },
        ],
      })
    expect(() => make(0)).toThrow()
    expect(() => make(-5)).toThrow()
    expect(() => make(1.5)).toThrow()
  })
})

describe("github_token", () => {
  test("github_token is allowed on github tiles", () => {
    const config = ConfigSchema.parse({
      tiles: [
        {
          type: "github",
          key: "g",
          repo: "owner/repo",
          github_token: "ghp_xxx",
        },
      ],
    })
    const tile = config.tiles[0]!
    if (tile.type !== "github") throw new Error("expected github")
    expect(tile.github_token).toBe("ghp_xxx")
  })

  test("github_token is optional on github tiles", () => {
    const config = ConfigSchema.parse({
      tiles: [{ type: "github", key: "g", repo: "owner/repo" }],
    })
    const tile = config.tiles[0]!
    if (tile.type !== "github") throw new Error("expected github")
    expect(tile.github_token).toBeUndefined()
  })
})

describe("getDaemonAssignments", () => {
  const config = ConfigSchema.parse({
    daemons: { default: { token_hash: sha256("t") } },
    tiles: [
      { type: "host", key: "h1", address: "1.1.1.1" },
      { type: "host", key: "h2", address: "2.2.2.2", daemon: "edge" },
      { type: "website", key: "w1", url: "https://a.com", daemon: "edge" },
      { type: "logo" },
      { type: "theme" },
      {
        type: "empty",
        row_start: 1,
        row_span: 1,
        col_start: 1,
        col_span: 1,
      },
    ],
  })

  test("returns only monitor tiles assigned to the given daemon", () => {
    const tiles = getDaemonAssignments(config, "default")
    expect(tiles).toHaveLength(1)
    expect(tiles[0]!.key).toBe("h1")
  })

  test("returns multiple tiles when several are assigned", () => {
    const tiles = getDaemonAssignments(config, "edge")
    expect(tiles).toHaveLength(2)
    expect(tiles.map((t) => t.key).sort()).toEqual(["h2", "w1"])
  })

  test("returns an empty array for an unknown daemonId", () => {
    expect(getDaemonAssignments(config, "nonexistent")).toEqual([])
  })

  test("excludes non-monitor tiles (logo, theme, empty, hidden)", () => {
    const tiles = getDaemonAssignments(config, "default")
    for (const t of tiles) {
      expect(["host", "website", "container", "github"]).toContain(t.type)
    }
  })
})

describe("verifyDaemonToken", () => {
  const config = baseConfig({
    daemons: { default: { token_hash: sha256("correct-horse") } },
  })

  test("returns true for the correct token", () => {
    expect(verifyDaemonToken(config, "default", "correct-horse")).toBe(true)
  })

  test("returns false for the wrong token", () => {
    expect(verifyDaemonToken(config, "default", "wrong-token")).toBe(false)
  })

  test("returns false for an unknown daemonId", () => {
    expect(verifyDaemonToken(config, "missing", "correct-horse")).toBe(false)
  })

  test("returns false for an empty presented token", () => {
    expect(verifyDaemonToken(config, "default", "")).toBe(false)
  })
})
