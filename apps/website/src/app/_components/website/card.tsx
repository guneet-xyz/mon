import { Status } from "@/components/status"
import { Card, CardContent } from "@/components/ui/card"

import type { Website } from "@mon/config/schema"
import { db } from "@mon/db"
import { websitePings } from "@mon/db/schema"
import dayjs from "dayjs"
import { and, desc, eq, gte } from "drizzle-orm"

export async function WebsiteCard({ website }: { website: Website }) {
  const lastPing = await db
    .select({
      timestamp: websitePings.timestamp,
      latency: websitePings.latency,
      error: websitePings.error,
    })
    .from(websitePings)
    .where(
      and(
        eq(websitePings.key, website.key),
        gte(websitePings.timestamp, dayjs().subtract(1, "minute").toDate()),
      ),
    )
    .orderBy(desc(websitePings.timestamp))
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
          <div className="font-display">{website.name}</div>
          <Status status={onlineStatus} />
        </div>
        <div className="font-display text-sm text-neutral-500">
          {website.url}
        </div>
      </CardContent>
    </Card>
  )
}
