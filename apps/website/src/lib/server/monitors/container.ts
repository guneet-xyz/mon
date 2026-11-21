import { desc, eq } from "@mon/db/drizzle"
import { containerPings } from "@mon/db/schema"

import { db } from "@/lib/server/db"

import { staleAfterMs, statusFromLatestPing } from "./status"

export async function getContainerStatus(
  dbKey: string,
  intervalSeconds?: number,
) {
  const pings = await db
    .select({
      timestamp: containerPings.timestamp,
      error: containerPings.error,
    })
    .from(containerPings)
    .where(eq(containerPings.key, dbKey))
    .orderBy(desc(containerPings.timestamp))
    .limit(1)

  return statusFromLatestPing(
    pings[0],
    new Date(),
    staleAfterMs(intervalSeconds),
  )
}
