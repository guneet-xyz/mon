import type {
  GithubCheckRunDTO,
  GithubJobTile,
  GithubPingDTO,
} from "@mon/contracts"
import { agentEnv } from "@mon/env"

import { z } from "zod"

const ResponseSchema = z.object({
  check_runs: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      status: z.enum([
        "queued",
        "in_progress",
        "completed",
        "waiting",
        "requested",
        "pending",
      ]),
      conclusion: z
        .enum([
          "success",
          "failure",
          "neutral",
          "cancelled",
          "skipped",
          "timed_out",
          "action_required",
        ])
        .nullable(),
      details_url: z.string(),
      started_at: z.coerce.date(),
      completed_at: z.coerce.date().nullable(),
      head_sha: z.string(),
    }),
  ),
})

export async function pingGithub(
  tile: GithubJobTile,
  deps?: { fetch?: typeof globalThis.fetch; agentId?: string },
): Promise<{ ping: GithubPingDTO; checkRuns: GithubCheckRunDTO[] }> {
  const agentId = deps?.agentId ?? agentEnv.AGENT_ID
  const recordedAt = new Date().toISOString()
  const key = `github:${tile.repo}`
  const token = tile.github_token

  try {
    const fetchFn = deps?.fetch ?? globalThis.fetch
    const url = `https://api.github.com/repos/${tile.repo}/commits/HEAD/check-runs`
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "X-Github-Api-Version": "2022-11-28",
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    let resp: Response
    try {
      resp = await fetchFn(url, { headers })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return {
        ping: {
          kind: "github_ping",
          ping_id: crypto.randomUUID(),
          agent_id: agentId,
          recorded_at: recordedAt,
          key,
          commit_hash: null,
          check_run_id: null,
          error: errorMsg,
        },
        checkRuns: [],
      }
    }

    if (!resp.ok) {
      const errorMsg = `GitHub API request failed with status ${resp.status}: ${resp.statusText}`
      return {
        ping: {
          kind: "github_ping",
          ping_id: crypto.randomUUID(),
          agent_id: agentId,
          recorded_at: recordedAt,
          key,
          commit_hash: null,
          check_run_id: null,
          error: errorMsg,
        },
        checkRuns: [],
      }
    }

    let json: unknown
    try {
      json = await resp.json()
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return {
        ping: {
          kind: "github_ping",
          ping_id: crypto.randomUUID(),
          agent_id: agentId,
          recorded_at: recordedAt,
          key,
          commit_hash: null,
          check_run_id: null,
          error: errorMsg,
        },
        checkRuns: [],
      }
    }

    const { data, success, error } = ResponseSchema.safeParse(json)
    if (!success) {
      return {
        ping: {
          kind: "github_ping",
          ping_id: crypto.randomUUID(),
          agent_id: agentId,
          recorded_at: recordedAt,
          key,
          commit_hash: null,
          check_run_id: null,
          error: `couldn't parse output: ${error}`,
        },
        checkRuns: [],
      }
    }

    if (data.check_runs.length === 0) {
      return {
        ping: {
          kind: "github_ping",
          ping_id: crypto.randomUUID(),
          agent_id: agentId,
          recorded_at: recordedAt,
          key,
          commit_hash: null,
          check_run_id: null,
          error: "no check runs",
        },
        checkRuns: [],
      }
    }

    const _commit_hash = new Set(data.check_runs.map((run) => run.head_sha))
    if (_commit_hash.size !== 1) {
      return {
        ping: {
          kind: "github_ping",
          ping_id: crypto.randomUUID(),
          agent_id: agentId,
          recorded_at: recordedAt,
          key,
          commit_hash: null,
          check_run_id: null,
          error: "multiple commit hashes found",
        },
        checkRuns: [],
      }
    }

    const commit_hash = _commit_hash.values().next().value
    if (!commit_hash) {
      return {
        ping: {
          kind: "github_ping",
          ping_id: crypto.randomUUID(),
          agent_id: agentId,
          recorded_at: recordedAt,
          key,
          commit_hash: null,
          check_run_id: null,
          error: "no commit hash found in response",
        },
        checkRuns: [],
      }
    }

    const pingId = crypto.randomUUID()
    const checkRuns: GithubCheckRunDTO[] = data.check_runs.map((run) => ({
      kind: "github_check_run",
      ping_id: pingId,
      agent_id: agentId,
      recorded_at: recordedAt,
      key,
      id: run.id,
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      details_url: run.details_url,
      started_at: run.started_at.toISOString(),
      completed_at: run.completed_at?.toISOString() ?? null,
    }))

    return {
      ping: {
        kind: "github_ping",
        ping_id: pingId,
        agent_id: agentId,
        recorded_at: recordedAt,
        key,
        commit_hash,
        check_run_id: data.check_runs[0]!.id,
        error: null,
      },
      checkRuns,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    return {
      ping: {
        kind: "github_ping",
        ping_id: crypto.randomUUID(),
        agent_id: agentId,
        recorded_at: recordedAt,
        key,
        commit_hash: null,
        check_run_id: null,
        error: errorMsg,
      },
      checkRuns: [],
    }
  }
}
