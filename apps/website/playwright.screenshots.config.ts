import { defineConfig, devices } from "@playwright/test"

import baseConfig from "./playwright.config"

// The screenshot tour: captures the board for visual review (the product
// owner agent, PR reviewers). Run with `bun run screenshots`; it is not part
// of the E2E suite.
export default defineConfig({
  ...baseConfig,
  testDir: "./e2e",
  testMatch: "**/*.tour.ts",
  retries: 0,
  reporter: "list",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
