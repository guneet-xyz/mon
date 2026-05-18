import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false, // e2e tests need ordering for DB setup
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      CONFIG_PATH: process.env.TEST_CONFIG_PATH ?? "/tmp/mon-test-config.toml",
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgres://postgres:test@localhost:5432/mon_test",
      SKIP_ENV_VALIDATION: "1",
    },
  },
})
