"use server"

import { db } from "@mon/db"
import { and, desc, eq } from "@mon/db/drizzle"
import { githubCheckRun, githubPings } from "@mon/db/schema"

export async function getLatestRuns(key: string) {
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
    .innerJoin(latestCheckRunIds, eq(githubCheckRun._id, latestCheckRunIds.id))

  const runs = latestCheckRuns.map((run) => run.github_check_run)

  return runs
}
