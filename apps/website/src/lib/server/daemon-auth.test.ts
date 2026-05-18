import type { Config } from "@mon/config"

import { hashToken, verifyBearerToken } from "@/lib/server/daemon-auth"

import { describe, expect, it } from "bun:test"

const TOKEN = "super-secret-daemon-token-with-enough-entropy-1234"

function makeConfig(): Config {
  return {
    options: {
      ping_interval_ms: 6000,
      max_retries: 3,
      retry_delay_ms: 1000,
      default_tile: "empty",
      desktop: { rows: 8, columns: 5 },
    },
    daemons: {
      default: { token_hash: hashToken(TOKEN) },
    },
    tiles: [],
  }
}

function makeRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/ingest", { headers })
}

describe("hashToken", () => {
  it("returns 64-char hex string", () => {
    const h = hashToken("hello")
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h.length).toBe(64)
  })
})

describe("verifyBearerToken", () => {
  it("returns missing when Authorization header is absent", () => {
    const config = makeConfig()
    const req = makeRequest({ "X-Daemon-Id": "default" })
    expect(verifyBearerToken(req, config)).toEqual({ error: "missing" })
  })

  it("returns missing when X-Daemon-Id header is absent", () => {
    const config = makeConfig()
    const req = makeRequest({ Authorization: `Bearer ${TOKEN}` })
    expect(verifyBearerToken(req, config)).toEqual({ error: "missing" })
  })

  it("returns malformed when Authorization lacks Bearer prefix", () => {
    const config = makeConfig()
    const req = makeRequest({
      Authorization: TOKEN,
      "X-Daemon-Id": "default",
    })
    expect(verifyBearerToken(req, config)).toEqual({ error: "malformed" })
  })

  it("returns malformed when Authorization scheme is wrong", () => {
    const config = makeConfig()
    const req = makeRequest({
      Authorization: `Basic ${TOKEN}`,
      "X-Daemon-Id": "default",
    })
    expect(verifyBearerToken(req, config)).toEqual({ error: "malformed" })
  })

  it("returns unauthorized when daemonId is unknown", () => {
    const config = makeConfig()
    const req = makeRequest({
      Authorization: `Bearer ${TOKEN}`,
      "X-Daemon-Id": "unknown",
    })
    expect(verifyBearerToken(req, config)).toEqual({ error: "unauthorized" })
  })

  it("returns unauthorized when token is wrong", () => {
    const config = makeConfig()
    const req = makeRequest({
      Authorization: `Bearer wrong-token-value`,
      "X-Daemon-Id": "default",
    })
    expect(verifyBearerToken(req, config)).toEqual({ error: "unauthorized" })
  })

  it("returns daemonId when token is correct", () => {
    const config = makeConfig()
    const req = makeRequest({
      Authorization: `Bearer ${TOKEN}`,
      "X-Daemon-Id": "default",
    })
    expect(verifyBearerToken(req, config)).toEqual({ daemonId: "default" })
  })
})
