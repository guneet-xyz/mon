import { desc, eq } from "@mon/db/drizzle"
import { hostPings } from "@mon/db/schema"

import { db } from "@/lib/server/db"

import { statusFromLatestPing } from "./status"

export async function getHostStatus(dbKey: string) {
  const pings = await db
    .select({ timestamp: hostPings.timestamp, error: hostPings.error })
    .from(hostPings)
    .where(eq(hostPings.key, dbKey))
    .orderBy(desc(hostPings.timestamp))
    .limit(1)

  return statusFromLatestPing(pings[0])
}
