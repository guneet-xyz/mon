"use client"

import { DynamicIcon } from "@/components/dynamic-icon"
import { StatusDot } from "@/components/status-dot"
import { getMonitorTileInfo } from "@/lib/server/actions/get-monitor-tile-info"
import { cn } from "@/lib/utils"

import { useQuery } from "@tanstack/react-query"

export function ContainerTile({
  dbKey,
  r_span,
  c_span,
}: {
  dbKey: string
  r_span: number
  c_span: number
}) {
  const { data, isFetched } = useQuery({
    queryKey: ["monitor-config", "container", dbKey],
    queryFn: async () => await getMonitorTileInfo("container", dbKey),
  })
  if (!isFetched || !data) {
    return <div>loading</div>
  }

  const { config, status } = data
  if (!config) {
    throw new Error(
      `Container tile with key "${dbKey}" not found in configuration.`,
    )
  }
  let title: string
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
    <div className="relative flex h-full w-full items-center justify-center rounded-xl border-2 inset-shadow-sm inset-shadow-emerald-500 transition-colors hover:cursor-pointer dark:border-emerald-950/20 dark:bg-emerald-700/25 dark:hover:bg-emerald-700/50">
      <StatusDot status={status} className="absolute top-2 right-2" />
      {config.icon ? (
        <DynamicIcon icon={config.icon} />
      ) : (
        <div
          className={cn("font-display dark:text-emerald-100", {
            "rotate-90": orientation === "vertical",
          })}
        >
          {title}
        </div>
      )}
    </div>
  )
}
