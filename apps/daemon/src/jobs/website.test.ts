import type { WebsiteJobTile } from "@mon/contracts"

import { pingWebsite } from "./website"

import { beforeEach, describe, expect, it, mock } from "bun:test"

describe("pingWebsite", () => {
  let mockFetch: any
  let tile: WebsiteJobTile

  beforeEach(() => {
    tile = {
      kind: "website",
      id: "test-website",
      cron: "0 * * * * *",
      url: "https://example.com",
    }
  })

  it("returns DTO with latency_ms on successful 200 response", async () => {
    mockFetch = mock(async () => ({
      ok: true,
      status: 200,
    }))

    const result = await pingWebsite(tile, {
      fetch: mockFetch,
      daemonId: "test-daemon",
    })

    expect(result.kind).toBe("website")
    expect(result.error).toBeNull()
    expect(result.latency_ms).toBeGreaterThanOrEqual(0)
    expect(result.ping_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.daemon_id).toBe("test-daemon")
    expect(result.recorded_at).toBeDefined()
    expect(result.key).toBe("website:https://example.com")
  })

  it("returns DTO with latency_ms on redirect response (3xx)", async () => {
    mockFetch = mock(async () => ({
      ok: false,
      status: 301,
    }))

    const result = await pingWebsite(tile, {
      fetch: mockFetch,
      daemonId: "test-daemon",
    })

    expect(result.kind).toBe("website")
    expect(result.error).toBeNull()
    expect(result.latency_ms).toBeGreaterThanOrEqual(0)
  })

  it("returns DTO with error on 4xx response", async () => {
    mockFetch = mock(async () => ({
      ok: false,
      status: 404,
    }))

    const result = await pingWebsite(tile, {
      fetch: mockFetch,
      daemonId: "test-daemon",
    })

    expect(result.kind).toBe("website")
    expect(result.error).toBe("HTTP 404")
    expect(result.latency_ms).toBeNull()
  })

  it("returns DTO with error on 5xx response", async () => {
    mockFetch = mock(async () => ({
      ok: false,
      status: 500,
    }))

    const result = await pingWebsite(tile, {
      fetch: mockFetch,
      daemonId: "test-daemon",
    })

    expect(result.kind).toBe("website")
    expect(result.error).toBe("HTTP 500")
    expect(result.latency_ms).toBeNull()
  })

  it("returns DTO with error on network failure", async () => {
    mockFetch = mock(async () => {
      throw new Error("network timeout")
    })

    const result = await pingWebsite(tile, {
      fetch: mockFetch,
      daemonId: "test-daemon",
    })

    expect(result.kind).toBe("website")
    expect(result.error).toContain("network timeout")
    expect(result.latency_ms).toBeNull()
  })
})
