import { HostLatencyChartClientSide } from "./client"

import { db } from "@mon/db"
import { hostPings } from "@mon/db/schema"
import dayjs from "dayjs"
import { and, asc, eq, gte, isNotNull } from "drizzle-orm"

export async function HostLatencyChart({ hostKey }: { hostKey: string }) {
  const pings = (await db
    .select({
      timestamp: hostPings.timestamp,
      latency: hostPings.latency,
    })
    .from(hostPings)
    .where(
      and(
        eq(hostPings.key, hostKey),
        isNotNull(hostPings.latency),
        gte(hostPings.timestamp, dayjs().subtract(1, "day").toDate()),
      ),
    )
    .orderBy(asc(hostPings.timestamp))) as Array<{
    timestamp: Date
    latency: number
  }>

  return <HostLatencyChartClientSide pings={pings} />
}
