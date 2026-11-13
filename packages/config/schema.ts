import { createHash, timingSafeEqual } from "crypto"
import { z } from "zod/v4"

const _OptionsSchema = z.object({
  ping_interval_ms: z.number().default(6000), // Default to 5 seconds
  max_retries: z.number().default(3), // Default to 3 retries
  retry_delay_ms: z.number().default(1000), // Default to 1 second delay between retries
  default_tile: z.literal("empty").or(z.literal("hidden")).default("empty"),
  // When true, monitors and groups listed in a group's `members` are left off
  // the grid unless they set `hidden = false`.
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

const SpanSchema = z.number().int().positive()

// A member is a monitor or group key, optionally with its placement in the
// group's expanded subgrid. Bare keys are normalized to `{ key }`.
const GroupMemberSchema = z
  .union([
    z.string(),
    z.object({
      key: z.string(),
      row_start: z.number().int().optional(),
      row_span: SpanSchema.optional(),
      col_start: z.number().int().optional(),
      col_span: SpanSchema.optional(),
    }),
  ])
  .transform(
    (
      member,
    ): {
      key: string
      row_start?: number
      row_span?: number
      col_start?: number
      col_span?: number
    } => (typeof member === "string" ? { key: member } : member),
  )

// Size of an expanded group: row_span/col_span in cells of the grid it sits
// in, and the rows x cols subgrid its members are laid out in. Unset values
// are derived from the members by the website: the group takes the size its
// members need, within min_*/max_*, growing as nested groups expand inside it.
const GroupExpandedSchema = z.object({
  row_span: SpanSchema.optional(),
  col_span: SpanSchema.optional(),
  rows: SpanSchema.optional(),
  cols: SpanSchema.optional(),
  min_row_span: SpanSchema.optional(),
  min_col_span: SpanSchema.optional(),
  max_row_span: SpanSchema.optional(),
  max_col_span: SpanSchema.optional(),
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
          members: z.array(GroupMemberSchema).min(1),
          expanded: GroupExpandedSchema.optional(),
          // Until a browser toggles the group, after which it remembers.
          initial_state: z.enum(["collapsed", "expanded"]).default("collapsed"),
          hidden: z.boolean().optional(), // leave off the grid; still listed in groups
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
  // Groups refer to members by key alone, so each member must match exactly
  // one monitor or group. Tiles may otherwise share a key.
  const keyCounts = new Map<string, number>()
  const groupKeys = new Set<string>()
  for (const tile of config.tiles) {
    if (isMonitorTile(tile) || tile.type === "group") {
      keyCounts.set(tile.key, (keyCounts.get(tile.key) ?? 0) + 1)
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
    tile.members.forEach(({ key }, memberIndex) => {
      const path = ["tiles", index, "members", memberIndex]
      const count = keyCounts.get(key) ?? 0
      if (count !== 1) {
        ctx.addIssue({
          code: "custom",
          message:
            count === 0
              ? `Group "${tile.key}" member "${key}" is not a monitor or group key`
              : `Group "${tile.key}" member "${key}" matches ${count} tiles; give them unique keys`,
          path,
        })
      } else if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `Group "${tile.key}" lists "${key}" more than once`,
          path,
        })
      }
      seen.add(key)
    })

    // An explicit subgrid dimension must hold every member placed along it.
    const { rows, cols } = tile.expanded ?? {}
    const fits = (start: number | undefined, span = 1, size?: number) =>
      size === undefined ||
      (span <= size &&
        (start === undefined || Math.abs(start) + span - 1 <= size))
    tile.members.forEach((member, memberIndex) => {
      if (
        !fits(member.row_start, member.row_span, rows) ||
        !fits(member.col_start, member.col_span, cols)
      ) {
        ctx.addIssue({
          code: "custom",
          message: `Group "${tile.key}" member "${member.key}" does not fit its ${rows ?? "auto"} x ${cols ?? "auto"} subgrid`,
          path: ["tiles", index, "members", memberIndex],
        })
      }
    })
    const expanded = tile.expanded ?? {}
    for (const dim of ["row", "col"] as const) {
      const min = expanded[`min_${dim}_span`]
      const max = expanded[`max_${dim}_span`]
      if (min !== undefined && max !== undefined && min > max) {
        ctx.addIssue({
          code: "custom",
          message: `Group "${tile.key}" has min_${dim}_span ${min} above max_${dim}_span ${max}`,
          path: ["tiles", index, "expanded"],
        })
      }
    }
    if (rows !== undefined && cols !== undefined) {
      const area = tile.members.reduce(
        (sum, member) => sum + (member.row_span ?? 1) * (member.col_span ?? 1),
        0,
      )
      if (area > rows * cols) {
        ctx.addIssue({
          code: "custom",
          message: `Group "${tile.key}" members need ${area} cells but its subgrid has ${rows * cols}`,
          path: ["tiles", index, "expanded"],
        })
      }
    }
  })

  // Groups may contain groups, but never themselves.
  const children = new Map<string, string[]>()
  for (const tile of config.tiles) {
    if (tile.type === "group") {
      children.set(
        tile.key,
        tile.members
          .map((member) => member.key)
          .filter((k) => groupKeys.has(k)),
      )
    }
  }
  const done = new Set<string>()
  const visit = (key: string, path: string[]): void => {
    if (path.includes(key)) {
      ctx.addIssue({
        code: "custom",
        message: `Groups contain each other: ${[...path.slice(path.indexOf(key)), key].join(" -> ")}`,
        path: ["tiles"],
      })
      return
    }
    if (done.has(key)) return
    for (const child of children.get(key) ?? []) visit(child, [...path, key])
    done.add(key)
  }
  for (const key of children.keys()) visit(key, [])
})

