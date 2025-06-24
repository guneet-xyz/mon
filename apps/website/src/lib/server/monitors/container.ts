import type { IncidentPing } from "."

import { db } from "@mon/db"
import { and, asc, eq, gte, isNotNull } from "@mon/db/drizzle"
import { containerPings } from "@mon/db/schema"
import dayjs from "dayjs"

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
    .orderBy(asc(containerPings.timestamp))
    .limit(1)

  const ping = pings[0]
  if (!ping) return "unknown" as const
  if (dayjs(ping.timestamp).diff(dayjs(), "minute") > 2)
    return "unknown" as const
  if (ping.error) return "offline" as const
  return "online" as const
}
