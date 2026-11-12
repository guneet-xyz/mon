import { createHash } from "crypto"
import { describe, expect, test } from "bun:test"

import {
  ConfigSchema,
  getAgentAssignments,
  getGroupMembers,
  isTileOnGrid,
  toPublicConfig,
  toPublicTile,
  verifyAgentToken,
  type Config,
} from "./schema"

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

const baseConfig = (overrides: Partial<Config> = {}): Config =>
  ConfigSchema.parse({
    agents: {
      default: { token_hash: sha256("hello") },
    },
    tiles: [],
    ...overrides,
  })

describe("ConfigSchema — agents", () => {
  test("parses a config with a [agents.default] block", () => {
    const config = ConfigSchema.parse({
      agents: {
        default: {
          token_hash: sha256("hello"),
          description: "Primary agent",
        },
      },
      tiles: [],
    })

    expect(config.agents["default"]?.token_hash).toBe(sha256("hello"))
    expect(config.agents["default"]?.description).toBe("Primary agent")
  })

  test("agents defaults to an empty object when omitted", () => {
    const config = ConfigSchema.parse({ tiles: [] })
    expect(config.agents).toEqual({})
  })

  test("rejects a agent token_hash that is not 64 hex chars", () => {
    expect(() =>
      ConfigSchema.parse({
        agents: { default: { token_hash: "not-a-hash" } },
        tiles: [],
      }),
    ).toThrow()
  })
})

