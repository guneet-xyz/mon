import tls from "node:tls"

import type { WebsiteJobTile, WebsitePingDTO } from "@mon/contracts"

import { env } from "../env"

const REQUEST_TIMEOUT_MS = 15_000
const CERT_TIMEOUT_MS = 10_000

// Expiry of the certificate an HTTPS site presents, or null for plain HTTP
// and when it cannot be read. The chain is not verified: an expired or
// otherwise invalid certificate is exactly what this should report.
export function readCertExpiry(url: string): Promise<string | null> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return Promise.resolve(null)
  }
  if (parsed.protocol !== "https:") return Promise.resolve(null)

  return new Promise((resolve) => {
    const socket = tls.connect({
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 443,
      servername: parsed.hostname,
      rejectUnauthorized: false,
      timeout: CERT_TIMEOUT_MS,
    })
    const done = (value: string | null) => {
      socket.destroy()
      resolve(value)
    }
    socket.once("secureConnect", () => {
      const validTo = socket.getPeerCertificate()?.valid_to
      const expires = validTo ? new Date(validTo) : null
      done(
        expires && !Number.isNaN(expires.getTime())
          ? expires.toISOString()
          : null,
      )
    })
    socket.once("timeout", () => done(null))
    socket.once("error", () => done(null))
  })
}

export async function pingWebsite(
  tile: WebsiteJobTile,
  deps?: {
    fetch?: typeof globalThis.fetch
    readCertExpiry?: (url: string) => Promise<string | null>
    agentId?: string
  },
): Promise<WebsitePingDTO> {
  const pingId = crypto.randomUUID()
  const agentId = deps?.agentId ?? env.AGENT_ID
  const recordedAt = new Date().toISOString()
  const key = tile.id
  const certExpiry = (deps?.readCertExpiry ?? readCertExpiry)(tile.url)
  const start = Date.now()

  try {
    const fetchFn = deps?.fetch ?? globalThis.fetch
    const res = await fetchFn(tile.url, {
      method: tile.method ?? "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const latencyMs = Date.now() - start
    // Only the status and headers matter; don't download the page.
    await res.body?.cancel().catch(() => undefined)

    const redirect = res.status >= 300 && res.status < 400
    const up = res.ok || redirect
    return {
      kind: "website",
      ping_id: pingId,
      agent_id: agentId,
      recorded_at: recordedAt,
      key,
      latency_ms: up ? latencyMs : null,
      error: up ? null : `HTTP ${res.status}`,
      status_code: res.status,
      redirect_location: redirect
        ? (res.headers?.get("location")?.slice(0, 512) ?? null)
        : null,
      cert_expires_at: await certExpiry,
    }
  } catch (error) {
    return {
      kind: "website",
      ping_id: pingId,
      agent_id: agentId,
      recorded_at: recordedAt,
      key,
      latency_ms: null,
      error: String(error).slice(0, 256),
      status_code: null,
      redirect_location: null,
      cert_expires_at: await certExpiry,
    }
  }
}
