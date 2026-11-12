import { spawn } from "child_process"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"
import { expect, test } from "@playwright/test"
import postgres from "postgres"

import { hashToken } from "@/lib/server/agent-auth"

import { getRuntime, writeRuntimeConfig } from "./_runtime"

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

test("groups expand in place with an animation", async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  const hosts = Array.from(
    { length: 9 },
    (_, i) => `
[[tiles]]
type = "host"
key = "anim-host-${i}"
address = "192.0.2.${i + 10}"
`,
  ).join("")
  await writeRuntimeConfig(
    runtimeConfigPath,
    `
[options]
hide_grouped_tiles = true
${hosts}
[[tiles]]
type = "group"
key = "anim-group"
name = "Anim Group"
members = ["anim-host-0", "anim-host-1", "anim-host-2", "anim-host-3"]
`,
  )
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto("/")
  const collapsed = page.getByRole("button", { name: "Expand Anim Group" })
  await expect(collapsed).toBeVisible({ timeout: 10_000 })
  const before = (await collapsed.boundingBox())!
  const otherTiles = async () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-flip-id]"))
        .filter((el) => el.dataset.flipId?.startsWith("host:"))
        .map((el) => {
          const r = el.getBoundingClientRect()
          return `${el.dataset.flipId} ${Math.round(r.x)},${Math.round(r.y)}`
        }),
    )
  const positionsBefore = await otherTiles()

  // Slow animations down so the screenshots show the transition.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Animation.enable")
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 })
  await collapsed.click()
  const scripted = () =>
    page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (a) =>
              !(a instanceof CSSAnimation) && !(a instanceof CSSTransition),
          ).length,
    )
  expect(await scripted()).toBeGreaterThan(0)
  for (const step of [1, 2, 3]) {
    await page.waitForTimeout(800)
    await testInfo.attach(`expanding-${step}`, {
      body: await page.screenshot(),
      contentType: "image/png",
    })
  }
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })

  const group = page.getByTestId("expanded-group")
  await expect(group).toBeVisible()
  await expect.poll(scripted).toBe(0)
  await testInfo.attach("expanded", {
    body: await page.screenshot(),
    contentType: "image/png",
  })

  // In place: the expanded group covers the collapsed tile's centre.
  const after = (await group.boundingBox())!
  const cx = before.x + before.width / 2
  const cy = before.y + before.height / 2
  expect(cx).toBeGreaterThan(after.x)
  expect(cx).toBeLessThan(after.x + after.width)
  expect(cy).toBeGreaterThan(after.y)
  expect(cy).toBeLessThan(after.y + after.height)

  // Only the tiles the group now covers move.
  const positionsAfter = await otherTiles()
  const moved = positionsAfter.filter((p) => !positionsBefore.includes(p))
  expect(moved.length).toBeLessThanOrEqual(3)

  // Reduced motion turns the animation off.
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.getByRole("button", { name: "Collapse Anim Group" }).click()
  await expect(collapsed).toBeVisible()
  expect(await scripted()).toBe(0)
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
