import {
  UnauthorizedError,
  UnreachableError,
  WebsiteApiClient,
} from "./api-client"

import { describe, expect, it, mock } from "bun:test"

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  })
}

describe("WebsiteApiClient.getJobs", () => {
  it("sends Authorization and X-Daemon-Id headers", async () => {
    const fetchMock = mock(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>
      expect(headers["Authorization"]).toBe("Bearer tok-123")
      expect(headers["X-Daemon-Id"]).toBe("daemon-A")
      return jsonResponse({ tiles: [] })
    })
    const client = new WebsiteApiClient(
      "https://x.test",
      "daemon-A",
      "tok-123",
      fetchMock as unknown as typeof fetch,
    )
    const res = await client.getJobs()
    expect(res.tiles).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("throws UnauthorizedError on 401", async () => {
    const fetchMock = mock(async () => new Response("nope", { status: 401 }))
    const client = new WebsiteApiClient(
      "https://x.test",
      "d",
      "t",
      fetchMock as unknown as typeof fetch,
    )
    await expect(client.getJobs()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it("throws UnreachableError on network failure", async () => {
    const fetchMock = mock(async () => {
      throw new Error("ECONNREFUSED")
    })
    const client = new WebsiteApiClient(
      "https://x.test",
      "d",
      "t",
      fetchMock as unknown as typeof fetch,
    )
    await expect(client.getJobs()).rejects.toBeInstanceOf(UnreachableError)
  })
})

describe("WebsiteApiClient.pushHostPing", () => {
  it("parses { ok: true, deduplicated: true } on 409", async () => {
    const fetchMock = mock(async () =>
      jsonResponse({ ok: true, deduplicated: true }, { status: 409 }),
    )
    const client = new WebsiteApiClient(
      "https://x.test",
      "d",
      "t",
      fetchMock as unknown as typeof fetch,
    )
    const res = await client.pushHostPing({
      kind: "host",
      ping_id: "11111111-1111-1111-1111-111111111111",
      daemon_id: "d",
      recorded_at: "2026-05-18T00:00:00.000Z",
      key: "k",
      latency_ms: 5,
      error: null,
    })
    expect(res).toEqual({ ok: true, deduplicated: true })
  })

  it("parses { ok: true, deduplicated: false } on 200", async () => {
    const fetchMock = mock(async () =>
      jsonResponse({ ok: true, deduplicated: false }),
    )
    const client = new WebsiteApiClient(
      "https://x.test",
      "d",
      "t",
      fetchMock as unknown as typeof fetch,
    )
    const res = await client.pushHostPing({
      kind: "host",
      ping_id: "22222222-2222-2222-2222-222222222222",
      daemon_id: "d",
      recorded_at: "2026-05-18T00:00:00.000Z",
      key: "k",
      latency_ms: 5,
      error: null,
    })
    expect(res.deduplicated).toBe(false)
  })

  it("throws UnauthorizedError on 401", async () => {
    const fetchMock = mock(async () => new Response("", { status: 401 }))
    const client = new WebsiteApiClient(
      "https://x.test",
      "d",
      "t",
      fetchMock as unknown as typeof fetch,
    )
    await expect(
      client.pushHostPing({
        kind: "host",
        ping_id: "33333333-3333-3333-3333-333333333333",
        daemon_id: "d",
        recorded_at: "2026-05-18T00:00:00.000Z",
        key: "k",
        latency_ms: 5,
        error: null,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it("throws UnreachableError on network failure", async () => {
    const fetchMock = mock(async () => {
      throw new Error("ECONNRESET")
    })
    const client = new WebsiteApiClient(
      "https://x.test",
      "d",
      "t",
      fetchMock as unknown as typeof fetch,
    )
    await expect(
      client.pushHostPing({
        kind: "host",
        ping_id: "44444444-4444-4444-4444-444444444444",
        daemon_id: "d",
        recorded_at: "2026-05-18T00:00:00.000Z",
        key: "k",
        latency_ms: null,
        error: "timeout",
      }),
    ).rejects.toBeInstanceOf(UnreachableError)
  })
})
