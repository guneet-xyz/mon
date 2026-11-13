import { desc, eq } from "@mon/db/drizzle"
import { websitePings } from "@mon/db/schema"

import { db } from "@/lib/server/db"

import { statusFromLatestPing } from "./status"

export async function getWebsiteStatus(dbKey: string) {
  const pings = await db
    .select({ timestamp: websitePings.timestamp, error: websitePings.error })
    .from(websitePings)
    .where(eq(websitePings.key, dbKey))
    .orderBy(desc(websitePings.timestamp))
    .limit(1)

  return statusFromLatestPing(pings[0])
}
