import { hashToken } from "@/lib/server/agent-auth"

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"

const TOKEN = "super-secret-agent-token-with-enough-entropy-1234"
const AGENT_ID = "default"

function makeConfig() {
  return {
    options: {
      ping_interval_ms: 6000,
      max_retries: 3,
      retry_delay_ms: 1000,
      default_tile: "empty",
      desktop: { rows: 8, columns: 5 },
    },
    agents: {
      [AGENT_ID]: { token_hash: hashToken(TOKEN) },
    },
    tiles: [],
  }
}

function makeRequest(body: unknown, headers: Record<string, string>): Request {
  return new Request("http://localhost/api/agent/pings/github", {
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

function validGithubPingDto() {
  return {
    kind: "github_ping" as const,
    ping_id: "11111111-1111-1111-1111-111111111111",
    agent_id: AGENT_ID,
    recorded_at: "2026-05-18T12:00:00.000Z",
    key: "github-1",
    commit_hash: "abc123",
    check_run_id: 12345,
    error: null,
  }
}

function validGithubCheckRunDto() {
  return {
    kind: "github_check_run" as const,
    ping_id: "22222222-2222-2222-2222-222222222222",
    agent_id: AGENT_ID,
    recorded_at: "2026-05-18T12:00:00.000Z",
    key: "github-1",
    id: 12345,
    name: "test-check",
    status: "completed" as const,
    conclusion: "success" as const,
    details_url: "https://example.com",
    started_at: "2026-05-18T11:00:00.000Z",
    completed_at: "2026-05-18T12:00:00.000Z",
  }
}

let insertGithubPingCallCount = 0
let insertGithubCheckRunCallCount = 0
let nextDeduplicated = false

beforeEach(async () => {
  insertGithubPingCallCount = 0
  insertGithubCheckRunCallCount = 0
  nextDeduplicated = false

  await mock.module("@/lib/server/config-cache", () => ({
    getCachedConfig: async () => makeConfig(),
  }))

  await mock.module("@/lib/server/ingest/github", () => ({
    insertGithubPing: async () => {
      insertGithubPingCallCount++
      return { ok: true, deduplicated: nextDeduplicated }
    },
    insertGithubCheckRun: async () => {
      insertGithubCheckRunCallCount++
      return { ok: true, deduplicated: nextDeduplicated }
    },
  }))
})

afterEach(() => {
  mock.restore()
})

describe("POST /api/agent/pings/github", () => {
  it("returns 401 on missing auth", async () => {
    const { POST } = await import("./route")
    const res = await POST(makeRequest(validGithubPingDto(), {}))
    expect(res.status).toBe(401)
  })

  it("returns 401 on bad token", async () => {
    const { POST } = await import("./route")
    const res = await POST(
      makeRequest(validGithubPingDto(), {
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
    const dto = { ...validGithubPingDto(), agent_id: "other-agent" }
    const res = await POST(makeRequest(dto, authHeaders()))
    expect(res.status).toBe(403)
    expect(insertGithubPingCallCount).toBe(0)
  })

  it("returns ok + deduplicated:false on first insert", async () => {
    nextDeduplicated = false
    const { POST } = await import("./route")
    const res = await POST(makeRequest(validGithubPingDto(), authHeaders()))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; deduplicated: boolean }
    expect(body).toEqual({ ok: true, deduplicated: false })
    expect(insertGithubPingCallCount).toBe(1)
  })

  it("returns ok + deduplicated:true on duplicate", async () => {
    nextDeduplicated = true
    const { POST } = await import("./route")
    const res = await POST(makeRequest(validGithubPingDto(), authHeaders()))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; deduplicated: boolean }
    expect(body).toEqual({ ok: true, deduplicated: true })
  })

  it("routes github_ping kind to insertGithubPing", async () => {
    const { POST } = await import("./route")
    const res = await POST(makeRequest(validGithubPingDto(), authHeaders()))
    expect(res.status).toBe(200)
    expect(insertGithubPingCallCount).toBe(1)
    expect(insertGithubCheckRunCallCount).toBe(0)
  })

  it("routes github_check_run kind to insertGithubCheckRun", async () => {
    const { POST } = await import("./route")
    const res = await POST(makeRequest(validGithubCheckRunDto(), authHeaders()))
    expect(res.status).toBe(200)
    expect(insertGithubCheckRunCallCount).toBe(1)
    expect(insertGithubPingCallCount).toBe(0)
  })
})
