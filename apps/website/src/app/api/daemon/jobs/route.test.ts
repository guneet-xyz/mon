import type { Config } from "@mon/config"
import type { JobsResponse } from "@mon/contracts"

import { hashToken } from "@/lib/server/daemon-auth"

import { beforeEach, describe, expect, it, mock } from "bun:test"

const TOKEN = "super-secret-daemon-token-with-enough-entropy-1234"
const OTHER_TOKEN = "another-daemon-secret-token-1234567890abcd"

function makeConfig(): Config {
  return {
    options: {
      ping_interval_ms: 60000,
      max_retries: 3,
      retry_delay_ms: 1000,
      default_tile: "empty",
      desktop: { rows: 8, columns: 5 },
    },
    daemons: {
      worker1: { token_hash: hashToken(TOKEN) },
      worker2: { token_hash: hashToken(OTHER_TOKEN) },
    },
    tiles: [
      {
        type: "host",
        key: "h1",
        address: "1.2.3.4",
        daemon: "worker1",
        interval_seconds: 30,
      },
      {
        type: "website",
        key: "w1",
        url: "https://example.com",
        daemon: "worker1",
      },
      {
        type: "container",
        key: "c1",
        container_name: "app",
        docker_socket: "unix:///var/run/docker.sock",
        daemon: "worker1",
        interval_seconds: 120,
      },
      {
        type: "github",
        key: "g1",
        repo: "owner/repo",
        github_token: "ghp_secret",
        daemon: "worker1",
      },
      {
        type: "host",
        key: "h2-other",
        address: "5.6.7.8",
        daemon: "worker2",
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
  return new Request("http://localhost/api/daemon/jobs", { headers })
}

describe("GET /api/daemon/jobs", () => {
  beforeEach(() => {
    currentConfig = makeConfig()
  })

  it("returns 401 when Authorization header is missing", async () => {
    const res = await GET(makeRequest({ "X-Daemon-Id": "worker1" }))
    expect(res.status).toBe(401)
  })

  it("returns 401 when token is wrong", async () => {
    const res = await GET(
      makeRequest({
        Authorization: "Bearer wrong-token-value",
        "X-Daemon-Id": "worker1",
      }),
    )
    expect(res.status).toBe(401)
  })

  it("returns 401 when daemonId is unknown", async () => {
    const res = await GET(
      makeRequest({
        Authorization: `Bearer ${TOKEN}`,
        "X-Daemon-Id": "ghost",
      }),
    )
    expect(res.status).toBe(401)
  })

  it("returns only the authenticated daemon's tiles, mapped to JobTile shape", async () => {
    const res = await GET(
      makeRequest({
        Authorization: `Bearer ${TOKEN}`,
        "X-Daemon-Id": "worker1",
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

  it("never leaks tiles belonging to other daemons", async () => {
    const res = await GET(
      makeRequest({
        Authorization: `Bearer ${TOKEN}`,
        "X-Daemon-Id": "worker1",
      }),
    )
    const body = (await res.json()) as JobsResponse
    expect(body.tiles.find((t) => t.id === "h2-other")).toBeUndefined()
  })

  it("returns an empty tiles array when the daemon has no assignments", async () => {
    currentConfig = {
      ...makeConfig(),
      tiles: [],
    }
    const res = await GET(
      makeRequest({
        Authorization: `Bearer ${TOKEN}`,
        "X-Daemon-Id": "worker1",
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as JobsResponse
    expect(body).toEqual({ tiles: [] })
  })

  it("does not include token_hash or daemons list in the response body", async () => {
    const res = await GET(
      makeRequest({
        Authorization: `Bearer ${TOKEN}`,
        "X-Daemon-Id": "worker1",
      }),
    )
    const text = await res.text()
    expect(text).not.toContain("token_hash")
    expect(text).not.toContain("daemons")
    expect(text).not.toContain(hashToken(TOKEN))
  })
})
