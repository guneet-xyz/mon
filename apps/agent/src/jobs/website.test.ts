import { beforeEach, describe, expect, it, mock } from "bun:test"

import type { WebsiteJobTile } from "@mon/contracts"

import { pingWebsite, readCertExpiry } from "./website"

const noCert = async () => null

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
      readCertExpiry: noCert,
      agentId: "test-agent",
    })

    expect(result.kind).toBe("website")
    expect(result.error).toBeNull()
    expect(result.latency_ms).toBeGreaterThanOrEqual(0)
    expect(result.ping_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(result.agent_id).toBe("test-agent")
    expect(result.recorded_at).toBeDefined()
    expect(result.key).toBe("test-website")
  })

  it("returns DTO with latency_ms on redirect response (3xx)", async () => {
    mockFetch = mock(async () => ({
      ok: false,
      status: 301,
    }))

    const result = await pingWebsite(tile, {
      fetch: mockFetch,
      readCertExpiry: noCert,
      agentId: "test-agent",
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
      readCertExpiry: noCert,
      agentId: "test-agent",
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
      readCertExpiry: noCert,
      agentId: "test-agent",
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
      readCertExpiry: noCert,
      agentId: "test-agent",
    })

    expect(result.kind).toBe("website")
    expect(result.error).toContain("network timeout")
    expect(result.latency_ms).toBeNull()
  })

  it("sends GET by default and HEAD when the tile asks for it", async () => {
    mockFetch = mock(async () => ({ ok: true, status: 200 }))
    await pingWebsite(tile, { fetch: mockFetch, readCertExpiry: noCert })
    await pingWebsite(
      { ...tile, method: "HEAD" },
      { fetch: mockFetch, readCertExpiry: noCert },
    )
    const methods = mockFetch.mock.calls.map(
      (call: [string, RequestInit]) => call[1].method,
    )
    expect(methods).toEqual(["GET", "HEAD"])
  })

  it("records the status code, redirect target and certificate expiry", async () => {
    const cancel = mock(async () => undefined)
    mockFetch = mock(async () => ({
      ok: false,
      status: 302,
      headers: new Headers({ location: "/login" }),
      body: { cancel },
    }))

    const result = await pingWebsite(tile, {
      fetch: mockFetch,
      readCertExpiry: async () => "2027-01-30T17:58:47.000Z",
    })

    expect(result.status_code).toBe(302)
    expect(result.redirect_location).toBe("/login")
    expect(result.cert_expires_at).toBe("2027-01-30T17:58:47.000Z")
    // The page itself is never downloaded.
    expect(cancel).toHaveBeenCalled()
  })

  it("keeps the certificate expiry when the request fails", async () => {
    mockFetch = mock(async () => {
      throw new Error("timeout")
    })
    const result = await pingWebsite(tile, {
      fetch: mockFetch,
      readCertExpiry: async () => "2026-11-20T00:00:00.000Z",
    })
    expect(result.status_code).toBeNull()
    expect(result.cert_expires_at).toBe("2026-11-20T00:00:00.000Z")
  })

  it("reads no certificate for plain HTTP or invalid URLs", async () => {
    expect(await readCertExpiry("http://example.com")).toBeNull()
    expect(await readCertExpiry("not a url")).toBeNull()
  })
})