describe("MonitorSchema — agent + interval_seconds", () => {
  test("agent defaults to 'default' on every monitor variant", () => {
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
        expect(tile.agent).toBe("default")
      }
    }
  })

  test("agent can be set to a custom value", () => {
    const config = ConfigSchema.parse({
      tiles: [{ type: "host", key: "h", address: "1.1.1.1", agent: "edge-1" }],
    })
    const tile = config.tiles[0]!
    if (tile.type !== "host") throw new Error("expected host")
    expect(tile.agent).toBe("edge-1")
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

describe("getAgentAssignments", () => {
  const config = ConfigSchema.parse({
    agents: { default: { token_hash: sha256("t") } },
    tiles: [
      { type: "host", key: "h1", address: "1.1.1.1" },
      { type: "host", key: "h2", address: "2.2.2.2", agent: "edge" },
      { type: "website", key: "w1", url: "https://a.com", agent: "edge" },
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

  test("returns only monitor tiles assigned to the given agent", () => {
    const tiles = getAgentAssignments(config, "default")
    expect(tiles).toHaveLength(1)
    expect(tiles[0]!.key).toBe("h1")
  })

  test("returns multiple tiles when several are assigned", () => {
    const tiles = getAgentAssignments(config, "edge")
    expect(tiles).toHaveLength(2)
    expect(tiles.map((t) => t.key).sort()).toEqual(["h2", "w1"])
  })

  test("returns an empty array for an unknown agentId", () => {
    expect(getAgentAssignments(config, "nonexistent")).toEqual([])
  })

  test("excludes non-monitor tiles (logo, theme, empty, hidden)", () => {
    const tiles = getAgentAssignments(config, "default")
    for (const t of tiles) {
      expect(["host", "website", "container", "github"]).toContain(t.type)
    }
  })
})

describe("verifyAgentToken", () => {
  const config = baseConfig({
    agents: { default: { token_hash: sha256("correct-horse") } },
  })

  test("returns true for the correct token", () => {
    expect(verifyAgentToken(config, "default", "correct-horse")).toBe(true)
  })

  test("returns false for the wrong token", () => {
    expect(verifyAgentToken(config, "default", "wrong-token")).toBe(false)
  })

  test("returns false for an unknown agentId", () => {
    expect(verifyAgentToken(config, "missing", "correct-horse")).toBe(false)
  })

  test("returns false for an empty presented token", () => {
    expect(verifyAgentToken(config, "default", "")).toBe(false)
  })
})

describe("toPublicConfig", () => {
  const config = ConfigSchema.parse({
    agents: { default: { token_hash: sha256("secret") } },
    tiles: [
      {
        type: "github",
        key: "repo",
        repo: "owner/repo",
        github_token: "ghp_secret",
        agent: "anzen",
        interval_seconds: 30,
      },
      { type: "container", key: "db", container_name: "postgres" },
      { type: "host", key: "router", address: "192.168.1.1", name: "Router" },
      { type: "logo" },
    ],
  })

  test("drops agents and every server-only tile field", () => {
    const serialized = JSON.stringify(toPublicConfig(config))
    expect(serialized).not.toContain("ghp_secret")
    expect(serialized).not.toContain(sha256("secret"))
    expect(serialized).not.toContain("token_hash")
    expect(serialized).not.toContain("anzen")
    expect(serialized).not.toContain("docker_socket")
    expect(serialized).not.toContain("interval_seconds")
  })

  test("keeps display and layout fields", () => {
    const pub = toPublicConfig(config)
    expect(pub.options).toEqual(config.options)
    expect(pub.tiles).toHaveLength(4)
    expect(pub.tiles[0]).toEqual({
      type: "github",
      key: "repo",
      repo: "owner/repo",
    })
    expect(pub.tiles[2]).toEqual({
      type: "host",
      key: "router",
      address: "192.168.1.1",
      name: "Router",
    })
  })

  test("toPublicTile does not mutate the source tile", () => {
    const tile = config.tiles[0]!
    toPublicTile(tile)
    expect(tile).toHaveProperty("github_token", "ghp_secret")
  })
})

describe("ConfigSchema — monitor keys", () => {
  test("rejects keys longer than the 64-character DB column", () => {
    const result = ConfigSchema.safeParse({
      tiles: [{ type: "host", key: "k".repeat(65), address: "127.0.0.1" }],
    })
    expect(result.success).toBe(false)
  })

  test("rejects empty keys", () => {
    const result = ConfigSchema.safeParse({
      tiles: [{ type: "host", key: "", address: "127.0.0.1" }],
    })
    expect(result.success).toBe(false)
  })
})

describe("ConfigSchema — groups", () => {
  const tiles = [
    { type: "host", key: "h1", address: "1.1.1.1" },
    { type: "website", key: "w1", url: "https://a.com" },
    { type: "container", key: "c1", container_name: "db" },
  ]

  test("parses a group that lists monitor keys", () => {
    const config = ConfigSchema.parse({
      tiles: [
        ...tiles,
        { type: "group", key: "g1", name: "App", members: ["w1", "c1"] },
      ],
    })
    const group = config.tiles[3]!
    expect(group).toEqual({
      type: "group",
      key: "g1",
      name: "App",
      members: [{ key: "w1" }, { key: "c1" }],
    })
  })

  test("lets one monitor belong to several groups", () => {
    const config = ConfigSchema.parse({
      tiles: [
        ...tiles,
        { type: "group", key: "g1", members: ["h1", "w1"] },
        { type: "group", key: "g2", members: ["h1", "c1"] },
      ],
    })
    expect(config.tiles.filter((t) => t.type === "group")).toHaveLength(2)
  })

  test("rejects a group without members", () => {
    const result = ConfigSchema.safeParse({
      tiles: [...tiles, { type: "group", key: "g1", members: [] }],
    })
    expect(result.success).toBe(false)
  })

  test("rejects members that are not monitor keys", () => {
    const unknown = ConfigSchema.safeParse({
      tiles: [...tiles, { type: "group", key: "g1", members: ["nope"] }],
    })
    expect(unknown.success).toBe(false)

    const nested = ConfigSchema.safeParse({
      tiles: [
        ...tiles,
        { type: "group", key: "g1", members: ["h1"] },
        { type: "group", key: "g2", members: ["g1"] },
      ],
    })
    expect(nested.success).toBe(false)
  })

  test("rejects a member listed twice in one group", () => {
    const result = ConfigSchema.safeParse({
      tiles: [...tiles, { type: "group", key: "g1", members: ["h1", "h1"] }],
    })
    expect(result.success).toBe(false)
  })

  test("rejects duplicate group keys", () => {
    const result = ConfigSchema.safeParse({
      tiles: [
        ...tiles,
        { type: "group", key: "g1", members: ["h1"] },
        { type: "group", key: "g1", members: ["w1"] },
      ],
    })
    expect(result.success).toBe(false)
  })

  test("rejects a member key shared by several monitors", () => {
    const shared = [
      { type: "host", key: "x", address: "1.1.1.1" },
      { type: "website", key: "x", url: "https://a.com" },
    ]
    expect(ConfigSchema.safeParse({ tiles: shared }).success).toBe(true)
    expect(
      ConfigSchema.safeParse({
        tiles: [...shared, { type: "group", key: "g1", members: ["x"] }],
      }).success,
    ).toBe(false)
  })

  test("getGroupMembers returns monitors in member order", () => {
    const config = ConfigSchema.parse({
      tiles: [...tiles, { type: "group", key: "g1", members: ["c1", "h1"] }],
    })
    const group = config.tiles[3]!
    if (group.type !== "group") throw new Error("expected a group")
    expect(getGroupMembers(config, group).map((t) => t.key)).toEqual([
      "c1",
      "h1",
    ])
  })

  test("agents are never assigned group tiles", () => {
    const config = ConfigSchema.parse({
      tiles: [...tiles, { type: "group", key: "g1", members: ["h1"] }],
    })
    expect(getAgentAssignments(config, "default").map((t) => t.key)).toEqual([
      "h1",
      "w1",
      "c1",
    ])
  })
})

describe("grid visibility", () => {
  const parse = (hide_grouped_tiles: boolean) =>
    ConfigSchema.parse({
      options: { hide_grouped_tiles },
      tiles: [
        { type: "host", key: "plain", address: "1.1.1.1" },
        { type: "host", key: "grouped", address: "1.1.1.2" },
        { type: "host", key: "shown", address: "1.1.1.3", hidden: false },
        { type: "host", key: "hidden", address: "1.1.1.4", hidden: true },
        { type: "host", key: "solo-hidden", address: "1.1.1.5", hidden: true },
        {
          type: "group",
          key: "g1",
          members: ["grouped", "shown", "hidden"],
        },
        { type: "logo" },
      ],
    })

  const onGrid = (config: Config) =>
    config.tiles
      .filter((tile) => isTileOnGrid(config, tile))
      .map((tile) => ("key" in tile ? tile.key : tile.type))

  test("hide_grouped_tiles defaults to false", () => {
    expect(ConfigSchema.parse({}).options.hide_grouped_tiles).toBe(false)
  })

  test("shows every monitor unless it sets hidden = true", () => {
    expect(onGrid(parse(false))).toEqual([
      "plain",
      "grouped",
      "shown",
      "g1",
      "logo",
    ])
  })

  test("hide_grouped_tiles hides grouped monitors unless hidden = false", () => {
    expect(onGrid(parse(true))).toEqual(["plain", "shown", "g1", "logo"])
  })

  test("toPublicConfig leaves off-grid monitors out", () => {
    const keys = toPublicConfig(parse(true)).tiles.map((tile) =>
      "key" in tile ? tile.key : tile.type,
    )
    expect(keys).toEqual(["plain", "shown", "g1", "logo"])
  })
})

describe("ConfigSchema — expanded groups", () => {
  const tiles = [
    { type: "host", key: "h1", address: "1.1.1.1" },
    { type: "website", key: "w1", url: "https://a.com" },
    { type: "container", key: "c1", container_name: "db" },
  ]
  const group = (extra: Record<string, unknown>) =>
    ConfigSchema.safeParse({
      tiles: [...tiles, { type: "group", key: "g1", ...extra }],
    })

  test("accepts inline member placement and an expanded size", () => {
    const result = group({
      members: ["h1", { key: "w1", col_span: 2, row_start: 2 }],
      expanded: { row_span: 2, col_span: 3, rows: 2, cols: 2 },
    })
    expect(result.success).toBe(true)
    const parsed = result.data!.tiles[3]!
    if (parsed.type !== "group") throw new Error("expected a group")
    expect(parsed.members).toEqual([
      { key: "h1" },
      { key: "w1", col_span: 2, row_start: 2 },
    ])
    expect(parsed.expanded).toEqual({
      row_span: 2,
      col_span: 3,
      rows: 2,
      cols: 2,
    })
  })

  test("rejects non-positive spans", () => {
    expect(group({ members: ["h1"], expanded: { rows: 0 } }).success).toBe(
      false,
    )
    expect(group({ members: [{ key: "h1", col_span: 0 }] }).success).toBe(false)
  })

  test("rejects a member placed outside an explicit subgrid", () => {
    expect(
      group({
        members: [{ key: "h1", col_start: 3 }],
        expanded: { cols: 2 },
      }).success,
    ).toBe(false)
    expect(
      group({
        members: [{ key: "h1", row_span: 3 }],
        expanded: { rows: 2 },
      }).success,
    ).toBe(false)
  })

  test("rejects members that need more cells than the subgrid has", () => {
    expect(
      group({
        members: ["h1", "w1", "c1"],
        expanded: { rows: 1, cols: 2 },
      }).success,
    ).toBe(false)
  })

  test("toPublicConfig gives members their monitor type", () => {
    const config = ConfigSchema.parse({
      tiles: [
        ...tiles,
        {
          type: "group",
          key: "g1",
          members: ["c1", { key: "h1", col_span: 2 }],
        },
      ],
    })
    const pub = toPublicConfig(config).tiles.find((t) => t.type === "group")
    if (pub?.type !== "group") throw new Error("expected a group")
    expect(pub.members).toEqual([
      { key: "c1", type: "container" },
      { key: "h1", type: "host", col_span: 2 },
    ])
  })
})
