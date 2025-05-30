import { type Config } from "drizzle-kit";

import { env } from "@mon/env";

export default {
  schema: "./src/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  tablesFilter: ["wall_*"],
} satisfies Config;
