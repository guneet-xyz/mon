import { getIncidents } from "@/lib/server/monitors"

import type { MonitorTile } from "@mon/config/schema"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"

dayjs.extend(relativeTime)
export async function Incidents({
  type,
  dbKey,
}: {
  type: MonitorTile["type"]
  dbKey: string
}) {
  const incidents = await getIncidents(type, dbKey)

  if (incidents.length === 0) {
    return (
      <div className="p-4 font-display text-neutral-500">
        No incidents in the last 24 hours.
      </div>
    )
  }

  return (
    <div className="p-4">
      {incidents.map((incident, index) => (
        <div
          key={index}
          className="mb-2 rounded-xl border border-red-700/50 bg-red-900/30 p-4"
        >
          <div className="flex justify-between font-display text-sm text-neutral-500">
            <div>
              {`Started ${dayjs(incident.start).fromNow()} and lasted ${dayjs(incident.start).to(incident.end, true)}`}
            </div>
            <div>
              {dayjs(incident.start).format("YYYY-MM-DD HH:mm:ss")} -{" "}
              {dayjs(incident.end).format("YYYY-MM-DD HH:mm:ss")}
            </div>
          </div>
          <div className="font-display dark:text-red-300">{incident.error}</div>
        </div>
      ))}
    </div>
  )
}
