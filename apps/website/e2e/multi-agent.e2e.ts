import { hashToken } from "@/lib/server/agent-auth"

import { getRuntime } from "./_runtime"

import { expect, test } from "@playwright/test"
import { spawn } from "child_process"
import { writeFileSync } from "fs"
import { dirname, join, resolve } from "path"
import postgres from "postgres"
import { fileURLToPath } from "url"

interface MockGithubServer {
  url: string
  setScenario(s: { kind: "success"; checkRuns: unknown[] }): void
  requests: Array<{ method: string; path: string }>
  stop: () => Promise<void>
}
interface MockHttpHost {
  url: string
  setScenario(s: { kind: "ok"; status: 200; body?: string }): void
  requests: Array<{ method: string; path: string }>
  stop: () => Promise<void>
}
type CreateMockGithubServer = () => Promise<MockGithubServer>
type CreateMockHttpHost = () => Promise<MockHttpHost>

const AGENT1_ID = "agent1"
const AGENT2_ID = "agent2"
const AGENT1_TOKEN = "e2e-multi-agent1-token-32-bytes-x"
const AGENT2_TOKEN = "e2e-multi-agent2-token-32-bytes-x"
const AGENT1_TOKEN_HASH = hashToken(AGENT1_TOKEN)
const AGENT2_TOKEN_HASH = hashToken(AGENT2_TOKEN)

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
let mockGithub: MockGithubServer
let mockHttp: MockHttpHost
let agent1Process: ReturnType<typeof spawn> | null = null
let agent2Process: ReturnType<typeof spawn> | null = null

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
  const createMockHttpHost =
    (mod as { createMockHttpHost?: CreateMockHttpHost }).createMockHttpHost ??
    (mod as { default?: { createMockHttpHost?: CreateMockHttpHost } }).default
      ?.createMockHttpHost
  if (!createMockGithubServer)
    throw new Error("createMockGithubServer export missing")
  if (!createMockHttpHost) throw new Error("createMockHttpHost export missing")

  mockGithub = await createMockGithubServer()
  mockGithub.setScenario({ kind: "success", checkRuns: [] })
  mockHttp = await createMockHttpHost()
  mockHttp.setScenario({ kind: "ok", status: 200 })

  const mockHttpUrl = new URL(mockHttp.url)

  writeFileSync(
    runtimeConfigPath,
    `
[agents.${AGENT1_ID}]
token_hash = "${AGENT1_TOKEN_HASH}"

[agents.${AGENT2_ID}]
token_hash = "${AGENT2_TOKEN_HASH}"

[[tiles]]
type = "host"
key = "host1"
name = "Host 1"
address = "${mockHttpUrl.hostname}"
agent = "${AGENT1_ID}"
interval_seconds = 5
row_span = 2
col_span = 2

[[tiles]]
type = "website"
key = "site1"
name = "Site 1"
url = "${mockHttp.url}"
agent = "${AGENT1_ID}"
interval_seconds = 5
row_span = 2
col_span = 2

[[tiles]]
type = "container"
key = "container1"
name = "Container 1"
container_name = "app-container"
agent = "${AGENT2_ID}"
interval_seconds = 5
row_span = 2
col_span = 2

[[tiles]]
type = "github"
key = "repo1"
name = "Repo 1"
repo = "user/repo"
github_token = "ghp_fixture"
agent = "${AGENT2_ID}"
interval_seconds = 5
row_span = 2
col_span = 2
`,
  )

  await new Promise((r) => setTimeout(r, 6000))

  try {
    await fetch(`${WEBSITE_URL}/api/agent/jobs`, {
      headers: {
        "X-Agent-Id": AGENT1_ID,
        Authorization: `Bearer ${AGENT1_TOKEN}`,
      },
    })
  } catch {
    // best-effort warmup so the website's config cache picks up the rewrite
  }
})

test.afterAll(async () => {
  if (agent1Process) {
    agent1Process.kill("SIGTERM")
    agent1Process = null
  }
  if (agent2Process) {
    agent2Process.kill("SIGTERM")
    agent2Process = null
  }
  try {
    await mockGithub?.stop()
  } catch {
    // best-effort
  }
  try {
    await mockHttp?.stop()
  } catch {
    // best-effort
  }
  try {
    await sql?.end({ timeout: 2 })
  } catch {
    // best-effort
  }
})

function spawnAgent(
  agentId: string,
  token: string,
  label: string,
): ReturnType<typeof spawn> {
  const proc = spawn("bun", [AGENT_BUNDLE], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      CONFIG_PATH: runtimeConfigPath,
      WEBSITE_URL,
      AGENT_ID: agentId,
      AGENT_TOKEN: token,
      AGENT_POLL_INTERVAL_SECONDS: "5",
      GITHUB_API_BASE_URL: mockGithub.url,
      NODE_ENV: "test",
    },
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  })
  proc.stdout?.on("data", (d) => process.stdout.write(`[${label}:out] ${d}`))
  proc.stderr?.on("data", (d) => process.stderr.write(`[${label}:err] ${d}`))
  return proc
}

test("multi-agent — both agents write pings, UI shows all 4 tiles, killing one doesn't affect the other", async ({
  page,
}) => {
  test.setTimeout(180_000)

  agent1Process = spawnAgent(AGENT1_ID, AGENT1_TOKEN, "agent1")
  agent2Process = spawnAgent(AGENT2_ID, AGENT2_TOKEN, "agent2")

  let agent1HasPing = false
  let agent2HasPing = false
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline && (!agent1HasPing || !agent2HasPing)) {
    try {
      if (!agent1HasPing) {
        const rows = await sql<
          { agent_id: string }[]
        >`SELECT agent_id FROM mon_host_ping WHERE agent_id = ${AGENT1_ID} LIMIT 1`
        if (rows.length > 0) agent1HasPing = true
      }
      if (!agent2HasPing) {
        const rows = await sql<
          { agent_id: string }[]
        >`SELECT agent_id FROM mon_github_ping WHERE agent_id = ${AGENT2_ID} LIMIT 1`
        if (rows.length > 0) agent2HasPing = true
      }
    } catch {
      // tables may briefly be unavailable mid-startup; retry
    }
    if (!agent1HasPing || !agent2HasPing) {
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  expect(agent1HasPing, "agent1 should have written a host ping").toBe(true)
  expect(agent2HasPing, "agent2 should have written a github ping").toBe(true)

  await page.goto("/")
  await page.waitForLoadState("networkidle")
  await expect(page.getByText("Host 1").first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText("Site 1").first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText("Container 1").first()).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText("Repo 1").first()).toBeVisible({
    timeout: 30_000,
  })

  const cutoff = new Date()
  agent1Process.kill("SIGTERM")
  agent1Process = null

  let agent2NewPing = false
  const deadline2 = Date.now() + 60_000
  while (Date.now() < deadline2 && !agent2NewPing) {
    try {
      const rows = await sql<
        { count: number }[]
      >`SELECT COUNT(*)::int AS count FROM mon_github_ping WHERE agent_id = ${AGENT2_ID} AND timestamp > ${cutoff}`
      if (rows[0] && rows[0].count > 0) {
        agent2NewPing = true
        break
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000))
  }

  expect(
    agent2NewPing,
    "agent2 should keep writing pings after agent1 is killed",
  ).toBe(true)

  agent2Process?.kill("SIGTERM")
  agent2Process = null
})
