import { db } from "@mon/db"
import { hostPings } from "@mon/db/schema"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"
import { and, desc, eq, gte, isNotNull } from "drizzle-orm"

dayjs.extend(relativeTime)
export async function HostIncidents({ hostKey }: { hostKey: string }) {
  const badPings = (await db
    .select({
      timestamp: hostPings.timestamp,
      error: hostPings.error,
    })
    .from(hostPings)
    .where(
      and(
        eq(hostPings.key, hostKey),
        isNotNull(hostPings.error),
        gte(hostPings.timestamp, dayjs().subtract(1, "week").toDate()),
      ),
    )
    .orderBy(desc(hostPings.timestamp))) as Array<{
    timestamp: Date
    error: string
  }>

  const incidents: Array<{ start: Date; end: Date; message: string }> = []

  let currentIncident: { start: Date; end: Date; message: string } | null = null
  for (const ping of badPings) {
    const message = ping.error === "timeout" ? "Timeout" : ping.error
    if (!currentIncident || currentIncident.message !== message) {
      currentIncident = {
        start: ping.timestamp,
        end: dayjs(ping.timestamp).add(1, "minute").toDate(),
        message,
      }
      incidents.push(currentIncident)
    } else {
      currentIncident.end = dayjs(ping.timestamp).add(1, "minute").toDate()
    }
  }

  return (
    <div className="p-4">
      <div className="font-display mb-4 text-2xl font-bold">Incidents</div>
      {incidents.map((incident, index) => (
        <div
          key={index}
          className="mb-2 rounded-xl border border-red-700/50 bg-red-900/30 p-4"
        >
          <div className="font-display flex justify-between text-sm text-neutral-500">
            <div>
              {`Started ${dayjs(incident.start).fromNow()} and lasted ${dayjs(incident.start).to(incident.end, true)}`}
            </div>
            <div>
              {dayjs(incident.start).format("YYYY-MM-DD HH:mm:ss")} -{" "}
              {dayjs(incident.end).format("YYYY-MM-DD HH:mm:ss")}
            </div>
          </div>
          <div className="font-display dark:text-red-300">
            {incident.message}
          </div>
        </div>
      ))}
    </div>
  )
}
