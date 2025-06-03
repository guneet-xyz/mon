import { z } from "zod/v4"

const _OptionsSchema = z.object({
  ping_interval_ms: z.number().default(6000), // Default to 5 seconds
  max_retries: z.number().default(3), // Default to 3 retries
  retry_delay_ms: z.number().default(1000), // Default to 1 second delay between retries
  desktop: z
    .object({
      rows: z.number().default(8),
      columns: z.number().default(5),
    })
    .default({ rows: 8, columns: 5 }),
})

const OptionsSchema = _OptionsSchema.default(_OptionsSchema.parse({}))

const HostSchema = z.object({
  key: z.string(),
  name: z.string().optional(),
  address: z.string(),
  row_start: z.number().optional(),
  row_span: z.number().optional(),
  col_start: z.number().optional(),
  col_span: z.number().optional(),
})

export type Host = z.infer<typeof HostSchema>

export const WebsiteSchema = z
  .object({
    key: z.string(),
    name: z.string().optional(),
    url: z.string(),
  })
  .pipe(
    z.transform<
      {
        key: string
        name?: string
        url: string
      },
      {
        key: string
        name: string
        url: string
      }
    >((data) => ({
      key: data.key,
      name: data.name ?? data.key,
      url: data.url,
    })),
  )

export type Website = z.infer<typeof WebsiteSchema>

export const ContainerSchema = z
  .object({
    key: z.string(),
    name: z.string().optional(),
    container_name: z.string(),
  })
  .pipe(
    z.transform<
      {
        key: string
        name?: string
        container_name: string
      },
      {
        key: string
        name: string
        container_name: string
      }
    >((data) => ({
      key: data.key,
      name: data.name ?? data.key,
      container_name: data.container_name,
    })),
  )

export type Container = z.infer<typeof ContainerSchema>

export const ConfigSchema = z
  .object({
    options: OptionsSchema,
    hosts: z.array(HostSchema).default([]),
    websites: z.array(WebsiteSchema).default([]),
    containers: z.array(ContainerSchema).default([]),
  })
  .refine(
    (config) =>
      config.hosts.map((h) => h.key).length ===
      new Set(config.hosts.map((h) => h.key)).size,
    {
      error: "Duplicate keys for host",
    },
  )
  .refine(
    (config) =>
      config.websites.map((w) => w.key).length ===
      new Set(config.websites.map((w) => w.key)).size,
    {
      error: "Duplicate keys for website",
    },
  )
  .refine(
    (config) =>
      config.containers.map((c) => c.key).length ===
      new Set(config.containers.map((c) => c.key)).size,
    {
      error: "Duplicate keys for container",
    },
  )

export type Config = z.infer<typeof ConfigSchema>
