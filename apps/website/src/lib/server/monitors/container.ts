import { desc, eq } from "@mon/db/drizzle"
import { containerPings } from "@mon/db/schema"

import { db } from "@/lib/server/db"

import { statusFromLatestPing } from "./status"

export async function getContainerStatus(dbKey: string) {
  const pings = await db
    .select({
      timestamp: containerPings.timestamp,
      error: containerPings.error,
    })
    .from(containerPings)
    .where(eq(containerPings.key, dbKey))
    .orderBy(desc(containerPings.timestamp))
    .limit(1)

  return statusFromLatestPing(pings[0])
}
