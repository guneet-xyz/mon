import { z } from "zod"

export const ConfigSchema = z.object({
  hosts: z
    .array(
      z.object({
        name: z.string(),
        address: z.string(),
      }),
    )
    .default([]),
})
