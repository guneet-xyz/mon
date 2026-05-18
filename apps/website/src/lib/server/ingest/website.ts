import type { WebsitePingDTO } from "@mon/contracts"
import { db } from "@mon/db"
import { websitePings } from "@mon/db/schema"

export async function insertWebsitePing(
  dto: WebsitePingDTO,
): Promise<{ ok: true; deduplicated: boolean }> {
  const rows = await db
    .insert(websitePings)
    .values({
      pingId: dto.ping_id,
      daemonId: dto.daemon_id,
      key: dto.key,
      timestamp: new Date(dto.recorded_at),
      latency: dto.latency_ms,
      error: dto.error,
    })
    .onConflictDoNothing({ target: websitePings.pingId })
    .returning({ pingId: websitePings.pingId })
  return { ok: true, deduplicated: rows.length === 0 }
}
