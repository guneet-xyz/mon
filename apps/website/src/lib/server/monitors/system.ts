import { desc, eq } from "@mon/db/drizzle"
import { systemPings } from "@mon/db/schema"

import { db } from "@/lib/server/db"

import { agentStatusFromLatestReport } from "./status"

export async function getAgentStatus(dbKey: string) {
  const reports = await db
    .select({ timestamp: systemPings.timestamp, error: systemPings.error })
    .from(systemPings)
    .where(eq(systemPings.key, dbKey))
    .orderBy(desc(systemPings.timestamp))
    .limit(1)

  return agentStatusFromLatestReport(reports[0])
}
