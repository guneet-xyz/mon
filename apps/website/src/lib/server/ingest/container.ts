import type { ContainerPingDTO } from "@mon/contracts"
import { db } from "@/lib/server/db"
import { containerPings } from "@mon/db/schema"

export async function insertContainerPing(
  dto: ContainerPingDTO,
): Promise<{ ok: true; deduplicated: boolean }> {
  const rows = await db
    .insert(containerPings)
    .values({
      pingId: dto.ping_id,
      agentId: dto.agent_id,
      key: dto.key,
      timestamp: new Date(dto.recorded_at),
      error: dto.error,
    })
    .onConflictDoNothing({ target: containerPings.pingId })
    .returning({ pingId: containerPings.pingId })
  return { ok: true, deduplicated: rows.length === 0 }
}
