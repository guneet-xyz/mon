import { and, desc, eq, gte, isNotNull, isNull } from "@mon/db/drizzle"
import { type DbSelectGithubPing, githubPings } from "@mon/db/schema"

import { db } from "@/lib/server/db"

import type { IncidentPing } from "."
import { statusFromLatestPing } from "./status"

import dayjs from "dayjs"

export async function getGithubPings(
  dbKey: string,
): Promise<Array<DbSelectGithubPing>> {
  const pings = await db
    .select()
    .from(githubPings)
    .where(
      and(
        eq(githubPings.key, dbKey),
        isNull(githubPings.error),
        gte(githubPings.timestamp, dayjs().subtract(1, "day").toDate()),
      ),
    )
    .orderBy(desc(githubPings.timestamp))
  return pings
}

export async function getGithubIncidentPings(
  dbKey: string,
): Promise<Array<IncidentPing>> {
  const pings = (await db
    .select({
      timestamp: githubPings.timestamp,
      error: githubPings.error,
    })
    .from(githubPings)
    .where(
      and(
        eq(githubPings.key, dbKey),
        isNotNull(githubPings.error),
        gte(githubPings.timestamp, dayjs().subtract(1, "day").toDate()),
      ),
    )
    .orderBy(desc(githubPings.timestamp))) as Array<{
    timestamp: Date
    error: string
  }>

  return pings
}

export async function getGithubStatus(dbKey: string) {
  const pings = await db
    .select()
    .from(githubPings)
    .where(and(eq(githubPings.key, dbKey)))
    .orderBy(desc(githubPings.timestamp))
    .limit(1)

  return statusFromLatestPing(pings[0])
}
