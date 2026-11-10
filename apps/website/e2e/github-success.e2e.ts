import { hashToken } from "@/lib/server/agent-auth"

import { getRuntime, writeRuntimeConfig } from "./_runtime"

import { expect, test } from "@playwright/test"
import { spawn } from "child_process"
import { dirname, join, resolve } from "path"
import postgres from "postgres"
import { fileURLToPath } from "url"

interface MockServer {
  url: string
  setScenario(s: { kind: "success"; checkRuns: unknown[] }): void
  requests: Array<{ method: string; path: string }>
  stop: () => Promise<void>
}
type CreateMockGithubServer = () => Promise<MockServer>

const E2E_TOKEN = "e2e-test-token-32-bytes-long-here"
const E2E_TOKEN_HASH = hashToken(E2E_TOKEN)
const AGENT_ID = "e2e-gh-ok"

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
let mockServer: MockServer
let agentProcess: ReturnType<typeof spawn> | null = null

test.beforeAll(async () => {
  const runtime = getRuntime()
  databaseUrl = runtime.databaseUrl
  runtimeConfigPath = runtime.configPath
  sql = postgres(databaseUrl, { onnotice: () => undefined })

  const mod = await import("@mon/test-utils")
  const createMockGithubServer =
    (mod as { createMockGithubServer?: CreateMockGithubServer })
      .createMockGithubServer ??
    (mod as { default?: { createMockGithubServer?: CreateMockGithubServer } })
      .default?.createMockGithubServer
  if (!createMockGithubServer)
    throw new Error("createMockGithubServer export missing")

  mockServer = await createMockGithubServer()
  const run = (id: number, name: string, conclusion: string) => ({
    id,
    name,
    status: "completed",
    conclusion,
    details_url: `https://github.com/octocat/hello-world/runs/${id}`,
    started_at: "2026-11-10T12:00:00Z",
    completed_at: "2026-11-10T12:05:00Z",
    head_sha: "abc123def456",
  })
  mockServer.setScenario({
    kind: "success",
    checkRuns: [run(7001, "build", "success"), run(7002, "lint", "failure")],
  })

  await writeRuntimeConfig(
    runtimeConfigPath,
    `
[agents.${AGENT_ID}]
token_hash = "${E2E_TOKEN_HASH}"

[[tiles]]
type = "github"
key = "hello-world-ok"
name = "Hello World"
repo = "octocat/hello-world"
github_token = "ghp_fixture"
agent = "${AGENT_ID}"
interval_seconds = 5
`,
  )
})

test.afterAll(async () => {
  if (agentProcess) {
    agentProcess.kill("SIGTERM")
    agentProcess = null
  }
  try {
    await mockServer?.stop()
  } catch {
    // best-effort
  }
  try {
    await sql?.end({ timeout: 2 })
  } catch {
    // best-effort
  }
})

test("github success — check runs and per-run pings stored, UI shows them, no secrets", async ({
  page,
}) => {
  test.setTimeout(180_000)
  agentProcess = spawn("bun", [AGENT_BUNDLE], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      CONFIG_PATH: runtimeConfigPath,
      WEBSITE_URL,
      AGENT_ID,
      AGENT_TOKEN: E2E_TOKEN,
      AGENT_POLL_INTERVAL_SECONDS: "5",
      GITHUB_API_BASE_URL: mockServer.url,
      NODE_ENV: "test",
    },
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  })
  agentProcess.stdout?.on("data", (d) =>
    process.stdout.write(`[agent:out] ${d}`),
  )
  agentProcess.stderr?.on("data", (d) =>
    process.stderr.write(`[agent:err] ${d}`),
  )

  // Wait for two polls so repeated check-run ids are exercised too.
  let pingCount = 0
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    try {
      const rows = await sql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM mon_github_ping
        WHERE key = 'hello-world-ok' AND error IS NULL AND check_run_id IS NOT NULL`
      pingCount = rows[0]?.count ?? 0
      if (pingCount >= 4) break
    } catch {
      // table may briefly be unavailable mid-startup; retry
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  expect(
    pingCount,
    "Expected one ping per check run on two polls",
  ).toBeGreaterThanOrEqual(4)

  const runs = await sql<{ id: number; name: string }[]>`
    SELECT id::int AS id, name FROM mon_github_check_run
    WHERE id IN (7001, 7002) ORDER BY id`
  expect(runs.map((r) => r.name)).toEqual(["build", "lint"])

  const responseBodies: Promise<string>[] = []
  page.on("response", (res) => {
    responseBodies.push(res.text().catch(() => ""))
  })

  await page.goto("/")
  await page.waitForLoadState("networkidle")
  await expect(page.getByText("octocat/hello-world").first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.locator('[data-status="online"]').first()).toBeVisible({
    timeout: 10_000,
  })

  const bodies = (await Promise.all(responseBodies)).join("\n")
  // The latest-runs server action returned both check runs.
  expect(bodies).toContain("github.com/octocat/hello-world/runs/7001")
  expect(bodies).toContain("github.com/octocat/hello-world/runs/7002")
  expect(bodies).not.toContain("ghp_fixture")
  expect(bodies).not.toContain(E2E_TOKEN_HASH)

  agentProcess.kill("SIGTERM")
  agentProcess = null
})
