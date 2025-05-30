import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"), // TODO: do we need this?
    APP: z.enum(["mon", "daemon"]),
    DATABASE_URL: z.string().url(),
    CONFIG_PATH: z.string().default("/tmp/mon/config.toml"),
  },

  clientPrefix: "NEXT_PUBLIC_",
  client: {},

  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
})
