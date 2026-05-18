import type { ContainerJobTile } from "@mon/contracts"

import { pingContainer } from "./container"

import { beforeEach, describe, expect, it, mock } from "bun:test"

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
      daemonId: "test-daemon",
    })

    expect(result.kind).toBe("container")
    expect(result.error).toBeNull()
    expect(result.ping_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.daemon_id).toBe("test-daemon")
    expect(result.recorded_at).toBeDefined()
    expect(result.key).toBe("container:my-app")
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
      daemonId: "test-daemon",
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
      daemonId: "test-daemon",
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
      daemonId: "test-daemon",
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
      daemonId: "test-daemon",
    })

    expect(result.kind).toBe("container")
    expect(result.error).toContain("invalid json")
  })
})
