import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"

import { hashToken } from "@/lib/server/agent-auth"

const TOKEN = "super-secret-agent-token-with-enough-entropy-1234"
const AGENT_ID = "default"

function makeConfig() {
  return {
    options: {
      ping_interval_ms: 6000,
      max_retries: 3,
      retry_delay_ms: 1000,
      default_tile: "empty",
      hide_grouped_tiles: false,
      desktop: { rows: 8, columns: 5 },
    },
    agents: {
      [AGENT_ID]: { token_hash: hashToken(TOKEN) },
    },
    tiles: [
      { type: "agent", key: "agent-self", agent: AGENT_ID, disks: [] },
      { type: "agent", key: "agent-other", agent: "other-agent", disks: [] },
    ],
  }
}

function makeRequest(body: unknown, headers: Record<string, string>): Request {
  return new Request("http://localhost/api/agent/pings/system", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function authHeaders() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    "X-Agent-Id": AGENT_ID,
  }
}

function validDto() {
  return {
    kind: "system" as const,
    ping_id: "11111111-1111-1111-1111-111111111111",
    agent_id: AGENT_ID,
    recorded_at: "2026-05-18T12:00:00.000Z",
    key: "agent-self",
    error: null,
    cpu_percent: 12.5,
    memory_used_bytes: 4_000_000_000,
    memory_total_bytes: 8_000_000_000,
    uptime_seconds: 3600,
    disks: [
      { name: "/", used_bytes: 26_000_000_000, total_bytes: 28_000_000_000 },
    ],
  }
}

let insertCallCount = 0
let nextDeduplicated = false

beforeEach(async () => {
  insertCallCount = 0
  nextDeduplicated = false

  await mock.module("@/lib/server/config-cache", () => ({
    getCachedConfig: async () => makeConfig(),
  }))

  await mock.module("@/lib/server/ingest/system", () => ({
    insertSystemPing: async () => {
      insertCallCount++
      return { ok: true, deduplicated: nextDeduplicated }
    },
  }))
})

afterEach(() => {
  mock.restore()
})

describe("POST /api/agent/pings/system", () => {
  it("returns 403 for another agent's machine", async () => {
    const { POST } = await import("./route")
    const dto = { ...validDto(), key: "agent-other" }
    const res = await POST(makeRequest(dto, authHeaders()))
    expect(res.status).toBe(403)
    expect(insertCallCount).toBe(0)
  })

  it("returns 403 for a key that is not an agent tile", async () => {
    const { POST } = await import("./route")
    const dto = { ...validDto(), key: "site-1" }
    const res = await POST(makeRequest(dto, authHeaders()))
    expect(res.status).toBe(403)
  })

  it("returns 401 on missing auth", async () => {
    const { POST } = await import("./route")
    const res = await POST(makeRequest(validDto(), {}))
    expect(res.status).toBe(401)
  })

  it("returns 401 on bad token", async () => {
    const { POST } = await import("./route")
    const res = await POST(
      makeRequest(validDto(), {
        Authorization: "Bearer wrong",
        "X-Agent-Id": AGENT_ID,
      }),
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 on invalid JSON", async () => {
    const { POST } = await import("./route")
    const res = await POST(makeRequest("not-json{", authHeaders()))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("invalid_payload")
  })

  it("returns 400 on wrong shape", async () => {
    const { POST } = await import("./route")
    const res = await POST(makeRequest({ foo: "bar" }, authHeaders()))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("invalid_payload")
  })

  it("returns 403 when agent_id mismatches auth", async () => {
    const { POST } = await import("./route")
    const dto = { ...validDto(), agent_id: "other-agent" }
    const res = await POST(makeRequest(dto, authHeaders()))
    expect(res.status).toBe(403)
    expect(insertCallCount).toBe(0)
  })

  it("returns ok + deduplicated:false on first insert", async () => {
    nextDeduplicated = false
    const { POST } = await import("./route")
    const res = await POST(makeRequest(validDto(), authHeaders()))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; deduplicated: boolean }
    expect(body).toEqual({ ok: true, deduplicated: false })
    expect(insertCallCount).toBe(1)
  })

  it("returns ok + deduplicated:true on duplicate", async () => {
    nextDeduplicated = true
    const { POST } = await import("./route")
    const res = await POST(makeRequest(validDto(), authHeaders()))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; deduplicated: boolean }
    expect(body).toEqual({ ok: true, deduplicated: true })
  })
})
