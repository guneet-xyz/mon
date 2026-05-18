import type { HostPingDTO } from "@mon/contracts"
import { db } from "@mon/db"
import { hostPings } from "@mon/db/schema"

export async function insertHostPing(
  dto: HostPingDTO,
): Promise<{ ok: true; deduplicated: boolean }> {
  const rows = await db
    .insert(hostPings)
    .values({
      pingId: dto.ping_id,
      agentId: dto.agent_id,
      key: dto.key,
      timestamp: new Date(dto.recorded_at),
      latency: dto.latency_ms,
      error: dto.error,
    })
    .onConflictDoNothing({ target: hostPings.pingId })
    .returning({ pingId: hostPings.pingId })
  return { ok: true, deduplicated: rows.length === 0 }
}
