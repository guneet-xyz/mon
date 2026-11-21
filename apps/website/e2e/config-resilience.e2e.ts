import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test"

import { hashToken } from "@/lib/server/agent-auth"

import { getRuntime, writeRuntimeConfig } from "./_runtime"

const TOKEN = "config-resilience-agent-token-with-enough-entropy"
const SECRET = "ghp_configresiliencesecret"

const GOOD = `
[agents.default]
token_hash = "${hashToken(TOKEN)}"

[[tiles]]
type = "host"
key = "resilience-router"
name = "Resilience Router"
address = "192.0.2.40"

[[tiles]]
type = "github"
key = "resilience-repo"
name = "Resilience Repo"
repo = "owner/repo"
github_token = "${SECRET}"
`

// An unterminated string on the github_token line: smol-toml's own message
// quotes that line.
const BROKEN = GOOD.replace(`"${SECRET}"`, `"${SECRET}`)

async function jobKeys(request: APIRequestContext): Promise<string[]> {
  const res = await request.get("/api/agent/jobs", {
    headers: { Authorization: `Bearer ${TOKEN}`, "X-Agent-Id": "default" },
  })
  expect(res.status()).toBe(200)
  const body = (await res.json()) as { tiles: Array<{ id: string }> }
  return body.tiles.map((tile) => tile.id).sort()
}

async function refresh(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")))
}

test("a broken config keeps the last good board and shows a banner", async ({
  page,
  request,
}, testInfo) => {
  const { configPath } = getRuntime()
  await writeRuntimeConfig(configPath, GOOD)

  await page.goto("/")
  await expect(page.getByText("Resilience Router")).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByTestId("config-error-banner")).toHaveCount(0)
  expect(await jobKeys(request)).toEqual([
    "resilience-repo",
    "resilience-router",
  ])

  await writeRuntimeConfig(configPath, BROKEN)

  // An open board picks up the error when it next refreshes (every minute,
  // or when the tab becomes visible again).
  await refresh(page)
  await expect(page.getByTestId("config-error-banner")).toBeVisible({
    timeout: 15_000,
  })

  await page.reload()
  const banner = page.getByTestId("config-error-banner")
  await expect(banner).toBeVisible({ timeout: 15_000 })
  await expect(banner).toContainText(
    "Config error: showing the last good config.",
  )
  await expect(banner).toContainText(/Invalid TOML at line \d+, column \d+/)
  await expect(page.getByText("Resilience Router")).toBeVisible()
  expect(await page.content()).not.toContain(SECRET)
  // Agents keep their jobs from the last good config.
  expect(await jobKeys(request)).toEqual([
    "resilience-repo",
    "resilience-router",
  ])
  await testInfo.attach("broken-config", {
    body: await page.screenshot(),
    contentType: "image/png",
  })

  // Fixing the file clears the banner; a config without tiles explains itself.
  await writeRuntimeConfig(
    configPath,
    `[agents.default]\ntoken_hash = "${hashToken(TOKEN)}"\n`,
  )
  await refresh(page)
  await expect(page.getByTestId("config-error-banner")).toHaveCount(0, {
    timeout: 15_000,
  })
  await page.reload()
  await expect(page.getByTestId("empty-board")).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText("No tiles yet")).toBeVisible()
  await expect(page.getByText(configPath)).toBeVisible()
  await expect(page.getByTestId("config-error-banner")).toHaveCount(0)
  expect(await jobKeys(request)).toEqual([])
})
