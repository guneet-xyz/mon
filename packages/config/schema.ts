import { createHash, timingSafeEqual } from "crypto"
import { z } from "zod/v4"

const _OptionsSchema = z.object({
  ping_interval_ms: z.number().default(6000), // Default to 5 seconds
  max_retries: z.number().default(3), // Default to 3 retries
  retry_delay_ms: z.number().default(1000), // Default to 1 second delay between retries
  default_tile: z.literal("empty").or(z.literal("hidden")).default("empty"),
  // When true, monitors listed in a group's `members` are left off the grid
  // unless they set `hidden = false`.
  hide_grouped_tiles: z.boolean().default(false),
  desktop: z
    .object({
      rows: z.number().default(8),
      columns: z.number().default(5),
    })
    .default({ rows: 8, columns: 5 }),
})

const OptionsSchema = _OptionsSchema.default(_OptionsSchema.parse({}))

const AgentSchema = z.object({
  token_hash: z.string().regex(/^[0-9a-f]{64}$/), // sha256 hex of the agent's bearer token
  description: z.string().optional(),
})

const TileSchema = z.object({
  row_start: z.number().optional(),
  row_span: z.number().optional(),
  col_start: z.number().optional(),
  col_span: z.number().optional(),
})

const KeyedTileSchema = TileSchema.extend({
  key: z.string().min(1).max(64), // stored in varchar(64) ping key columns
  name: z.string().optional(),
  icon: z.string().optional(),
  short_name: z.string().optional(),
})

const MonitorSchema = KeyedTileSchema.extend({
  hidden: z.boolean().optional(), // leave off the grid; still polled and listed in groups
  agent: z.string().default("default"), // which agent handles this tile
  interval_seconds: z.number().int().positive().optional(), // per-tile override; falls back to options.ping_interval_ms
})

const _ConfigSchema = z.object({
  options: OptionsSchema,
  agents: z.record(z.string(), AgentSchema).optional().default({}),
  tiles: z
    .array(
      z.discriminatedUnion("type", [
        MonitorSchema.extend({
          type: z.literal("host"),
          address: z.string(),
        }),
        MonitorSchema.extend({
          type: z.literal("website"),
          url: z.string(),
        }),
        MonitorSchema.extend({
          type: z.literal("container"),
          container_name: z.string(),
          docker_socket: z.string().default("unix:///var/run/docker.sock"),
        }),
        MonitorSchema.extend({
          type: z.literal("github"),
          repo: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/),
          github_token: z.string().optional(), // per-tile GitHub PAT; agent must not use env.GITHUB_TOKEN
        }),
        KeyedTileSchema.extend({
          type: z.literal("group"),
          members: z.array(z.string()).min(1), // monitor keys
        }),
        TileSchema.extend({
          type: z.literal("empty"),
          row_start: z.number(),
          row_span: z.number(),
          col_start: z.number(),
          col_span: z.number(),
        }),
        TileSchema.extend({
          type: z.literal("hidden"),
          row_start: z.number(),
          row_span: z.number(),
          col_start: z.number(),
          col_span: z.number(),
        }),
        TileSchema.extend({
          type: z.literal("logo"),
          col_start: z.number().default(1),
          row_start: z.number().default(1),
        }),
        TileSchema.extend({
          type: z.literal("theme"),
          col_start: z.number().default(-1),
          row_start: z.number().default(1),
          row_span: z.literal(1).default(1),
          col_span: z.literal(1).default(1),
        }),
      ]),
    )
    .default([]),
})

