import type { SystemPingDTO } from "@mon/contracts"
import type { Db } from "@mon/db"
import { systemPings } from "@mon/db/schema"

import { db as defaultDb } from "@/lib/server/db"

export async function insertSystemPing(
  dto: SystemPingDTO,
  deps: { db?: Db } = {},
): Promise<{ ok: true; deduplicated: boolean }> {
  const db = deps.db ?? defaultDb
  const rows = await db
    .insert(systemPings)
    .values({
      pingId: dto.ping_id,
      agentId: dto.agent_id,
      key: dto.key,
      timestamp: new Date(dto.recorded_at),
      error: dto.error,
      cpuPercent: dto.cpu_percent,
      memoryBytes: dto.memory_used_bytes,
      memoryTotalBytes: dto.memory_total_bytes,
      uptimeSeconds: dto.uptime_seconds,
      disks: dto.disks.map((disk) => ({
        name: disk.name,
        usedBytes: disk.used_bytes,
        totalBytes: disk.total_bytes,
      })),
    })
    .onConflictDoNothing({ target: systemPings.pingId })
    .returning({ pingId: systemPings.pingId })
  return { ok: true, deduplicated: rows.length === 0 }
}
