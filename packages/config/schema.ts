import { createHash, timingSafeEqual } from "crypto"
import { z } from "zod/v4"

const _OptionsSchema = z.object({
  ping_interval_ms: z.number().default(6000), // Default to 5 seconds
  max_retries: z.number().default(3), // Default to 3 retries
  retry_delay_ms: z.number().default(1000), // Default to 1 second delay between retries
  default_tile: z.literal("empty").or(z.literal("hidden")).default("empty"),
  desktop: z
    .object({
      rows: z.number().default(8),
      columns: z.number().default(5),
    })
    .default({ rows: 8, columns: 5 }),
})

const OptionsSchema = _OptionsSchema.default(_OptionsSchema.parse({}))

const DaemonSchema = z.object({
  token_hash: z.string().regex(/^[0-9a-f]{64}$/), // sha256 hex of the daemon's bearer token
  description: z.string().optional(),
})

const TileSchema = z.object({
  row_start: z.number().optional(),
  row_span: z.number().optional(),
  col_start: z.number().optional(),
  col_span: z.number().optional(),
})

const MonitorSchema = TileSchema.extend({
  key: z.string(),
  name: z.string().optional(),
  icon: z.string().optional(),
  short_name: z.string().optional(),
  daemon: z.string().default("default"), // which daemon handles this tile
  interval_seconds: z.number().int().positive().optional(), // per-tile override; falls back to options.ping_interval_ms
})

export const ConfigSchema = z.object({
  options: OptionsSchema,
  daemons: z.record(z.string(), DaemonSchema).optional().default({}),
  tiles: z.array(
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
        github_token: z.string().optional(), // per-tile GitHub PAT; daemon must not use env.GITHUB_TOKEN
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
  ),
})

export type Config = z.infer<typeof ConfigSchema>
export type Daemon = z.infer<typeof DaemonSchema>
export type Tile = Config["tiles"][number]

export type NonMonitorTile = Extract<
  Config["tiles"][number],
  { type: "empty" | "hidden" | "logo" | "theme" }
>

export type MonitorTile = Exclude<Config["tiles"][number], NonMonitorTile>

type ExtractTileType<T extends Config["tiles"][number]["type"]> = Omit<
  Config["tiles"][number] & { type: T },
  "row_start" | "row_span" | "col_start" | "col_span" | "type"
>

export type Host = ExtractTileType<"host">
export type Container = ExtractTileType<"container">
export type Website = ExtractTileType<"website">
export type Github = ExtractTileType<"github">

export function getDaemonAssignments(
  config: Config,
  daemonId: string,
): MonitorTile[] {
  return config.tiles.filter(
    (tile): tile is MonitorTile =>
      tile.type !== "empty" &&
      tile.type !== "hidden" &&
      tile.type !== "logo" &&
      tile.type !== "theme" &&
      tile.daemon === daemonId,
  )
}

export function verifyDaemonToken(
  config: Config,
  daemonId: string,
  presentedToken: string,
): boolean {
  const daemon = config.daemons?.[daemonId]
  if (!daemon) return false
  const presented = Buffer.from(
    createHash("sha256").update(presentedToken).digest("hex"),
    "hex",
  )
  const stored = Buffer.from(daemon.token_hash, "hex")
  if (presented.length !== stored.length) return false
  return timingSafeEqual(presented, stored)
}
