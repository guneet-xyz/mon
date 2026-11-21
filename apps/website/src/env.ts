import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    CONFIG_PATH: z.string().default("/etc/mon/config.toml"),
    DATABASE_URL: z.string().url(),
    // Notification channels (secrets). Each can also be read from a file.
    NTFY_URL: z.string().optional(),
    NTFY_URL_FILE: z.string().optional(),
    NTFY_TOKEN: z.string().optional(),
    NTFY_TOKEN_FILE: z.string().optional(),
    WEBHOOK_URL: z.string().optional(),
    WEBHOOK_URL_FILE: z.string().optional(),
  },
  client: {},
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    CONFIG_PATH: process.env.CONFIG_PATH,
    DATABASE_URL: process.env.DATABASE_URL,
    NTFY_URL: process.env.NTFY_URL,
    NTFY_URL_FILE: process.env.NTFY_URL_FILE,
    NTFY_TOKEN: process.env.NTFY_TOKEN,
    NTFY_TOKEN_FILE: process.env.NTFY_TOKEN_FILE,
    WEBHOOK_URL: process.env.WEBHOOK_URL,
    WEBHOOK_URL_FILE: process.env.WEBHOOK_URL_FILE,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
})