export const ConfigSchema = _ConfigSchema.superRefine((config, ctx) => {
  // Groups refer to monitors by key alone, so each member must match exactly
  // one monitor. Monitors of different types may otherwise share a key.
  const monitorCounts = new Map<string, number>()
  const groupKeys = new Set<string>()
  for (const tile of config.tiles) {
    if (isMonitorTile(tile)) {
      monitorCounts.set(tile.key, (monitorCounts.get(tile.key) ?? 0) + 1)
    }
  }

  config.tiles.forEach((tile, index) => {
    if (tile.type !== "group") return
    if (groupKeys.has(tile.key)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate group key "${tile.key}"`,
        path: ["tiles", index, "key"],
      })
    }
    groupKeys.add(tile.key)

    const seen = new Set<string>()
    tile.members.forEach((member, memberIndex) => {
      const path = ["tiles", index, "members", memberIndex]
      const count = monitorCounts.get(member) ?? 0
      if (count !== 1) {
        ctx.addIssue({
          code: "custom",
          message:
            count === 0
              ? `Group "${tile.key}" member "${member}" is not a monitor key`
              : `Group "${tile.key}" member "${member}" matches ${count} monitors; give them unique keys`,
          path,
        })
      } else if (seen.has(member)) {
        ctx.addIssue({
          code: "custom",
          message: `Group "${tile.key}" lists "${member}" more than once`,
          path,
        })
      }
      seen.add(member)
    })
  })
})

export type Config = z.infer<typeof ConfigSchema>
export type Agent = z.infer<typeof AgentSchema>
export type Tile = Config["tiles"][number]

export type NonMonitorTile = Extract<
  Config["tiles"][number],
  { type: "empty" | "hidden" | "logo" | "theme" }
>

export type GroupTile = Extract<Config["tiles"][number], { type: "group" }>

export type MonitorTile = Exclude<
  Config["tiles"][number],
  NonMonitorTile | GroupTile
>

type ExtractTileType<T extends Config["tiles"][number]["type"]> = Omit<
  Config["tiles"][number] & { type: T },
  "row_start" | "row_span" | "col_start" | "col_span" | "type"
>

export type Host = ExtractTileType<"host">
export type Container = ExtractTileType<"container">
export type Website = ExtractTileType<"website">
export type Github = ExtractTileType<"github">

// Fields that only the server and agents need. They must never reach the
// browser: github_token is a credential, the rest describe internal wiring.
const SERVER_ONLY_TILE_FIELDS = [
  "agent",
  "interval_seconds",
  "github_token",
  "docker_socket",
] as const

type ServerOnlyTileField = (typeof SERVER_ONLY_TILE_FIELDS)[number]

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never

export type PublicTile = DistributiveOmit<Tile, ServerOnlyTileField>
export type PublicMonitorTile = DistributiveOmit<
  MonitorTile,
  ServerOnlyTileField
>
export type PublicGroupTile = DistributiveOmit<GroupTile, ServerOnlyTileField>
export type PublicConfig = {
  options: Config["options"]
  tiles: PublicTile[]
}

export function toPublicTile<T extends Tile>(
  tile: T,
): DistributiveOmit<T, ServerOnlyTileField> {
  const copy: Record<string, unknown> = { ...tile }
  for (const field of SERVER_ONLY_TILE_FIELDS) delete copy[field]
  return copy as DistributiveOmit<T, ServerOnlyTileField>
}

// Strips agents (token hashes), server-only tile fields and monitors that are
// not on the grid before a config is serialized to the client.
export function toPublicConfig(config: Config): PublicConfig {
  return {
    options: config.options,
    tiles: config.tiles
      .filter((tile) => isTileOnGrid(config, tile))
      .map((tile) => toPublicTile(tile)),
  }
}

export function isMonitorTile(tile: Tile): tile is MonitorTile {
  return (
    tile.type === "host" ||
    tile.type === "website" ||
    tile.type === "container" ||
    tile.type === "github"
  )
}

export function getMonitorTiles(config: Config): MonitorTile[] {
  return config.tiles.filter(isMonitorTile)
}

export function getGroupMembers(
  config: Config,
  group: GroupTile,
): MonitorTile[] {
  const monitors = new Map(
    getMonitorTiles(config).map((tile) => [tile.key, tile]),
  )
  return group.members.flatMap((key) => monitors.get(key) ?? [])
}

// A monitor's own `hidden` wins. Otherwise grouped monitors follow
// options.hide_grouped_tiles and ungrouped ones are shown.
export function isTileOnGrid(config: Config, tile: Tile): boolean {
  if (!isMonitorTile(tile)) return true
  if (tile.hidden !== undefined) return !tile.hidden
  if (!config.options.hide_grouped_tiles) return true
  return !config.tiles.some(
    (other) => other.type === "group" && other.members.includes(tile.key),
  )
}

export function getAgentAssignments(
  config: Config,
  agentId: string,
): MonitorTile[] {
  return getMonitorTiles(config).filter((tile) => tile.agent === agentId)
}

export function verifyAgentToken(
  config: Config,
  agentId: string,
  presentedToken: string,
): boolean {
  const agent = config.agents?.[agentId]
  if (!agent) return false
  const presented = Buffer.from(
    createHash("sha256").update(presentedToken).digest("hex"),
    "hex",
  )
  const stored = Buffer.from(agent.token_hash, "hex")
  if (presented.length !== stored.length) return false
  return timingSafeEqual(presented, stored)
}
