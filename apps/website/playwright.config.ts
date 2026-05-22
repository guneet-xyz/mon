import { defineConfig, devices } from "@playwright/test"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const HERE = dirname(fileURLToPath(import.meta.url))
const RUNTIME_FILE = join(HERE, ".e2e-runtime.json")

const E2E_PORT = process.env.E2E_PORT ?? "3055"
const BASE_URL = `http://localhost:${E2E_PORT}`

const runtimeEnv: Record<string, string> = {}
try {
  const raw = readFileSync(RUNTIME_FILE, "utf8")
  const runtime = JSON.parse(raw) as {
    databaseUrl?: string
    configPath?: string
  }
  if (runtime.databaseUrl) runtimeEnv.DATABASE_URL = runtime.databaseUrl
  if (runtime.configPath) runtimeEnv.CONFIG_PATH = runtime.configPath
} catch {
  // .e2e-runtime.json absent → invoked outside `bun run e2e`
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false, // e2e tests need ordering for DB setup
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `bun run dev -- --port ${E2E_PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "test",
      SKIP_ENV_VALIDATION: "1",
      ...runtimeEnv,
    },
  },
})
