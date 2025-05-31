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
