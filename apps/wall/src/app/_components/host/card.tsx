import { Status } from "@/components/status"
import { Card, CardContent } from "@/components/ui/card"

import type { Host } from "@mon/config/schema"
import { db } from "@mon/db"
import { hostPings } from "@mon/db/schema"
import dayjs from "dayjs"
import { and, desc, eq, gte } from "drizzle-orm"

export async function HostCard({ host }: { host: Host }) {
  const lastPing = await db
    .select({
      timestamp: hostPings.timestamp,
      latency: hostPings.latency,
      error: hostPings.error,
    })
    .from(hostPings)
    .where(
      and(
        eq(hostPings.key, host.key),
        gte(hostPings.timestamp, dayjs().subtract(1, "minute").toDate()),
      ),
    )
    .orderBy(desc(hostPings.timestamp))
    .limit(1)

  const onlineStatus =
    lastPing[0] === undefined
      ? ("unknown" as const)
      : lastPing[0].error
        ? ("offline" as const)
        : ("online" as const)

  return (
    <Card className="w-[300px]">
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="font-display">{host.name}</div>
          <Status status={onlineStatus} />
        </div>
        <div className="font-display text-sm text-neutral-500">
          {host.address}
        </div>
      </CardContent>
    </Card>
  )
}
