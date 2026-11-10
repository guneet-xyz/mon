import type {
  GithubCheckRunDTO,
  GithubJobTile,
  GithubPingDTO,
} from "@mon/contracts"

import { env } from "../env"

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

export type GithubJobResult = {
  // One ping per check run (each referencing it), or a single error ping.
  pings: GithubPingDTO[]
  checkRuns: GithubCheckRunDTO[]
}

export async function pingGithub(
  tile: GithubJobTile,
  deps?: { fetch?: typeof globalThis.fetch; agentId?: string },
): Promise<GithubJobResult> {
  const agentId = deps?.agentId ?? env.AGENT_ID
  const recordedAt = new Date().toISOString()
  const key = tile.id
  const token = tile.github_token

  const failure = (error: string): GithubJobResult => ({
    pings: [
      {
        kind: "github_ping",
        ping_id: crypto.randomUUID(),
        agent_id: agentId,
        recorded_at: recordedAt,
        key,
        commit_hash: null,
        check_run_id: null,
        error,
      },
    ],
    checkRuns: [],
  })

  try {
    const fetchFn = deps?.fetch ?? globalThis.fetch
    const baseUrl = env.GITHUB_API_BASE_URL ?? "https://api.github.com"
    const url = `${baseUrl}/repos/${tile.repo}/commits/HEAD/check-runs`
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
      return failure(error instanceof Error ? error.message : String(error))
    }

    if (!resp.ok) {
      return failure(
        `GitHub API request failed with status ${resp.status}: ${resp.statusText}`,
      )
    }

    let json: unknown
    try {
      json = await resp.json()
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error))
    }

    const { data, success, error } = ResponseSchema.safeParse(json)
    if (!success) {
      return failure(`couldn't parse output: ${error}`)
    }

    if (data.check_runs.length === 0) {
      return failure("no check runs")
    }

    const commitHashes = new Set(data.check_runs.map((run) => run.head_sha))
    if (commitHashes.size !== 1) {
      return failure("multiple commit hashes found")
    }

    const commit_hash = commitHashes.values().next().value
    if (!commit_hash) {
      return failure("no commit hash found in response")
    }

    // The website stores check runs by GitHub id and links each ping row to
    // one of them, so check runs must be pushed before the pings.
    const checkRuns: GithubCheckRunDTO[] = data.check_runs.map((run) => ({
      kind: "github_check_run",
      ping_id: crypto.randomUUID(),
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

    const pings: GithubPingDTO[] = data.check_runs.map((run) => ({
      kind: "github_ping",
      ping_id: crypto.randomUUID(),
      agent_id: agentId,
      recorded_at: recordedAt,
      key,
      commit_hash,
      check_run_id: run.id,
      error: null,
    }))

    return { pings, checkRuns }
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error))
  }
}
