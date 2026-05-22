import { hashToken } from "@/lib/server/agent-auth"

import { getRuntime } from "./_runtime"

import { expect, test } from "@playwright/test"
import { writeFileSync } from "fs"
import postgres from "postgres"
import { randomUUID } from "crypto"

const E2E_TOKEN = "e2e-test-token-32-bytes-long-here"
const E2E_TOKEN_HASH = hashToken(E2E_TOKEN)
const AGENT_ID = "e2e-dedup"
const E2E_PORT = process.env.E2E_PORT ?? "3055"
const WEBSITE_URL = `http://localhost:${E2E_PORT}`

let sql: ReturnType<typeof postgres> | null = null
let runtimeConfigPath: string
let databaseUrl: string

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
key = "dedup-host"
name = "Dedup Host"
address = "127.0.0.1"
agent = "${AGENT_ID}"
interval_seconds = 5
`,
  )
})

test.afterAll(async () => {
  try {
    if (sql) await sql.end({ timeout: 2 })
  } catch {
    // best-effort
  }
})

test("deduplication — same ping_id returns deduplicated: true on second POST, DB has 1 row", async ({
  request,
}) => {
  const pingId = randomUUID()
  const now = new Date().toISOString()

  const payload = {
    kind: "host",
    ping_id: pingId,
    agent_id: AGENT_ID,
    recorded_at: now,
    key: "dedup-host",
    latency_ms: 42,
    error: null,
  }

  const headers = {
    Authorization: `Bearer ${E2E_TOKEN}`,
    "X-Agent-Id": AGENT_ID,
    "Content-Type": "application/json",
  }

  // First POST — should return deduplicated: false
  const firstResponse = await request.post(
    `${WEBSITE_URL}/api/agent/pings/host`,
    {
      headers,
      data: payload,
    },
  )

  expect(firstResponse.status()).toBe(200)
  const firstBody = await firstResponse.json()
  expect(firstBody).toEqual({ ok: true, deduplicated: false })

  // Second POST with same ping_id — should return deduplicated: true
  const secondResponse = await request.post(
    `${WEBSITE_URL}/api/agent/pings/host`,
    {
      headers,
      data: payload,
    },
  )

  expect(secondResponse.status()).toBe(200)
  const secondBody = await secondResponse.json()
  expect(secondBody).toEqual({ ok: true, deduplicated: true })

  // Verify DB has exactly 1 row with this ping_id
  if (!sql) throw new Error("Database connection not initialized")
  const rows = await sql`
    SELECT ping_id FROM mon_host_ping WHERE ping_id = ${pingId}
  `
  expect(rows).toHaveLength(1)
  if (rows[0]) {
    expect(rows[0].ping_id).toBe(pingId)
  }
})
