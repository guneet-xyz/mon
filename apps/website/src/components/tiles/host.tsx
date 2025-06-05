"use client"

import { StatusDot } from "@/components/status-dot"
import { getMonitorConfig } from "@/lib/server/actions/get-monitor-config"
import { cn } from "@/lib/utils"

import { useQuery } from "@tanstack/react-query"

export function HostTile({
  dbKey,
  r_span,
  c_span,
}: {
  dbKey: string
  r_span: number
  c_span: number
}) {
  const { data: config, isFetched } = useQuery({
    queryKey: ["monitor-config", "host", dbKey],
    queryFn: async () => await getMonitorConfig("host", dbKey),
  })
  if (!isFetched) {
    return <div>loading</div>
  }
  if (!config) {
    throw new Error(`Host tile with key "${dbKey}" not found in configuration.`)
  }
  let title: string
  let description: string | undefined
  const name = config.name ?? config.key

  if (r_span === 1 && c_span === 1) {
    title = name.length > 3 ? name[0]!.toUpperCase() : name
  } else {
    title = config.name ?? config.key
  }

  let orientation: "horizontal" | "vertical" = "horizontal"

  if (c_span == 1 && r_span > 1) {
    orientation = "vertical"
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center rounded-xl border-2 inset-shadow-sm inset-shadow-emerald-500 dark:border-emerald-950/20 dark:bg-emerald-700/25">
      <StatusDot status={"online"} className="absolute top-2 right-2" />
      <div
        className={cn("font-display dark:text-emerald-100", {
          "rotate-90": orientation === "vertical",
        })}
      >
        {title}
      </div>
    </div>
  )
}
