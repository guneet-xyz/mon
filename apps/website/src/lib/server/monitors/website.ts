import { db } from "@mon/db"
import { and, asc, desc, eq, gte, isNotNull } from "@mon/db/drizzle"
import { websitePings } from "@mon/db/schema"

import type { IncidentPing } from "."

import dayjs from "dayjs"

export async function getWebsiteIncidentPings(
  dbKey: string,
): Promise<Array<IncidentPing>> {
  const pings = (await db
    .select({
      timestamp: websitePings.timestamp,
      error: websitePings.error,
    })
    .from(websitePings)
    .where(
      and(
        eq(websitePings.key, dbKey),
        isNotNull(websitePings.error),
        gte(websitePings.timestamp, dayjs().subtract(1, "day").toDate()),
      ),
    )
    .orderBy(asc(websitePings.timestamp))) as Array<{
    timestamp: Date
    error: string
  }>

  return pings
}

export async function getWebsiteStatus(dbKey: string) {
  const pings = await db
    .select()
    .from(websitePings)
    .where(and(eq(websitePings.key, dbKey)))
    .orderBy(desc(websitePings.timestamp))
    .limit(1)

  const ping = pings[0]
  if (!ping) return "unknown" as const
  if (dayjs(ping.timestamp).diff(dayjs(), "minute") > 2)
    return "unknown" as const
  if (ping.error) return "offline" as const
  return "online" as const
}

export async function getWebsitePings(
  dbKey: string,
): Promise<Array<{ timestamp: Date; latency: number }>> {
  const pings = (await db
    .select({
      timestamp: websitePings.timestamp,
      latency: websitePings.latency,
    })
    .from(websitePings)
    .where(
      and(
        eq(websitePings.key, dbKey),
        isNotNull(websitePings.latency),
        gte(websitePings.timestamp, dayjs().subtract(1, "day").toDate()),
      ),
    )
    .orderBy(asc(websitePings.timestamp))) as Array<{
    timestamp: Date
    latency: number
  }>

  return pings
}
