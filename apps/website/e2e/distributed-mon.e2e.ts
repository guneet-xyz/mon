import { hashToken } from "@/lib/server/daemon-auth"

import { expect, test } from "@playwright/test"
import { spawn } from "child_process"
import { mkdtempSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join, resolve, dirname } from "path"
import postgres from "postgres"
import { fileURLToPath } from "url"

import type { createTestDb as CreateTestDb } from "@mon/test-utils"

const E2E_TOKEN = "e2e-test-token-32-bytes-long-here"
const E2E_TOKEN_HASH = hashToken(E2E_TOKEN)
const DAEMON_ID = "e2e"

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
)
const DAEMON_BUNDLE = join(REPO_ROOT, "apps", "daemon", "dist", "daemon.cjs")

let testDb: Awaited<ReturnType<typeof CreateTestDb>>
let sql: ReturnType<typeof postgres>
let tmpConfigPath: string
let daemonProcess: ReturnType<typeof spawn> | null = null

test.beforeAll(async () => {
  const mod = (await import("@mon/test-utils")) as {
    createTestDb: typeof CreateTestDb
    default?: { createTestDb: typeof CreateTestDb }
  }
  const createTestDb = mod.createTestDb ?? mod.default?.createTestDb
  if (!createTestDb) throw new Error("createTestDb export missing")
  testDb = await createTestDb()
  sql = postgres(testDb.url, { onnotice: () => {} })

  const tmpDir = mkdtempSync(join(tmpdir(), "mon-e2e-"))
  tmpConfigPath = join(tmpDir, "config.toml")
  writeFileSync(
    tmpConfigPath,
    `
[daemons.${DAEMON_ID}]
token_hash = "${E2E_TOKEN_HASH}"

[[tiles]]
type = "host"
key = "e2e-host"
name = "E2E Host"
address = "127.0.0.1"
daemon = "${DAEMON_ID}"
interval_seconds = 5
`,
  )
})

test.afterAll(async () => {
  if (daemonProcess) {
    daemonProcess.kill("SIGTERM")
    daemonProcess = null
  }
  try {
    await sql?.end({ timeout: 2 })
  } catch {
    // best-effort cleanup; container teardown below is authoritative
  }
  testDb?.stop()
})

test("happy path — daemon pings, row appears, UI renders", async ({ page }) => {
  daemonProcess = spawn("bun", [DAEMON_BUNDLE], {
    env: {
      ...process.env,
      DATABASE_URL: testDb.url,
      CONFIG_PATH: tmpConfigPath,
      WEBSITE_URL: "http://localhost:3000",
      DAEMON_ID,
      DAEMON_TOKEN: E2E_TOKEN,
      DAEMON_POLL_INTERVAL_SECONDS: "5",
      NODE_ENV: "test",
    },
    cwd: REPO_ROOT,
  })

  // Allow up to 90s: daemon boot + jobs fetch + first cron tick (5s interval)
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

  daemonProcess.kill("SIGTERM")
  daemonProcess = null
})

test("bad token — daemon exits with code 78", async () => {
  const proc = spawn("bun", [DAEMON_BUNDLE], {
    env: {
      ...process.env,
      DATABASE_URL: testDb.url,
      CONFIG_PATH: tmpConfigPath,
      WEBSITE_URL: "http://localhost:3000",
      DAEMON_ID,
      DAEMON_TOKEN: "wrong-token",
      DAEMON_POLL_INTERVAL_SECONDS: "5",
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

test("ghost daemon — no jobs assigned, no ping rows", async () => {
  const proc = spawn("bun", [DAEMON_BUNDLE], {
    env: {
      ...process.env,
      DATABASE_URL: testDb.url,
      CONFIG_PATH: tmpConfigPath,
      WEBSITE_URL: "http://localhost:3000",
      DAEMON_ID: "ghost",
      DAEMON_TOKEN: E2E_TOKEN,
      DAEMON_POLL_INTERVAL_SECONDS: "5",
      NODE_ENV: "test",
    },
    cwd: REPO_ROOT,
  })

  try {
    // 30s window covers several poll intervals (5s); ensures no jobs are ever assigned
    await new Promise((r) => setTimeout(r, 30_000))
    const rows =
      await sql`SELECT * FROM mon_host_ping WHERE daemon_id = 'ghost' LIMIT 1`
    expect(rows.length).toBe(0)
  } finally {
    proc.kill("SIGTERM")
  }
})
