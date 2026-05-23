import type { ContainerPingDTO } from "@mon/contracts"
import type { Db } from "@mon/db"
import { containerPings } from "@mon/db/schema"

import { db as defaultDb } from "@/lib/server/db"

export async function insertContainerPing(
  dto: ContainerPingDTO,
  deps: { db?: Db } = {},
): Promise<{ ok: true; deduplicated: boolean }> {
  const db = deps.db ?? defaultDb
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
