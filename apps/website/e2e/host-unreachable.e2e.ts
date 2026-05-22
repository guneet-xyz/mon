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

interface MockHttpHost {
  url: string
  setScenario(s: { kind: "tcp_reset" }): void
  requests: Array<{ method: string; path: string }>
  stop: () => Promise<void>
}
type CreateMockHttpHost = (opts?: {
  port?: number
}) => Promise<MockHttpHost>

const AGENT_ID = "default"
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

test.describe("host + website unreachable failure modes", () => {
  let mockHost: MockHttpHost | null = null
  let agentProcess: ReturnType<typeof spawn> | null = null

  test.beforeAll(async () => {
    const runtime = getRuntime()
    databaseUrl = runtime.databaseUrl
    runtimeConfigPath = runtime.configPath
    sql = postgres(databaseUrl, { onnotice: () => undefined })

    writeFileSync(
      runtimeConfigPath,
      `
[agents.${AGENT_ID}]
token_hash = "${E2E_TOKEN_HASH}"

[[tiles]]
type = "host"
key = "unreachable-host"
name = "Unreachable Host"
address = "192.0.2.1"
agent = "${AGENT_ID}"
interval_seconds = 5

[[tiles]]
type = "website"
key = "unreachable-website"
name = "Unreachable Website"
url = "http://127.0.0.1:39080/unreachable"
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
      await mockHost?.stop()
    } catch {
      // best-effort
    }
    try {
      await sql?.end({ timeout: 2 })
    } catch {
      // best-effort
    }
  })

  function startAgent(): ReturnType<typeof spawn> {
    const proc = spawn("bun", [AGENT_BUNDLE], {
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
      stdio: ["ignore", "pipe", "pipe"],
    })
    proc.stdout?.on("data", (d) =>
      process.stdout.write(`[agent:out] ${d}`),
    )
    proc.stderr?.on("data", (d) =>
      process.stderr.write(`[agent:err] ${d}`),
    )
    return proc
  }

  test("website tile against TCP reset mock — website_ping has error, UI shows error state", async ({
    page,
  }) => {
    test.setTimeout(60_000)

    const mod = await import("@mon/test-utils")
    const createMockHttpHost =
      (mod as { createMockHttpHost?: CreateMockHttpHost })
        .createMockHttpHost ??
      (mod as { default?: { createMockHttpHost?: CreateMockHttpHost } })
        .default?.createMockHttpHost
    if (!createMockHttpHost)
      throw new Error("createMockHttpHost export missing")

    mockHost = await createMockHttpHost({ port: 39080 })
    mockHost.setScenario({ kind: "tcp_reset" })

    agentProcess = startAgent()

    let errorRow: { error: string | null } | undefined
    const deadline = Date.now() + 40_000
    while (Date.now() < deadline) {
      try {
        const rows = await sql<
          { error: string | null }[]
        >`SELECT error FROM mon_website_ping WHERE key = 'website:http://127.0.0.1:39080/unreachable' AND error IS NOT NULL LIMIT 1`
        if (rows.length > 0) {
          errorRow = rows[0]
          break
        }
      } catch {
        // table may briefly be unavailable mid-startup; retry
      }
      await new Promise((r) => setTimeout(r, 500))
    }

    expect(
      errorRow,
      "Expected a website_ping error row within 40s",
    ).toBeDefined()
    expect(errorRow?.error).not.toBeNull()
    expect(typeof errorRow?.error).toBe("string")
    expect(errorRow?.error?.length ?? 0).toBeGreaterThan(0)

    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await expect(
      page.getByText("127.0.0.1:39080/unreachable").first(),
    ).toBeVisible({ timeout: 20_000 })

    agentProcess.kill("SIGTERM")
    agentProcess = null
    await mockHost.stop()
    mockHost = null
  })

  test("host tile against TEST-NET-1 192.0.2.1 — host_ping error matches /timeout|unreachable|ping failed/, UI shows error state", async ({
    page,
  }) => {
    test.setTimeout(60_000)

    agentProcess = startAgent()

    let errorRow: { error: string | null } | undefined
    const deadline = Date.now() + 45_000
    while (Date.now() < deadline) {
      try {
        const rows = await sql<
          { error: string | null }[]
        >`SELECT error FROM mon_host_ping WHERE key = 'host:192.0.2.1' AND error IS NOT NULL LIMIT 1`
        if (rows.length > 0) {
          errorRow = rows[0]
          break
        }
      } catch {
        // table may briefly be unavailable mid-startup; retry
      }
      await new Promise((r) => setTimeout(r, 500))
    }

    expect(
      errorRow,
      "Expected a host_ping error row within 45s",
    ).toBeDefined()
    expect(errorRow?.error).toMatch(/timeout|unreachable|ping failed/i)

    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await expect(
      page.getByText("192.0.2.1").first(),
    ).toBeVisible({ timeout: 20_000 })

    agentProcess.kill("SIGTERM")
    agentProcess = null
  })
})
