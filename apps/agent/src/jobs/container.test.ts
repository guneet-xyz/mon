import type { ContainerJobTile } from "@mon/contracts"

import { dockerRequest, pingContainer } from "./container"

import { beforeEach, describe, expect, it, mock } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

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
})
