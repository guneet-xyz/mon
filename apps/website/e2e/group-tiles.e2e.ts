import { hashToken } from "@/lib/server/agent-auth"

import { getRuntime, writeRuntimeConfig } from "./_runtime"

import { expect, test } from "@playwright/test"
import { spawn } from "child_process"
import { dirname, join, resolve } from "path"
import postgres from "postgres"
import { fileURLToPath } from "url"

const E2E_TOKEN = "e2e-test-token-32-bytes-long-here"
const E2E_TOKEN_HASH = hashToken(E2E_TOKEN)
const AGENT_ID = "e2e"

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
)
const AGENT_BUNDLE = join(REPO_ROOT, "apps", "agent", "dist", "agent.cjs")
const E2E_PORT = process.env.E2E_PORT ?? "3055"
const WEBSITE_URL = `http://localhost:${E2E_PORT}`

let sql: ReturnType<typeof postgres>
let runtimeConfigPath: string
let databaseUrl: string
let agentProcess: ReturnType<typeof spawn> | null = null

test.beforeAll(async () => {
  const runtime = getRuntime()
  databaseUrl = runtime.databaseUrl
  runtimeConfigPath = runtime.configPath
  sql = postgres(databaseUrl, { onnotice: () => undefined })

  await writeRuntimeConfig(
    runtimeConfigPath,
    `
[options]
hide_grouped_tiles = true

[agents.${AGENT_ID}]
token_hash = "${E2E_TOKEN_HASH}"

[[tiles]]
type = "host"
key = "grp-host-hidden"
name = "Grouped Hidden Host"
address = "127.0.0.1"
agent = "${AGENT_ID}"

[[tiles]]
type = "host"
key = "grp-host-shown"
name = "Grouped Shown Host"
address = "127.0.0.2"
agent = "${AGENT_ID}"
hidden = false

[[tiles]]
type = "group"
key = "grp-e2e"
name = "E2E Group"
col_span = 2
members = ["grp-host-hidden", "grp-host-shown"]
`,
  )
})

test.afterAll(async () => {
  if (agentProcess) {
    agentProcess.kill("SIGTERM")
    agentProcess = null
  }
  try {
    await sql?.end({ timeout: 2 })
  } catch {
    // best-effort
  }
})

test("group tile sums up its members and expands into a subgrid", async ({
  page,
}) => {
  test.setTimeout(120_000)
  agentProcess = spawn("bun", [AGENT_BUNDLE], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      CONFIG_PATH: runtimeConfigPath,
      WEBSITE_URL,
      AGENT_ID,
      AGENT_TOKEN: E2E_TOKEN,
      AGENT_POLL_INTERVAL_SECONDS: "5",
      NODE_ENV: "test",
    },
    cwd: REPO_ROOT,
  })

  // Hidden monitors are still assigned to the agent.
  let keys: string[] = []
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    try {
      const rows = await sql<{ key: string }[]>`
        SELECT DISTINCT key FROM mon_host_ping
        WHERE key IN ('grp-host-hidden', 'grp-host-shown') AND error IS NULL`
      keys = rows.map((row) => row.key)
      if (keys.length === 2) break
    } catch {
      // table may briefly be unavailable mid-startup; retry
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  expect(keys.sort()).toEqual(["grp-host-hidden", "grp-host-shown"])

  await page.goto("/")
  await expect(page.getByText("E2E Group")).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText("2/2 up")).toBeVisible({ timeout: 10_000 })

  // hide_grouped_tiles leaves the grouped monitor off the grid, while
  // hidden = false keeps the other one on it.
  await expect(page.getByText("127.0.0.2")).toBeVisible()
  await expect(page.getByText("127.0.0.1")).toHaveCount(0)

  // Expanding shows the member tiles in place, including the hidden one.
  await page.getByRole("button", { name: "Expand E2E Group" }).click()
  const group = page.getByTestId("expanded-group")
  await expect(group).toBeVisible()
  await expect(group.getByText("127.0.0.1")).toBeVisible({ timeout: 10_000 })
  await expect(group.getByText("127.0.0.2")).toBeVisible()
  await expect(group.locator('[data-status="online"]')).toHaveCount(3)

  // Members open their own monitor dialog.
  await group.getByText("127.0.0.1").click()
  await expect(
    page.getByRole("dialog").filter({ hasText: "Latency" }),
  ).toContainText("grp-host-hidden")
  await page.keyboard.press("Escape")

  // The expanded state survives a reload, and so does collapsing it.
  await page.reload()
  await expect(page.getByTestId("expanded-group")).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole("button", { name: "Collapse E2E Group" }).click()
  await expect(page.getByTestId("expanded-group")).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole("button", { name: "Expand E2E Group" }),
  ).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId("expanded-group")).toHaveCount(0)

  agentProcess.kill("SIGTERM")
  agentProcess = null
})

test("theme choice survives a reload", async ({ page }) => {
  await writeRuntimeConfig(runtimeConfigPath, `[[tiles]]\ntype = "theme"\n`)
  await page.emulateMedia({ colorScheme: "light" })
  await page.goto("/")
  await page.getByRole("button", { name: "Switch to dark theme" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)

  await page.reload()
  await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 10_000 })
  await page.getByRole("button", { name: "Switch to light theme" }).click()
  await expect(page.locator("html")).not.toHaveClass(/dark/)

  await page.reload()
  await expect(
    page.getByRole("button", { name: "Switch to dark theme" }),
  ).toBeVisible({ timeout: 10_000 })
  await expect(page.locator("html")).not.toHaveClass(/dark/)
})
