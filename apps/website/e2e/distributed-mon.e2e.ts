import { hashToken } from "@/lib/server/agent-auth"

import { getRuntime } from "./_runtime"

import { expect, test } from "@playwright/test"
import { spawn } from "child_process"
import { writeFileSync } from "fs"
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
  sql = postgres(databaseUrl, {
    onnotice: () => undefined,
  })

  writeFileSync(
    runtimeConfigPath,
    `
[agents.${AGENT_ID}]
token_hash = "${E2E_TOKEN_HASH}"

[[tiles]]
type = "host"
key = "e2e-host"
name = "E2E Host"
address = "127.0.0.1"
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
    await sql?.end({ timeout: 2 })
  } catch {
    // best-effort
  }
})

test("happy path — agent pings, row appears, UI renders", async ({ page }) => {
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

  let rowFound = false
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    try {
      const rows = await sql`SELECT * FROM mon_host_ping LIMIT 1`
      if (rows.length > 0) {
        rowFound = true
        break
      }
    } catch {
      // table may briefly be unavailable mid-startup; retry
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  expect(rowFound, "Expected a ping row to appear within 90s").toBe(true)

  await page.goto("/")
  await expect(page.getByText("E2E Host").first()).toBeVisible({
    timeout: 10_000,
  })

  agentProcess.kill("SIGTERM")
  agentProcess = null
})

test("bad token — agent exits with code 78", async () => {
  const proc = spawn("bun", [AGENT_BUNDLE], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      CONFIG_PATH: runtimeConfigPath,
      WEBSITE_URL,
      AGENT_ID,
      AGENT_TOKEN: "wrong-token",
      AGENT_POLL_INTERVAL_SECONDS: "5",
      NODE_ENV: "test",
    },
    cwd: REPO_ROOT,
  })

  const exitCode = await new Promise<number | null>((resolveExit) => {
    const timer = setTimeout(() => {
      proc.kill()
      resolveExit(null)
    }, 10_000)
    proc.on("exit", (code) => {
      clearTimeout(timer)
      resolveExit(code)
    })
  })

  expect(exitCode).toBe(78)
})

test("ghost agent — no jobs assigned, no ping rows", async () => {
  const proc = spawn("bun", [AGENT_BUNDLE], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      CONFIG_PATH: runtimeConfigPath,
      WEBSITE_URL,
      AGENT_ID: "ghost",
      AGENT_TOKEN: E2E_TOKEN,
      AGENT_POLL_INTERVAL_SECONDS: "5",
      NODE_ENV: "test",
    },
    cwd: REPO_ROOT,
  })

  try {
    await new Promise((r) => setTimeout(r, 30_000))
    const rows =
      await sql`SELECT * FROM mon_host_ping WHERE agent_id = 'ghost' LIMIT 1`
    expect(rows.length).toBe(0)
  } finally {
    proc.kill("SIGTERM")
  }
})
