import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

// Website env: config file path + DB. Used by apps/website.
export const websiteEnv = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    CONFIG_PATH: z.string().default("/etc/mon/config.toml"),
    DATABASE_URL: z.string().url(),
  },
  clientPrefix: "NEXT_PUBLIC_",
  client: {},
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
})

// Daemon env: website URL + identity. No DB, no config file, no GitHub token.
export const daemonEnv = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    WEBSITE_URL: z.string().url(),
    DAEMON_ID: z.string().min(1),
    DAEMON_TOKEN: z.string().min(32), // high-entropy bearer token
    DAEMON_POLL_INTERVAL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60),
  },
  clientPrefix: "NEXT_PUBLIC_",
  client: {},
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
})

// Backward-compat alias — existing website code imports `env` from "@mon/env"
export const env = websiteEnv
