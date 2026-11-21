import { desc, eq } from "@mon/db/drizzle"
import { githubPings } from "@mon/db/schema"

import { db } from "@/lib/server/db"

import { staleAfterMs, statusFromLatestPing } from "./status"

export async function getGithubStatus(dbKey: string, intervalSeconds?: number) {
  const pings = await db
    .select({ timestamp: githubPings.timestamp, error: githubPings.error })
    .from(githubPings)
    .where(eq(githubPings.key, dbKey))
    .orderBy(desc(githubPings.timestamp))
    .limit(1)

  return statusFromLatestPing(
    pings[0],
    new Date(),
    staleAfterMs(intervalSeconds),
  )
}
