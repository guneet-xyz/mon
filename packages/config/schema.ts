import { z } from "zod"

const HostSchema = z.object({
  key: z.string(),
  name: z.string().optional(),
  address: z.string(),
})

export type Host = z.infer<typeof HostSchema>

export const ConfigSchema = z.object({
  hosts: z.array(HostSchema).default([]),
})

export type Config = z.infer<typeof ConfigSchema>
