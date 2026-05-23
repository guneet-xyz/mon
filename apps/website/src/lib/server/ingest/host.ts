import type { HostPingDTO } from "@mon/contracts"
import type { Db } from "@mon/db"
import { hostPings } from "@mon/db/schema"

import { db as defaultDb } from "@/lib/server/db"

export async function insertHostPing(
  dto: HostPingDTO,
  deps: { db?: Db } = {},
): Promise<{ ok: true; deduplicated: boolean }> {
  const db = deps.db ?? defaultDb
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
