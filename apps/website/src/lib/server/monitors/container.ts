import dayjs from "dayjs"

import { and, asc, desc, eq, gte, isNotNull } from "@mon/db/drizzle"
import { containerPings } from "@mon/db/schema"

import { db } from "@/lib/server/db"

import type { IncidentPing } from "."
import { statusFromLatestPing } from "./status"

export async function getContainerIncidentPings(
  dbKey: string,
): Promise<Array<IncidentPing>> {
  const pings = (await db
    .select({
      timestamp: containerPings.timestamp,
      error: containerPings.error,
    })
    .from(containerPings)
    .where(
      and(
        eq(containerPings.key, dbKey),
        isNotNull(containerPings.error),
        gte(containerPings.timestamp, dayjs().subtract(1, "day").toDate()),
      ),
    )
    .orderBy(asc(containerPings.timestamp))) as Array<{
    timestamp: Date
    error: string
  }>

  return pings
}

export async function getContainerStatus(dbKey: string) {
  const pings = await db
    .select()
    .from(containerPings)
    .where(and(eq(containerPings.key, dbKey)))
    .orderBy(desc(containerPings.timestamp))
    .limit(1)

  return statusFromLatestPing(pings[0])
}
