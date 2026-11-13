import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { beforeEach, describe, expect, it, mock } from "bun:test"

import type { ContainerJobTile } from "@mon/contracts"

import { cpuPercent, dockerRequest, pingContainer } from "./container"

describe("pingContainer", () => {
  let mockFetch: any
  let tile: ContainerJobTile

  beforeEach(() => {
    tile = {
      kind: "container",
      id: "test-container",
      cron: "0 * * * * *",
      container_name: "my-app",
      docker_socket: "unix:///var/run/docker.sock",
    }
  })

  it("returns DTO with error=null when container is running", async () => {
    mockFetch = mock(async () => ({
      ok: true,
      json: async () => ({
        State: {
          Status: "running",
        },
      }),
    }))

    const result = await pingContainer(tile, {
      fetch: mockFetch,
      agentId: "test-agent",
    })

    expect(result.kind).toBe("container")
    expect(result.error).toBeNull()
    expect(result.ping_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.agent_id).toBe("test-agent")
    expect(result.recorded_at).toBeDefined()
    expect(result.key).toBe("test-container")
  })

  it("returns DTO with error when container is offline", async () => {
    mockFetch = mock(async () => ({
      ok: true,
      json: async () => ({
        State: {
          Status: "exited",
        },
      }),
    }))

    const result = await pingContainer(tile, {
      fetch: mockFetch,
      agentId: "test-agent",
    })

    expect(result.kind).toBe("container")
    expect(result.error).toBe("container is offline")
  })

  it("returns DTO with error on HTTP failure", async () => {
    mockFetch = mock(async () => ({
      ok: false,
      status: 404,
    }))

    const result = await pingContainer(tile, {
      fetch: mockFetch,
      agentId: "test-agent",
    })

    expect(result.kind).toBe("container")
    expect(result.error).toBe("HTTP 404")
  })

  it("returns DTO with error on network failure", async () => {
    mockFetch = mock(async () => {
      throw new Error("connection refused")
    })

    const result = await pingContainer(tile, {
      fetch: mockFetch,
      agentId: "test-agent",
    })

    expect(result.kind).toBe("container")
    expect(result.error).toContain("connection refused")
  })

  it("returns DTO with error on JSON parse failure", async () => {
    mockFetch = mock(async () => ({
      ok: true,
      json: async () => {
        throw new Error("invalid json")
      },
    }))

    const result = await pingContainer(tile, {
      fetch: mockFetch,
      agentId: "test-agent",
    })

    expect(result.kind).toBe("container")
    expect(result.error).toContain("invalid json")
  })

  it("sends unix:// sockets through Bun's unix fetch option", async () => {
    mockFetch = mock(async () => ({
      ok: true,
      json: async () => ({ State: { Status: "running" } }),
    }))

    await pingContainer(tile, { fetch: mockFetch, agentId: "test-agent" })

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost/v1.41/containers/my-app/json",
      { unix: "/var/run/docker.sock" },
    )
  })

  it("treats a bare path as a unix socket", () => {
    const { url, init } = dockerRequest({
      ...tile,
      docker_socket: "/run/docker.sock",
    })

    expect(url).toBe("http://localhost/v1.41/containers/my-app/json")
    expect(init).toEqual({ unix: "/run/docker.sock" })
  })

  it("rewrites tcp:// sockets to http://", () => {
    const { url, init } = dockerRequest({
      ...tile,
      docker_socket: "tcp://docker-proxy:2375/",
    })

    expect(url).toBe("http://docker-proxy:2375/v1.41/containers/my-app/json")
    expect(init).toEqual({})
  })

  it("reaches a real Docker API over a unix socket", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mon-docker-"))
    const socketPath = join(dir, "docker.sock")
    const server = Bun.serve({
      unix: socketPath,
      fetch(req) {
        const { pathname } = new URL(req.url)
        if (pathname === "/v1.41/containers/my-app/json") {
          return Response.json({ State: { Status: "running" } })
        }
        return new Response("not found", { status: 404 })
      },
    })

    try {
      const result = await pingContainer(
        { ...tile, docker_socket: `unix://${socketPath}` },
        { agentId: "test-agent" },
      )
      expect(result.error).toBeNull()
    } finally {
      server.stop(true)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("records state details from the inspect response", async () => {
    mockFetch = mock(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes("/stats")
          ? {}
          : {
              RestartCount: 2,
              Config: {
                Image: "cr.guneet.dev/mon/agent:v0.8.0",
                Labels: { "org.opencontainers.image.version": "0.8.0" },
              },
              State: {
                Status: "running",
                Health: { Status: "healthy" },
                StartedAt: "2026-11-13T10:00:00.123456789Z",
                ExitCode: 0,
                OOMKilled: false,
              },
            },
    }))

    const result = await pingContainer(tile, { fetch: mockFetch })

    expect(result).toMatchObject({
      error: null,
      state: "running",
      health: "healthy",
      restart_count: 2,
      started_at: "2026-11-13T10:00:00.123Z",
      exit_code: 0,
      oom_killed: false,
      image: "cr.guneet.dev/mon/agent:v0.8.0",
      image_version: "0.8.0",
    })
  })

  it("keeps exit details for stopped containers", async () => {
    mockFetch = mock(async () => ({
      ok: true,
      json: async () => ({
        State: {
          Status: "exited",
          ExitCode: 137,
          OOMKilled: true,
          StartedAt: "0001-01-01T00:00:00Z",
        },
      }),
    }))
    const result = await pingContainer(tile, { fetch: mockFetch })
    expect(result).toMatchObject({
      error: "container is offline",
      state: "exited",
      exit_code: 137,
      oom_killed: true,
      started_at: null,
    })
    // No stats request for a stopped container.
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("computes CPU % across polls and memory like docker stats", async () => {
    let total = 1_000_000_000
    let system = 100_000_000_000
    mockFetch = mock(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes("/stats")
          ? {
              cpu_stats: {
                cpu_usage: { total_usage: total },
                system_cpu_usage: system,
                online_cpus: 4,
              },
              memory_stats: {
                usage: 300_000_000,
                limit: 8_000_000_000,
                stats: { inactive_file: 50_000_000 },
              },
            }
          : { State: { Status: "running" } },
    }))
    const statsTile = { ...tile, id: "stats-container" }

    const first = await pingContainer(statsTile, { fetch: mockFetch })
    expect(first.cpu_percent).toBeNull()
    expect(first.memory_bytes).toBe(250_000_000)
    expect(first.memory_limit_bytes).toBe(8_000_000_000)

    // 0.5 s of CPU over 10 s of system time across 4 CPUs = 20%.
    total += 500_000_000
    system += 10_000_000_000
    const second = await pingContainer(statsTile, { fetch: mockFetch })
    expect(second.cpu_percent).toBeCloseTo(20)
  })

  it("skips CPU % when the counter went backwards", () => {
    expect(
      cpuPercent(
        { container: 10, system: 10 },
        { container: 5, system: 20 },
        2,
      ),
    ).toBeNull()
    expect(cpuPercent(undefined, { container: 5, system: 20 }, 2)).toBeNull()
  })
})
