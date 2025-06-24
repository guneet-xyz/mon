import type { Github } from "@mon/config/schema"
import { db } from "@mon/db"
import {
  type DbInsertGithubCheckRun,
  githubCheckRun,
  githubPings,
} from "@mon/db/schema"
import { env } from "@mon/env"

import { scheduleJob } from "node-schedule"
import { z } from "zod"

export function scheduleGithubJob(gh: Github) {
  scheduleJob(`github-${gh.key}`, "0 * * * * *", async () => {
    console.log(`Pinging GitHub: ${gh.key} (${gh.repo})`)
    const timestamp = new Date()
    const resp = await ping(gh.repo)
    if (!resp.success) {
      console.error(`Error pinging GitHub ${gh.key}:`, resp.error)
      await db.insert(githubPings).values({
        key: gh.key,
        timestamp: timestamp,
        error: resp.error,
      })
    } else {
      console.log(`GitHub ${gh.key} pinged successfully`)
      const commit_hash = resp.data.commit_hash
      const runs = resp.data.runs
      const ids = await db
        .insert(githubCheckRun)
        .values(runs)
        .returning({ id: githubCheckRun._id })
      await db.insert(githubPings).values(
        ids.map(({ id }) => ({
          key: gh.key,
          timestamp: timestamp,
          commitHash: commit_hash,
          checkRunId: id,
        })),
      )
    }
  })
}

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

async function ping(repo: string): Promise<
  | {
      success: true
      data: {
        commit_hash: string
        runs: Array<DbInsertGithubCheckRun>
      }
    }
  | { success: false; error: string }
> {
  try {
    const url = `https://api.github.com/repos/${repo}/commits/HEAD/check-runs`
    const headers = {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-Github-Api-Version": "2022-11-28",
    }

    let resp: Response
    try {
      resp = await fetch(url, {
        headers,
      })
    } catch (error) {
      if (error instanceof Error) throw error.message
      throw "Unknown error occurred while fetching GitHub API"
    }

    if (!resp.ok)
      throw `GitHub API request failed with status ${resp.status}: ${resp.statusText}`

    let json: unknown
    try {
      json = await resp.json()
    } catch (error) {
      if (error instanceof Error) throw error.message
      throw "Unknown error occurred while parsing GitHub API response"
    }
    console.log("GitHub API response:", json)

    const { data, success, error } = ResponseSchema.safeParse(json)
    if (!success)
      return { success: false, error: `couldn't parse output: ${error}` }

    const _commit_hash = new Set(data.check_runs.map((run) => run.head_sha))
    if (_commit_hash.size !== 1)
      return {
        success: false,
        error: "How did you get here? (multiple commit hashes found)",
      }

    const commit_hash = _commit_hash.values().next().value
    if (!commit_hash)
      return {
        success: false,
        error: "How did you get here? (no commit has found in response)",
      }

    const runs = data.check_runs.map((run) => ({
      id: run.id,
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      detailsUrl: run.details_url,
      startedAt: run.started_at,
      completedAt: run.completed_at,
    }))

    return {
      success: true,
      data: {
        commit_hash: commit_hash,
        runs: runs,
      },
    }
  } catch (error) {
    let errorMessage: string

    if (error instanceof Error) errorMessage = error.message
    else if (typeof error === "string") errorMessage = error
    else errorMessage = "An unknown error occurred"

    return { success: false, error: errorMessage }
  }
}
