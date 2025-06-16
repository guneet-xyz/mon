"use client"

import { MonitorDialog } from "@/components/dialogs/monitor-dialog"
import { getMonitorTileInfo } from "@/lib/server/actions/get-monitor-tile-info"

import { BaseTile } from "./_base"
import { LoadingTile } from "./loading"

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
  const { data, isFetched } = useQuery({
    queryKey: ["monitor-config", "host", dbKey],
    queryFn: async () => await getMonitorTileInfo("host", dbKey),
  })
  if (!isFetched || !data) {
    return <LoadingTile r_span={r_span} c_span={c_span} />
  }

  const { config, status } = data

  if (!config) {
    throw new Error(`Host tile with key "${dbKey}" not found in configuration.`)
  }
  let title: string
  const name = config.name ?? config.key

  if (config.short_name) {
    title = config.short_name
  } else if (r_span === 1 && c_span === 1) {
    title = name.length > 3 ? name[0]!.toUpperCase() : name
  } else {
    title = config.name ?? config.key
  }

  let orientation: "horizontal" | "vertical" = "horizontal"

  if (c_span == 1 && r_span > 1) {
    orientation = "vertical"
  }
  return (
    <MonitorDialog dbKey={dbKey} type="host">
      <BaseTile
        r_span={r_span}
        c_span={c_span}
        title={title}
        status={status}
        orientation={orientation}
        icon={config.icon}
        top_right_icon="clarity:host-line"
      />
    </MonitorDialog>
  )
}
