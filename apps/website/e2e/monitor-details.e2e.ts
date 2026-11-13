import { execSync, spawn } from "child_process"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"
import { expect, test } from "@playwright/test"
import postgres from "postgres"

import { hashToken } from "@/lib/server/agent-auth"

import { getRuntime, writeRuntimeConfig } from "./_runtime"

const E2E_TOKEN = "e2e-test-token-32-bytes-long-here"
const AGENT_ID = "details"
const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
)
const AGENT_BUNDLE = join(REPO_ROOT, "apps", "agent", "dist", "agent.cjs")
const WEBSITE_URL = `http://localhost:${process.env.E2E_PORT ?? "3055"}`
const HEALTHY = "mon-e2e-healthy"
const UNHEALTHY = "mon-e2e-unhealthy"

interface MockHttpHost {
  url: string
  stop: () => Promise<void>
}

function docker(command: string) {
  execSync(`docker ${command}`, { stdio: "pipe" })
}

function removeContainers() {
  for (const name of [HEALTHY, UNHEALTHY]) {
    try {
      docker(`rm -f ${name}`)
    } catch {
      // not running
    }
  }
}

test("monitors record and show details", async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const runtime = getRuntime()
  const sql = postgres(runtime.databaseUrl, { onnotice: () => undefined })

  const mod = await import("@mon/test-utils")
  const createMockHttpHost = (
    mod as {
      createMockHttpHost?: (opts?: { port?: number }) => Promise<MockHttpHost>
    }
  ).createMockHttpHost
  if (!createMockHttpHost) throw new Error("createMockHttpHost missing")
  const site = await createMockHttpHost({ port: 39081 })

  removeContainers()
  docker(
    `run -d --name ${HEALTHY} --health-cmd true --health-interval 2s busybox sleep 600`,
  )
  docker(
    `run -d --name ${UNHEALTHY} --health-cmd false --health-interval 2s --health-retries 1 busybox sleep 600`,
  )

  await writeRuntimeConfig(
    runtime.configPath,
    `
[agents.${AGENT_ID}]
token_hash = "${hashToken(E2E_TOKEN)}"

[[tiles]]
type = "host"
key = "details-host"
name = "Details Host"
address = "127.0.0.1"
agent = "${AGENT_ID}"
col_span = 2

[[tiles]]
type = "website"
key = "details-site"
name = "Details Site"
url = "${site.url}/"
agent = "${AGENT_ID}"
col_span = 2

[[tiles]]
type = "container"
key = "details-healthy"
name = "Healthy Box"
container_name = "${HEALTHY}"
agent = "${AGENT_ID}"
col_span = 2

[[tiles]]
type = "container"
key = "details-unhealthy"
name = "Unhealthy Box"
container_name = "${UNHEALTHY}"
agent = "${AGENT_ID}"
col_span = 2
`,
  )

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
    // CPU % needs two samples, so wait for a second container poll, and for
    // the unhealthy container's health check to fail.
    await expect
      .poll(
        async () => {
          const [row] = await sql<{ ready: boolean }[]>`
            select
              exists (select 1 from mon_container_ping where key = 'details-healthy' and cpu_percent is not null)
              and exists (select 1 from mon_container_ping where key = 'details-unhealthy' and health = 'unhealthy')
              and exists (select 1 from mon_website_ping where key = 'details-site' and status_code = 200)
              and exists (select 1 from mon_host_ping where key = 'details-host' and latency is not null)
              as ready`
          return row?.ready
        },
        { timeout: 90_000, intervals: [2_000] },
      )
      .toBe(true)

    await page.setViewportSize({ width: 1400, height: 900 })
    await page.goto("/")

    // Tiles show their current value.
    // Match the exact name: "Healthy Box" is a substring of "Unhealthy Box".
    const tile = (name: string) =>
      page
        .locator("[data-flip-id]")
        .filter({ has: page.getByText(name, { exact: true }) })
    await expect(tile("Details Host")).toContainText(/\d+ ms/, {
      timeout: 15_000,
    })
    await expect(tile("Details Site")).toContainText(/\d+ ms/)
    await expect(tile("Healthy Box")).toContainText(
      /\d+(\.\d)?% · [\d.]+ [KMG]?B/,
    )
    await expect(tile("Healthy Box").getByTestId("tile-warning")).toHaveCount(0)
    await expect(
      tile("Unhealthy Box").getByTestId("tile-warning"),
    ).toHaveAttribute("aria-label", /Health check failing/)

    await testInfo.attach("board", {
      body: await page.screenshot(),
      contentType: "image/png",
    })

    // The container dialog summarises its state and charts its history.
    await tile("Healthy Box").getByText("Healthy Box", { exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("health: healthy")).toBeVisible()
    await expect(dialog.getByText("Up for")).toBeVisible()
    await expect(dialog.getByText("busybox", { exact: true })).toBeVisible()
    await expect(dialog.getByRole("heading", { name: "CPU" })).toBeVisible()
    await expect(dialog.getByRole("heading", { name: "Memory" })).toBeVisible()
    await testInfo.attach("container-dialog", {
      body: await page.screenshot(),
      contentType: "image/png",
    })
    await expect(dialog.getByText("100%").first()).toBeVisible()
    await dialog.getByRole("button", { name: "7 d" }).click()
    await expect(dialog.getByRole("button", { name: "7 d" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await expect(
      dialog.getByText("No incidents in the last 7 days."),
    ).toBeVisible()
    await page.keyboard.press("Escape")

    // The unhealthy container lists its warning in the dialog.
    await tile("Unhealthy Box")
      .getByText("Unhealthy Box", { exact: true })
      .click()
    await expect(page.getByTestId("monitor-warnings")).toContainText(
      "Health check failing",
    )
    await page.keyboard.press("Escape")

    // The website dialog shows the status code of the latest check.
    await tile("Details Site")
      .getByText("Details Site", { exact: true })
      .click()
    await expect(
      page.getByRole("dialog").getByText("HTTP status"),
    ).toBeVisible()
    await expect(
      page.getByRole("dialog").getByText("200", { exact: true }),
    ).toBeVisible()
  } finally {
    agent.kill("SIGTERM")
    removeContainers()
    await site.stop()
    await sql.end({ timeout: 2 })
  }
})
