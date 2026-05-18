import type { GithubCheckRunDTO, GithubPingDTO } from "@mon/contracts"
import { db } from "@mon/db"
import { githubCheckRun, githubPings } from "@mon/db/schema"

export async function insertGithubCheckRun(
  dto: GithubCheckRunDTO,
): Promise<{ ok: true; deduplicated: boolean }> {
  const rows = await db
    .insert(githubCheckRun)
    .values({
      pingId: dto.ping_id,
      daemonId: dto.daemon_id,
      id: dto.id,
      name: dto.name,
      status: dto.status,
      conclusion: dto.conclusion ?? null,
      detailsUrl: dto.details_url ?? null,
      startedAt: dto.started_at ? new Date(dto.started_at) : null,
      completedAt: dto.completed_at ? new Date(dto.completed_at) : null,
    })
    .onConflictDoNothing({ target: githubCheckRun.pingId })
    .returning({ pingId: githubCheckRun.pingId })
  return { ok: true, deduplicated: rows.length === 0 }
}

export async function insertGithubPing(
  dto: GithubPingDTO,
): Promise<{ ok: true; deduplicated: boolean }> {
  const rows = await db
    .insert(githubPings)
    .values({
      pingId: dto.ping_id,
      daemonId: dto.daemon_id,
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
