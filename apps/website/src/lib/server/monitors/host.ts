import { db } from "@mon/db"
import { and, asc, eq, gte, isNotNull } from "@mon/db/drizzle"
import { hostPings } from "@mon/db/schema"

import type { IncidentPing } from "."

import dayjs from "dayjs"

export async function getHostPings(
  dbKey: string,
): Promise<Array<{ timestamp: Date; latency: number }>> {
  const pings = (await db
    .select({
      timestamp: hostPings.timestamp,
      latency: hostPings.latency,
    })
    .from(hostPings)
    .where(
      and(
        eq(hostPings.key, dbKey),
        isNotNull(hostPings.latency),
        gte(hostPings.timestamp, dayjs().subtract(1, "day").toDate()),
      ),
    )
    .orderBy(asc(hostPings.timestamp))) as Array<{
    timestamp: Date
    latency: number
  }>

  return pings
}

export async function getHostIncidentPings(
  dbKey: string,
): Promise<Array<IncidentPing>> {
  const pings = (await db
    .select({
      timestamp: hostPings.timestamp,
      error: hostPings.error,
    })
    .from(hostPings)
    .where(
      and(
        eq(hostPings.key, dbKey),
        isNotNull(hostPings.error),
        gte(hostPings.timestamp, dayjs().subtract(1, "day").toDate()),
      ),
    )
    .orderBy(asc(hostPings.timestamp))) as Array<{
    timestamp: Date
    error: string
  }>

  return pings
}

export async function getHostStatus(dbKey: string) {
  const pings = await db
    .select()
    .from(hostPings)
    .where(and(eq(hostPings.key, dbKey)))
    .orderBy(asc(hostPings.timestamp))
    .limit(1)

  const ping = pings[0]
  if (!ping) return "unknown" as const
  if (dayjs(ping.timestamp).diff(dayjs(), "minute") > 2)
    return "unknown" as const
  if (ping.error) return "offline" as const
  return "online" as const
}
