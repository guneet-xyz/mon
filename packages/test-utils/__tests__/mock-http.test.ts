import { type MockHttpHost, createMockHttpHost } from "../index"

import { afterEach, describe, expect, it } from "bun:test"

describe("createMockHttpHost", () => {
  let host: MockHttpHost | undefined

  afterEach(async () => {
    await host?.stop()
    host = undefined
  })

  it("ok: responds 200 with HEAD and records the request", async () => {
    host = await createMockHttpHost()
    host.setScenario({ kind: "ok", status: 200, body: "hello" })

    const res = await fetch(host.url, { method: "HEAD" })
    expect(res.status).toBe(200)
    expect(host.requests.length).toBe(1)
    expect(host.requests[0]?.method).toBe("HEAD")
  })

  it("redirect: returns 3xx with Location header (manual redirect)", async () => {
    host = await createMockHttpHost()
    host.setScenario({
      kind: "redirect",
      status: 301,
      location: "https://example.test/new",
    })

    const res = await fetch(host.url, {
      method: "HEAD",
      redirect: "manual",
    })
    expect(res.status).toBe(301)
    expect(res.headers.get("location")).toBe("https://example.test/new")
  })

  it("server_error: returns the configured 5xx status", async () => {
    host = await createMockHttpHost()
    host.setScenario({ kind: "server_error", status: 503 })

    const res = await fetch(host.url, { method: "HEAD" })
    expect(res.status).toBe(503)
  })

  it("slow: delays the response by ~delayMs", async () => {
    host = await createMockHttpHost()
    host.setScenario({ kind: "slow", delayMs: 200 })

    const start = Date.now()
    const res = await fetch(host.url, { method: "HEAD" })
    const elapsed = Date.now() - start
    expect(res.status).toBe(200)
    expect(elapsed).toBeGreaterThanOrEqual(180)
  })

  it("tcp_reset: connection is destroyed, fetch throws", async () => {
    host = await createMockHttpHost()
    host.setScenario({ kind: "tcp_reset" })

    let threw = false
    try {
      await fetch(host.url, { method: "HEAD" })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })

  it("no_response: connection accepted but server never responds (AbortController)", async () => {
    host = await createMockHttpHost()
    host.setScenario({ kind: "no_response" })

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 250)
    let aborted = false
    try {
      await fetch(host.url, { method: "HEAD", signal: ctrl.signal })
    } catch (err) {
      aborted =
        (err as Error).name === "AbortError" || String(err).includes("abort")
    }
    clearTimeout(timer)
    expect(aborted).toBe(true)
    expect(host.requests.length).toBe(1)
  })
})
