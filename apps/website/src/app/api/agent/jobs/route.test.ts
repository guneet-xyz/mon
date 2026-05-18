import type { Config } from "@mon/config"
import type { JobsResponse } from "@mon/contracts"

import { hashToken } from "@/lib/server/agent-auth"

import { beforeEach, describe, expect, it, mock } from "bun:test"

const TOKEN = "super-secret-agent-token-with-enough-entropy-1234"
const OTHER_TOKEN = "another-agent-secret-token-1234567890abcd"

function makeConfig(): Config {
  return {
    options: {
      ping_interval_ms: 60000,
      max_retries: 3,
      retry_delay_ms: 1000,
      default_tile: "empty",
      desktop: { rows: 8, columns: 5 },
    },
    agents: {
      worker1: { token_hash: hashToken(TOKEN) },
      worker2: { token_hash: hashToken(OTHER_TOKEN) },
    },
    tiles: [
      {
        type: "host",
        key: "h1",
        address: "1.2.3.4",
        agent: "worker1",
        interval_seconds: 30,
      },
      {
        type: "website",
        key: "w1",
        url: "https://example.com",
        agent: "worker1",
      },
      {
        type: "container",
        key: "c1",
        container_name: "app",
        docker_socket: "unix:///var/run/docker.sock",
        agent: "worker1",
        interval_seconds: 120,
      },
      {
        type: "github",
        key: "g1",
        repo: "owner/repo",
        github_token: "ghp_secret",
        agent: "worker1",
      },
      {
        type: "host",
        key: "h2-other",
        address: "5.6.7.8",
        agent: "worker2",
      },
    ],
  }
}

let currentConfig: Config = makeConfig()

await mock.module("@/lib/server/config-cache", () => ({
  getCachedConfig: async () => currentConfig,
}))

const { GET } = await import("./route")

function makeRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/agent/jobs", { headers })
}

describe("GET /api/agent/jobs", () => {
  beforeEach(() => {
    currentConfig = makeConfig()
  })

  it("returns 401 when Authorization header is missing", async () => {
    const res = await GET(makeRequest({ "X-Agent-Id": "worker1" }))
    expect(res.status).toBe(401)
  })

  it("returns 401 when token is wrong", async () => {
    const res = await GET(
      makeRequest({
        Authorization: "Bearer wrong-token-value",
        "X-Agent-Id": "worker1",
      }),
    )
    expect(res.status).toBe(401)
  })

  it("returns 401 when agentId is unknown", async () => {
    const res = await GET(
      makeRequest({
        Authorization: `Bearer ${TOKEN}`,
        "X-Agent-Id": "ghost",
      }),
    )
    expect(res.status).toBe(401)
  })

  it("returns only the authenticated agent's tiles, mapped to JobTile shape", async () => {
    const res = await GET(
      makeRequest({
        Authorization: `Bearer ${TOKEN}`,
        "X-Agent-Id": "worker1",
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as JobsResponse
    expect(body.tiles).toHaveLength(4)

    const host = body.tiles.find((t) => t.kind === "host")
    expect(host).toEqual({
      kind: "host",
      id: "h1",
      cron: "*/30 * * * * *",
      address: "1.2.3.4",
    })

    const website = body.tiles.find((t) => t.kind === "website")
    expect(website).toEqual({
      kind: "website",
      id: "w1",
      cron: "0 */1 * * * *",
      url: "https://example.com",
    })

    const container = body.tiles.find((t) => t.kind === "container")
    expect(container).toEqual({
      kind: "container",
      id: "c1",
      cron: "0 */2 * * * *",
      container_name: "app",
      docker_socket: "unix:///var/run/docker.sock",
    })

    const github = body.tiles.find((t) => t.kind === "github")
    expect(github).toEqual({
      kind: "github",
      id: "g1",
      cron: "0 */1 * * * *",
      repo: "owner/repo",
      github_token: "ghp_secret",
    })
  })

  it("never leaks tiles belonging to other agents", async () => {
    const res = await GET(
      makeRequest({
        Authorization: `Bearer ${TOKEN}`,
        "X-Agent-Id": "worker1",
      }),
    )
    const body = (await res.json()) as JobsResponse
    expect(body.tiles.find((t) => t.id === "h2-other")).toBeUndefined()
  })

  it("returns an empty tiles array when the agent has no assignments", async () => {
    currentConfig = {
      ...makeConfig(),
      tiles: [],
    }
    const res = await GET(
      makeRequest({
        Authorization: `Bearer ${TOKEN}`,
        "X-Agent-Id": "worker1",
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as JobsResponse
    expect(body).toEqual({ tiles: [] })
  })

  it("does not include token_hash or agents list in the response body", async () => {
    const res = await GET(
      makeRequest({
        Authorization: `Bearer ${TOKEN}`,
        "X-Agent-Id": "worker1",
      }),
    )
    const text = await res.text()
    expect(text).not.toContain("token_hash")
    expect(text).not.toContain("agents")
    expect(text).not.toContain(hashToken(TOKEN))
  })
})
