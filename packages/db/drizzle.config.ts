import { env } from "@mon/env"

import { type Config } from "drizzle-kit"

export default {
  schema: "./schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  tablesFilter: ["mon_*"],
} satisfies Config
