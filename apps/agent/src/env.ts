import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    WEBSITE_URL: z.string().url(),
    AGENT_ID: z.string().min(1),
    AGENT_TOKEN: z.string().min(32),
    AGENT_POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
    GITHUB_API_BASE_URL: z.string().url().optional(),
  },
  clientPrefix: "NEXT_PUBLIC_",
  client: {},
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
})
