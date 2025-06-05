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
})

export const ConfigSchema = z.object({
  options: OptionsSchema,
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
      TileSchema.extend({
        type: z.literal("empty"),
      }),
      TileSchema.extend({
        type: z.literal("hidden"),
      }),
    ]),
  ),
})

export type Config = z.infer<typeof ConfigSchema>

export type Monitor = Exclude<
  Config["tiles"][number],
  { type: "empty" | "hidden" }
>

type ExtractTileType<T extends Config["tiles"][number]["type"]> = Omit<
  Config["tiles"][number] & { type: T },
  "row_start" | "row_span" | "col_start" | "col_span" | "type"
>

export type Host = ExtractTileType<"host">
export type Container = ExtractTileType<"container">
export type Website = ExtractTileType<"website">
