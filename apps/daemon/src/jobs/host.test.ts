import { describe, it, expect, beforeEach, mock } from "bun:test"
import { pingHost } from "./host"
import type { HostJobTile } from "@mon/contracts"

describe("pingHost", () => {
  let mockExeca: any
  let tile: HostJobTile

  beforeEach(() => {
    tile = {
      kind: "host",
      id: "test-host",
      cron: "0 * * * * *",
      address: "example.com",
    }
  })

  it("returns DTO with latency_ms on successful ping", async () => {
    mockExeca = mock(async () => ({
      stdout: "PING example.com (1.2.3.4): 56 data bytes\n64 bytes from 1.2.3.4: icmp_seq=0 ttl=64 time=42.5 ms",
      exitCode: 0,
    }))

    const result = await pingHost(tile, { execa: mockExeca, daemonId: "test-daemon" })

    expect(result.kind).toBe("host")
    expect(result.error).toBeNull()
    expect(result.latency_ms).toBe(42.5)
    expect(result.ping_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.daemon_id).toBe("test-daemon")
    expect(result.recorded_at).toBeDefined()
    expect(result.key).toBe("host:example.com")
  })

  it("returns DTO with error on unreachable host (exit code 2)", async () => {
    mockExeca = mock(async () => ({
      stdout: "",
      exitCode: 2,
    }))

    const result = await pingHost(tile, { execa: mockExeca, daemonId: "test-daemon" })

    expect(result.kind).toBe("host")
    expect(result.error).toBe("unreachable")
    expect(result.latency_ms).toBeNull()
  })

  it("returns DTO with error on timeout (exit code 68)", async () => {
    mockExeca = mock(async () => ({
      stdout: "",
      exitCode: 68,
    }))

    const result = await pingHost(tile, { execa: mockExeca, daemonId: "test-daemon" })

    expect(result.kind).toBe("host")
    expect(result.error).toBe("timeout")
    expect(result.latency_ms).toBeNull()
  })

  it("returns DTO with error on other exit codes", async () => {
    mockExeca = mock(async () => ({
      stdout: "",
      exitCode: 1,
    }))

    const result = await pingHost(tile, { execa: mockExeca, daemonId: "test-daemon" })

    expect(result.kind).toBe("host")
    expect(result.error).toContain("exit code 1")
    expect(result.latency_ms).toBeNull()
  })

  it("returns DTO with error when output cannot be parsed", async () => {
    mockExeca = mock(async () => ({
      stdout: "some unparseable output",
      exitCode: 0,
    }))

    const result = await pingHost(tile, { execa: mockExeca, daemonId: "test-daemon" })

    expect(result.kind).toBe("host")
    expect(result.error).toBe("couldn't parse output")
    expect(result.latency_ms).toBeNull()
  })

  it("returns DTO with error on execa exception", async () => {
    mockExeca = mock(async () => {
      throw new Error("command not found")
    })

    const result = await pingHost(tile, { execa: mockExeca, daemonId: "test-daemon" })

    expect(result.kind).toBe("host")
    expect(result.error).toContain("command not found")
    expect(result.latency_ms).toBeNull()
  })
})
