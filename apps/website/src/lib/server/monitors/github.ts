import type { IncidentPing } from "."

import { db } from "@mon/db"
import { and, asc, eq, gte, isNotNull, isNull } from "@mon/db/drizzle"
import { type DbSelectGithubPing, githubPings } from "@mon/db/schema"
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
    .orderBy(asc(githubPings.timestamp))
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
    .orderBy(asc(githubPings.timestamp))) as Array<{
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
    .orderBy(asc(githubPings.timestamp))
    .limit(1)

  const ping = pings[0]
  if (!ping) return "unknown" as const
  if (dayjs(ping.timestamp).diff(dayjs(), "minute") > 2)
    return "unknown" as const
  if (ping.error) return "offline" as const
  return "online" as const
}
