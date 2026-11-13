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
      state: dto.state ?? null,
      health: dto.health ?? null,
      restartCount: dto.restart_count ?? null,
      startedAt: dto.started_at ? new Date(dto.started_at) : null,
      exitCode: dto.exit_code ?? null,
      oomKilled: dto.oom_killed ?? null,
      image: dto.image ?? null,
      imageVersion: dto.image_version ?? null,
      cpuPercent: dto.cpu_percent ?? null,
      memoryBytes: dto.memory_bytes ?? null,
      memoryLimitBytes: dto.memory_limit_bytes ?? null,
    })
    .onConflictDoNothing({ target: containerPings.pingId })
    .returning({ pingId: containerPings.pingId })
  return { ok: true, deduplicated: rows.length === 0 }
}
