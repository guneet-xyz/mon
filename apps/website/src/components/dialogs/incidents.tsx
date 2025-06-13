"use client"

import { getIncidents } from "@/lib/server/actions/get-incidents"

import type { MonitorTile } from "@mon/config/schema"
import { useQuery } from "@tanstack/react-query"
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"

dayjs.extend(relativeTime)
export function Incidents({
  type,
  dbKey,
}: {
  type: MonitorTile["type"]
  dbKey: string
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["incidents", type, dbKey],
    queryFn: async () => await getIncidents(type, dbKey),
  })

  if (isLoading) {
    return (
      <div className="p-4 font-display text-neutral-500">
        Loading incidents...
      </div>
    )
  }

  if (isError || !data) {
    throw new Error("Failed to load incidents data")
  }

  const incidents = data

  if (incidents.length === 0) {
    return (
      <div className="font-display text-neutral-500">
        No incidents in the last 24 hours.
      </div>
    )
  }

  return (
    <div className="p-4">
      {incidents.map((incident, index) => (
        <div
          key={index}
          className="mb-2 flex flex-col rounded-xl border border-red-700/50 bg-red-900/30 p-4"
        >
          <div className="flex flex-col flex-nowrap items-center justify-between font-display text-sm text-neutral-500 sm:flex-row sm:gap-4">
            <div className="text-left text-xs whitespace-nowrap">
              {`Started ${dayjs(incident.start).fromNow()} and lasted ${dayjs(incident.start).to(incident.end, true)}`}
            </div>
            <div className="text-right text-xs whitespace-nowrap">
              {dayjs(incident.start).format("YYYY-MM-DD HH:mm:ss")} -{" "}
              {dayjs(incident.end).format("YYYY-MM-DD HH:mm:ss")}
            </div>
          </div>
          <div className="text-center font-display sm:text-left dark:text-red-300">
            {incident.error}
          </div>
        </div>
      ))}
    </div>
  )
}
