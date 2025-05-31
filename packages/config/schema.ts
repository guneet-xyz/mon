import { z } from "zod/v4"

const HostSchema = z
  .object({
    key: z.string(),
    name: z.string().optional(),
    address: z.string(),
  })
  .pipe(
    z.transform<
      {
        key: string
        name?: string
        address: string
      },
      {
        key: string
        name: string
        address: string
      }
    >((data) => ({
      key: data.key,
      name: data.name ?? data.key,
      address: data.address,
    })),
  )

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

export const ConfigSchema = z
  .object({
    hosts: z.array(HostSchema).default([]),
    websites: z.array(WebsiteSchema).default([]),
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

export type Config = z.infer<typeof ConfigSchema>