export type Config = z.infer<typeof ConfigSchema>
export type Agent = z.infer<typeof AgentSchema>
export type Tile = Config["tiles"][number]

export type NonMonitorTile = Extract<
  Config["tiles"][number],
  { type: "empty" | "hidden" | "logo" | "theme" }
>

export type GroupTile = Extract<Config["tiles"][number], { type: "group" }>
export type GroupMember = GroupTile["members"][number]

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

export type PublicGroupMember = GroupMember & {
  type: MonitorTile["type"] | "group"
}
export type PublicGroupTile = Omit<
  DistributiveOmit<GroupTile, ServerOnlyTileField>,
  "members"
> & { members: PublicGroupMember[] }
export type PublicTile =
  | DistributiveOmit<Exclude<Tile, GroupTile>, ServerOnlyTileField>
  | PublicGroupTile
export type PublicMonitorTile = DistributiveOmit<
  MonitorTile,
  ServerOnlyTileField
>
export type PublicConfig = {
  options: Config["options"]
  tiles: PublicTile[]
  // Every group by key, including nested groups that are not on the grid.
  groups: Record<string, PublicGroupTile>
}

export function toPublicTile<T extends Tile>(
  tile: T,
): DistributiveOmit<T, ServerOnlyTileField> {
  const copy: Record<string, unknown> = { ...tile }
  for (const field of SERVER_ONLY_TILE_FIELDS) delete copy[field]
  return copy as DistributiveOmit<T, ServerOnlyTileField>
}

// Strips agents (token hashes), server-only tile fields and tiles that are
// not on the grid before a config is serialized to the client. Group members
// carry their tile's type so the client can render them in a subgrid.
export function toPublicConfig(config: Config): PublicConfig {
  const types = new Map<string, PublicGroupMember["type"]>()
  for (const tile of config.tiles) {
    if (isMonitorTile(tile) || tile.type === "group") {
      types.set(tile.key, tile.type)
    }
  }
  const toPublicGroup = (tile: GroupTile): PublicGroupTile => ({
    ...toPublicTile(tile),
    members: tile.members.flatMap((member) => {
      const type = types.get(member.key)
      return type ? [{ ...member, type }] : []
    }),
  })
  const groups: Record<string, PublicGroupTile> = {}
  for (const tile of config.tiles) {
    if (tile.type === "group") groups[tile.key] = toPublicGroup(tile)
  }
  return {
    options: config.options,
    tiles: config.tiles
      .filter((tile) => isTileOnGrid(config, tile))
      .map((tile): PublicTile =>
        tile.type === "group" ? toPublicGroup(tile) : toPublicTile(tile),
      ),
    groups,
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

// The monitors and nested groups a group lists, in member order.
export function getGroupMembers(
  config: Config,
  group: GroupTile,
): Array<MonitorTile | GroupTile> {
  const tiles = new Map<string, MonitorTile | GroupTile>()
  for (const tile of config.tiles) {
    if (isMonitorTile(tile) || tile.type === "group") tiles.set(tile.key, tile)
  }
  return group.members.flatMap(({ key }) => tiles.get(key) ?? [])
}

// A monitor's or group's own `hidden` wins. Otherwise tiles that belong to a
// group follow options.hide_grouped_tiles and the rest are shown.
export function isTileOnGrid(config: Config, tile: Tile): boolean {
  if (!isMonitorTile(tile) && tile.type !== "group") return true
  if (tile.hidden !== undefined) return !tile.hidden
  if (!config.options.hide_grouped_tiles) return true
  return !config.tiles.some(
    (other) =>
      other.type === "group" &&
      other.members.some((member) => member.key === tile.key),
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
