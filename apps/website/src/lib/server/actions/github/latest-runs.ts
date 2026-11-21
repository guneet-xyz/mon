"use server"

import { getMonitorConfig } from "@mon/config"
import { and, asc, desc, eq } from "@mon/db/drizzle"
import { githubCheckRun, githubPings } from "@mon/db/schema"

import { env } from "@/env"
import { db } from "@/lib/server/db"

// Check runs from a GitHub tile's latest commit. Only answers for GitHub tiles
// in this board's config.
export async function getLatestRuns(key: string) {
  const config = await getMonitorConfig(env.CONFIG_PATH, "github", key)
  if (!config) return null

  const latestPing = db.$with("latest_ping").as(
    db
      .select({
        commitHash: githubPings.commitHash,
        timestamp: githubPings.timestamp,
      })
      .from(githubPings)
      .where(eq(githubPings.key, key))
      .orderBy(desc(githubPings.timestamp))
      .limit(1),
  )

  const latestCheckRunIds = db.$with("latest_check_run_ids").as(
    db
      .with(latestPing)
      .select({ id: githubPings.checkRunId })
      .from(githubPings)
      .where(and(eq(githubPings.key, key)))
      .innerJoin(
        latestPing,
        and(
          eq(githubPings.timestamp, latestPing.timestamp),
          eq(githubPings.commitHash, latestPing.commitHash),
        ),
      ),
  )

  const latestCheckRuns = await db
    .with(latestCheckRunIds)
    .select()
    .from(githubCheckRun)
    .innerJoin(latestCheckRunIds, eq(githubCheckRun.id, latestCheckRunIds.id))
    .orderBy(asc(githubCheckRun.name), asc(githubCheckRun.id))

  const runs = latestCheckRuns.map((run) => run.github_check_run)

  return runs
}
