import { hashToken } from "@/lib/server/agent-auth"

import { getRuntime } from "./_runtime"

import { expect, test } from "@playwright/test"
import { spawn } from "child_process"
import { writeFileSync } from "fs"
import { dirname, join, resolve } from "path"
import postgres from "postgres"
import { fileURLToPath } from "url"

interface MockServer {
  url: string
  setScenario(s: { kind: "http_error"; status: 500 | 502 | 503 }): void
  requests: Array<{ method: string; path: string }>
  stop: () => Promise<void>
}
type CreateMockGithubServer = () => Promise<MockServer>

const E2E_TOKEN = "e2e-test-token-32-bytes-long-here"
const E2E_TOKEN_HASH = hashToken(E2E_TOKEN)
const AGENT_ID = "e2e-gh"

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
  mockServer.setScenario({ kind: "http_error", status: 503 })

  writeFileSync(
    runtimeConfigPath,
    `
[agents.${AGENT_ID}]
token_hash = "${E2E_TOKEN_HASH}"

[[tiles]]
type = "github"
key = "hello-world"
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

test("github API 5xx — error row in DB, UI renders tile, mock received request", async ({
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

  let errorRow: { error: string | null } | undefined
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    try {
      const rows = await sql<
        { error: string | null }[]
      >`SELECT error FROM mon_github_ping WHERE key = 'github:octocat/hello-world' AND error IS NOT NULL LIMIT 1`
      if (rows.length > 0) {
        errorRow = rows[0]
        break
      }
    } catch {
      // table may briefly be unavailable mid-startup; retry
    }
    await new Promise((r) => setTimeout(r, 2000))
  }

  expect(errorRow, "Expected a github_ping error row within 90s").toBeDefined()
  expect(errorRow?.error).toContain("503")

  await page.goto("/")
  await page.waitForLoadState("networkidle")
  await expect(page.getByText("octocat/hello-world").first()).toBeVisible({
    timeout: 30_000,
  })

  expect(mockServer.requests.length).toBeGreaterThanOrEqual(1)

  agentProcess.kill("SIGTERM")
  agentProcess = null
})
