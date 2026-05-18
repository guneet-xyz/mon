import { hashToken } from "@/lib/server/daemon-auth"

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"

const TOKEN = "super-secret-daemon-token-with-enough-entropy-1234"
const DAEMON_ID = "default"

function makeConfig() {
  return {
    options: {
      ping_interval_ms: 6000,
      max_retries: 3,
      retry_delay_ms: 1000,
      default_tile: "empty",
      desktop: { rows: 8, columns: 5 },
    },
    daemons: {
      [DAEMON_ID]: { token_hash: hashToken(TOKEN) },
    },
    tiles: [],
  }
}

function makeRequest(body: unknown, headers: Record<string, string>): Request {
  return new Request("http://localhost/api/daemon/pings/container", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function authHeaders() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    "X-Daemon-Id": DAEMON_ID,
  }
}

function validDto() {
  return {
    kind: "container" as const,
    ping_id: "11111111-1111-1111-1111-111111111111",
    daemon_id: DAEMON_ID,
    recorded_at: "2026-05-18T12:00:00.000Z",
    key: "container-1",
    error: null,
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

  await mock.module("@/lib/server/ingest/container", () => ({
    insertContainerPing: async () => {
      insertCallCount++
      return { ok: true, deduplicated: nextDeduplicated }
    },
  }))
})

afterEach(() => {
  mock.restore()
})

describe("POST /api/daemon/pings/container", () => {
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
        "X-Daemon-Id": DAEMON_ID,
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

  it("returns 403 when daemon_id mismatches auth", async () => {
    const { POST } = await import("./route")
    const dto = { ...validDto(), daemon_id: "other-daemon" }
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
