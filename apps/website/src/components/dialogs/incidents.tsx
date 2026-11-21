"use client"

import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"

import type { Incident } from "@/lib/server/monitors"
import type { HistoryRange } from "@/lib/server/monitors/history"

dayjs.extend(relativeTime)
const RANGE_LABEL: Record<HistoryRange, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
}

export function Incidents({
  incidents,
  range,
}: {
  incidents: Incident[]
  range: HistoryRange
}) {
  if (incidents.length === 0) {
    return (
      <div className="font-display text-neutral-600 dark:text-neutral-500">
        No incidents in the last {RANGE_LABEL[range]}.
      </div>
    )
  }

  return (
    <div className="p-4">
      {incidents.map((incident, index) => (
        <div
          key={index}
          className="mb-2 flex flex-col rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-700/50 dark:bg-red-900/30"
        >
          <div className="flex flex-col flex-nowrap items-center justify-between font-display text-sm text-neutral-600 sm:flex-row sm:gap-4 dark:text-neutral-400">
            <div className="text-left text-xs whitespace-nowrap">
              {`Started ${dayjs(incident.start).fromNow()} and lasted ${dayjs(incident.start).to(incident.end, true)}`}
            </div>
            <div className="text-right text-xs whitespace-nowrap">
              {dayjs(incident.start).format("YYYY-MM-DD HH:mm:ss")} -{" "}
              {dayjs(incident.end).format("YYYY-MM-DD HH:mm:ss")}
            </div>
          </div>
          <div className="text-center font-display text-red-900 sm:text-left dark:text-red-300">
            {incident.error}
          </div>
        </div>
      ))}
    </div>
  )
}
