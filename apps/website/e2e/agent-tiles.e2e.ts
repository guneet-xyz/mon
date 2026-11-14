import { spawn } from "child_process"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"
import { expect, test } from "@playwright/test"
import postgres from "postgres"

import { hashToken } from "@/lib/server/agent-auth"

import { getRuntime, writeRuntimeConfig } from "./_runtime"

const E2E_TOKEN = "e2e-test-token-32-bytes-long-here"
const AGENT_ID = "machine"
const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
)
const AGENT_BUNDLE = join(REPO_ROOT, "apps", "agent", "dist", "agent.cjs")
const WEBSITE_URL = `http://localhost:${process.env.E2E_PORT ?? "3055"}`

test("agent tiles show their machine and go offline when silent", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000)
  const runtime = getRuntime()
  const sql = postgres(runtime.databaseUrl, { onnotice: () => undefined })

  await writeRuntimeConfig(
    runtime.configPath,
    `
[agents.${AGENT_ID}]
token_hash = "${hashToken(E2E_TOKEN)}"

[[tiles]]
type = "agent"
key = "agent-live"
name = "Live Machine"
agent = "${AGENT_ID}"
col_span = 2
disks = [{ path = "/", name = "/" }]

[[tiles]]
type = "agent"
key = "agent-silent"
name = "Silent Machine"
agent = "silent"
col_span = 2
`,
  )

  // The silent machine reported once, 10 minutes ago.
  await sql`
    insert into mon_system_ping (key, agent_id, timestamp, cpu_percent, memory_bytes, memory_total_bytes, uptime_seconds, disks)
    values ('agent-silent', 'silent', now() - interval '10 minutes', 5, 1000000000, 2000000000, 3600, '[]'::jsonb)`

  const agent = spawn("bun", [AGENT_BUNDLE], {
    env: {
      ...process.env,
      CONFIG_PATH: runtime.configPath,
      WEBSITE_URL,
      AGENT_ID,
      AGENT_TOKEN: E2E_TOKEN,
      AGENT_POLL_INTERVAL_SECONDS: "5",
      NODE_ENV: "test",
    },
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  })
  agent.stderr?.on("data", (d) => process.stderr.write(`[agent:err] ${d}`))

  try {
    // CPU % needs a second report.
    await expect
      .poll(
        async () => {
          const [row] = await sql<{ ready: boolean }[]>`
            select exists (
              select 1 from mon_system_ping
              where key = 'agent-live' and cpu_percent is not null
                and jsonb_array_length(disks) = 1
            ) as ready`
          return row?.ready
        },
        { timeout: 60_000, intervals: [2_000] },
      )
      .toBe(true)

    await page.setViewportSize({ width: 1400, height: 900 })
    await page.goto("/")
    const tile = (name: string) =>
      page
        .locator("[data-flip-id]")
        .filter({ has: page.getByText(name, { exact: true }) })

    await expect(tile("Live Machine")).toContainText(
      /CPU [\d.]+% · MEM \d+% · DISK \d+%/,
      { timeout: 15_000 },
    )
    await expect(tile("Live Machine")).toContainText(/up \d/)
    await expect(
      tile("Live Machine").locator('[data-status="online"]'),
    ).toBeVisible()
    await expect(
      tile("Silent Machine").locator('[data-status="offline"]'),
    ).toBeVisible()
    await expect(tile("Silent Machine")).not.toContainText("up ")
    await testInfo.attach("board", {
      body: await page.screenshot(),
      contentType: "image/png",
    })

    await tile("Live Machine")
      .getByText("Live Machine", { exact: true })
      .click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("Disk /")).toBeVisible()
    await expect(dialog.getByText("Up for")).toBeVisible()
    await expect(dialog.getByRole("heading", { name: "Disks" })).toBeVisible()
    await expect(dialog.getByRole("heading", { name: "Memory" })).toBeVisible()
    await testInfo.attach("agent-dialog", {
      body: await page.screenshot(),
      contentType: "image/png",
    })
    await page.keyboard.press("Escape")

    // Silence shows up as an incident.
    await tile("Silent Machine")
      .getByText("Silent Machine", { exact: true })
      .click()
    await expect(
      page.getByRole("dialog").getByText("No report from the agent"),
    ).toBeVisible({ timeout: 10_000 })
  } finally {
    agent.kill("SIGTERM")
    await sql.end({ timeout: 2 })
  }
})
