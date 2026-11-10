import type { GithubCheckRunDTO, GithubPingDTO } from "@mon/contracts"
import type { Db } from "@mon/db"
import { githubCheckRun, githubPings } from "@mon/db/schema"

import { db as defaultDb } from "@/lib/server/db"

// Check runs are keyed by GitHub's id. A run is reported on every poll while
// its status changes (queued → in_progress → completed), so later reports
// update the stored row instead of being rejected by the unique id.
export async function insertGithubCheckRun(
  dto: GithubCheckRunDTO,
  deps: { db?: Db } = {},
): Promise<{ ok: true; deduplicated: boolean }> {
  const db = deps.db ?? defaultDb
  const fields = {
    name: dto.name,
    status: dto.status,
    conclusion: dto.conclusion ?? null,
    detailsUrl: dto.details_url ?? null,
    startedAt: dto.started_at ? new Date(dto.started_at) : null,
    completedAt: dto.completed_at ? new Date(dto.completed_at) : null,
  }
  const rows = await db
    .insert(githubCheckRun)
    .values({
      pingId: dto.ping_id,
      agentId: dto.agent_id,
      id: dto.id,
      ...fields,
    })
    .onConflictDoUpdate({ target: githubCheckRun.id, set: fields })
    .returning({ pingId: githubCheckRun.pingId })
  return { ok: true, deduplicated: rows[0]?.pingId !== dto.ping_id }
}

export async function insertGithubPing(
  dto: GithubPingDTO,
  deps: { db?: Db } = {},
): Promise<{ ok: true; deduplicated: boolean }> {
  const db = deps.db ?? defaultDb
  const rows = await db
    .insert(githubPings)
    .values({
      pingId: dto.ping_id,
      agentId: dto.agent_id,
      key: dto.key,
      timestamp: new Date(dto.recorded_at),
      commitHash: dto.commit_hash ?? null,
      checkRunId: dto.check_run_id ?? null,
      error: dto.error ?? null,
    })
    .onConflictDoNothing({ target: githubPings.pingId })
    .returning({ pingId: githubPings.pingId })
  return { ok: true, deduplicated: rows.length === 0 }
}
