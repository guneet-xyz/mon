import { daemonEnv } from "@mon/env"
import type { WebsiteJobTile, WebsitePingDTO } from "@mon/contracts"

export async function pingWebsite(
  tile: WebsiteJobTile,
  deps?: { fetch?: typeof globalThis.fetch; daemonId?: string },
): Promise<WebsitePingDTO> {
  const pingId = crypto.randomUUID()
  const daemonId = deps?.daemonId ?? daemonEnv.DAEMON_ID
  const recordedAt = new Date().toISOString()
  const key = `website:${tile.url}`
  const start = Date.now()

  try {
    const fetchFn = deps?.fetch ?? globalThis.fetch
    const res = await fetchFn(tile.url, { method: "HEAD", redirect: "manual" })
    const latencyMs = Date.now() - start

    if (res.ok || (res.status >= 300 && res.status < 400)) {
      return {
        kind: "website",
        ping_id: pingId,
        daemon_id: daemonId,
        recorded_at: recordedAt,
        key,
        latency_ms: latencyMs,
        error: null,
      }
    }

    return {
      kind: "website",
      ping_id: pingId,
      daemon_id: daemonId,
      recorded_at: recordedAt,
      key,
      latency_ms: null,
      error: `HTTP ${res.status}`,
    }
  } catch (error) {
    return {
      kind: "website",
      ping_id: pingId,
      daemon_id: daemonId,
      recorded_at: recordedAt,
      key,
      latency_ms: null,
      error: String(error),
    }
  }
}
