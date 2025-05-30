import { HostLatencyChart } from "./_client"

import type { Host } from "@mon/config/schema"
import { db } from "@mon/db"
import { hostPings } from "@mon/db/schema"
import { asc, eq } from "drizzle-orm"

export async function Host({ host }: { host: Host }) {
  const { key, name, address } = host
  const pings = await db
    .select({
      timestamp: hostPings.timestamp,
      latency: hostPings.latency,
      error: hostPings.error,
    })
    .from(hostPings)
    .where(eq(hostPings.key, key))
    .orderBy(asc(hostPings.timestamp))

  const validPings = pings
    .filter((ping) => ping.latency !== null)
    .map((ping) => ({
      timestamp: ping.timestamp,
      latency: ping.latency!,
    }))

  return (
    <div>
      <div>{key}</div>
      <HostLatencyChart pings={validPings} />
    </div>
  )
}
